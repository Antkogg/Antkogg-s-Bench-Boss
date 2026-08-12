import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { ScoutingPosition, SignupPosition } from '../generated/prisma/enums.js';
import { renderSuccess } from '../renderers/design.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import type { BotContext } from '../commands/context.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';

function textInput(
  customIdValue: string,
  label: string,
  placeholder: string,
  maxLength: number,
  style = TextInputStyle.Short,
) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(customIdValue)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setMaxLength(maxLength)
      .setStyle(style)
      .setRequired(true),
  );
}

export async function showRegistrationModal(interaction: ButtonInteraction): Promise<void> {
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(customId('modal-register', interaction.guildId ?? 'dm'))
      .setTitle('Bench Boss Registration')
      .addComponents(
        textInput('lgUsername', 'LG username', 'Your exact Leaguegaming username', 32),
        textInput('eaTag', 'Exact EA Tag', 'Capitalization and spaces matter', 32),
        textInput('position', 'LG signup position', 'LW, C, RW/F, LD, RD, or G', 4),
      ),
  );
}

export async function handleRegistrationModal(
  interaction: ModalSubmitInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Register inside the server.');
  const rawPosition = interaction.fields
    .getTextInputValue('position')
    .trim()
    .toUpperCase()
    .replace('/', '_');
  if (!['LW', 'C', 'RW_F', 'LD', 'RD', 'G'].includes(rawPosition)) {
    throw new AppError('INVALID_INPUT', 'LG position must be LW, C, RW/F, LD, RD, or G.');
  }
  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const player = await context.players.register({
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
    discordDisplayName: member.displayName,
    discordAvatarUrl: interaction.user.displayAvatarURL(),
    lgUsername: interaction.fields.getTextInputValue('lgUsername'),
    eaTag: interaction.fields.getTextInputValue('eaTag'),
    signupPosition: rawPosition as SignupPosition,
  });
  const config = await context.config.ensure(interaction.guildId);
  await context.roles.sync(member, player, config);
  await interaction.editReply({
    embeds: [
      renderSuccess(
        'Registration complete',
        `Welcome to Bench Boss, **${player.eaTag}**.\nYour scouting buttons are ready.`,
      ),
    ],
  });
}

export async function showManagementModal(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  parsed: ParsedCustomId,
): Promise<void> {
  const kind = parsed.value ?? 'edit';
  const modal = new ModalBuilder()
    .setCustomId(customId('modal-manage', parsed.entityId, kind))
    .setTitle('Bench Boss Management');
  if (kind === 'add') {
    modal.addComponents(
      textInput('player', 'Player Discord ID or exact EA Tag', 'Searchable registered player', 40),
      textInput('position', 'Position', 'LW, C, RW, LD, RD, or G', 2),
      textInput('overrides', 'Overrides (optional)', 'ELIGIBILITY, CONFLICT, BOTH, or NONE', 20),
    );
  } else if (kind === 'move') {
    modal.addComponents(
      textInput('player', 'Player Discord ID or exact EA Tag', 'Player already in this lineup', 40),
      textInput('position', 'New position', 'LW, C, RW, LD, RD, or G', 2),
    );
  } else if (kind === 'remove') {
    modal.addComponents(
      textInput('player', 'Player Discord ID or exact EA Tag', 'Player already in this lineup', 40),
    );
  } else if (kind === 'swap') {
    modal.addComponents(
      textInput('first', 'First player', 'Discord ID or exact EA Tag', 40),
      textInput('second', 'Second player', 'Discord ID or exact EA Tag', 40),
    );
  } else if (kind === 'note') {
    modal.addComponents(
      textInput(
        'body',
        'Private management note',
        'Only management can see this',
        2000,
        TextInputStyle.Paragraph,
      ),
    );
  } else if (kind === 'evaluate') {
    modal.addComponents(
      textInput('ratings', 'O / OFF / DEF / IQ / PUCK / COMMS', 'Example: 4,4,5,4,3,5', 20),
      textInput(
        'body',
        'Private evaluation note',
        'Only management can see this',
        1000,
        TextInputStyle.Paragraph,
      ),
    );
  } else if (kind === 'attendance') {
    modal.addComponents(
      textInput('session', 'Session ID', 'Copy from player history or management panel', 40),
      textInput('status', 'Attendance status', 'PLAYED, NO_SHOW, EXCUSED, or CANCELLED', 10),
    );
  }
  await interaction.showModal(modal);
}

function parseScoutingPosition(value: string): ScoutingPosition {
  const position = value.trim().toUpperCase();
  if (!['LW', 'C', 'RW', 'LD', 'RD', 'G'].includes(position))
    throw new AppError('INVALID_INPUT', 'Position must be LW, C, RW, LD, RD, or G.');
  return position as ScoutingPosition;
}

export async function handleManagementModal(
  interaction: ModalSubmitInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Use management controls inside the server.');
  if (!interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use management controls inside the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!hasManagementAccess(accessLevel(member, config.managementRoleId)))
    throw new AppError('NOT_ALLOWED', 'This action is private to Bench Boss management.');
  const kind = parsed.value;
  if (!kind) throw new AppError('INVALID_INPUT', 'Management action is missing.');
  if (kind === 'note') {
    await context.evaluations.addNote(
      parsed.entityId,
      interaction.user.id,
      interaction.fields.getTextInputValue('body'),
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess('Private note saved', 'The note is visible only in management views.'),
      ],
    });
    return;
  }
  if (kind === 'evaluate') {
    const ratings = interaction.fields
      .getTextInputValue('ratings')
      .split(',')
      .map((value) => Number(value.trim()));
    if (ratings.length !== 6 || ratings.some((value) => !Number.isInteger(value)))
      throw new AppError('INVALID_INPUT', 'Enter six comma-separated ratings from 1 to 5.');
    await context.evaluations.evaluate({
      playerId: parsed.entityId,
      evaluatorDiscordId: interaction.user.id,
      overall: ratings[0]!,
      offense: ratings[1]!,
      defense: ratings[2]!,
      hockeyIq: ratings[3]!,
      puckMovement: ratings[4]!,
      communication: ratings[5]!,
      privateNote: interaction.fields.getTextInputValue('body'),
    });
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Evaluation saved', 'This evaluation remains private to management.')],
    });
    return;
  }
  if (kind === 'attendance') {
    const status = interaction.fields.getTextInputValue('status').trim().toUpperCase();
    if (!['PLAYED', 'NO_SHOW', 'EXCUSED', 'CANCELLED'].includes(status))
      throw new AppError(
        'INVALID_INPUT',
        'Attendance must be PLAYED, NO_SHOW, EXCUSED, or CANCELLED.',
      );
    await context.attendance.record(
      interaction.fields.getTextInputValue('session').trim(),
      parsed.entityId,
      status as Parameters<typeof context.attendance.record>[2],
      interaction.user.id,
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Attendance recorded', `Attendance is marked **${status}**.`)],
    });
    return;
  }
  const query =
    kind === 'swap'
      ? interaction.fields.getTextInputValue('first')
      : interaction.fields.getTextInputValue('player');
  const players = await context.players.search(interaction.guildId, query);
  const player = players[0];
  if (!player) throw new AppError('NOT_FOUND', 'No matching registered player was found.');
  await interaction.deferReply({ ephemeral: true });
  const sessionBefore = await context.scouting.get(parsed.entityId);
  if (!sessionBefore) throw new AppError('NOT_FOUND', 'Scouting session not found.');
  const affectedUserIds = [player.discordUserId];
  if (kind === 'add') {
    const overrides = interaction.fields.getTextInputValue('overrides').trim().toUpperCase();
    await context.scouting.signup({
      guildId: interaction.guildId,
      discordUserId: player.discordUserId,
      sessionId: parsed.entityId,
      position: parseScoutingPosition(interaction.fields.getTextInputValue('position')),
      eligibilityOverride: ['ELIGIBILITY', 'BOTH'].includes(overrides),
      conflictOverride: ['CONFLICT', 'BOTH'].includes(overrides),
      actorDiscordId: interaction.user.id,
    });
  } else if (kind === 'move') {
    await context.scouting.switchPosition({
      guildId: interaction.guildId,
      discordUserId: player.discordUserId,
      sessionId: parsed.entityId,
      position: parseScoutingPosition(interaction.fields.getTextInputValue('position')),
      eligibilityOverride: true,
      actorDiscordId: interaction.user.id,
    });
  } else if (kind === 'remove') {
    await context.scouting.leave(interaction.guildId, player.discordUserId, parsed.entityId, true);
  } else if (kind === 'swap') {
    const others = await context.players.search(
      interaction.guildId,
      interaction.fields.getTextInputValue('second'),
    );
    const second = others[0];
    if (!second) throw new AppError('NOT_FOUND', 'The second player was not found.');
    affectedUserIds.push(second.discordUserId);
    const firstAssignment = sessionBefore.assignments.find((entry) => entry.playerId === player.id);
    const secondAssignment = sessionBefore.assignments.find(
      (entry) => entry.playerId === second.id,
    );
    if (!firstAssignment || !secondAssignment)
      throw new AppError('NOT_FOUND', 'Both players must already be in the lineup.');
    await context.prisma.$transaction([
      context.prisma.scoutingAssignment.update({
        where: { id: firstAssignment.id },
        data: { slotIndex: 99 },
      }),
      context.prisma.scoutingAssignment.update({
        where: { id: secondAssignment.id },
        data: { team: firstAssignment.team, position: firstAssignment.position },
      }),
      context.prisma.scoutingAssignment.update({
        where: { id: firstAssignment.id },
        data: { team: secondAssignment.team, position: secondAssignment.position, slotIndex: 0 },
      }),
    ]);
  }
  const sessionAfter = await context.scouting.get(parsed.entityId);
  if (!sessionAfter) throw new AppError('NOT_FOUND', 'Scouting session not found.');
  for (const userId of affectedUserIds) {
    const before = sessionBefore.assignments.find(
      (assignment) => assignment.player.discordUserId === userId,
    );
    const after = sessionAfter.assignments.find(
      (assignment) => assignment.player.discordUserId === userId,
    );
    if (!before && after)
      await context.notifications.signup(userId, sessionAfter, after.position, after.player.eaTag);
    else if (before && !after)
      await context.notifications.removed(userId, sessionBefore, 'Management updated the lineup.');
    else if (before && after && (before.position !== after.position || before.team !== after.team))
      await context.notifications.positionChanged(
        userId,
        sessionAfter,
        before.position,
        after.position,
      );
  }
  await context.posts.queueRefresh(parsed.entityId);
  await interaction.editReply({
    embeds: [renderSuccess('Lineup updated', 'The canonical scouting post has been refreshed.')],
  });
}
