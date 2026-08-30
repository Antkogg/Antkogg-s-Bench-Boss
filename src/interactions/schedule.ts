import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
} from 'discord.js';
import { DateTime } from 'luxon';
import type {
  HomeAway,
  ScheduleDay,
  ScoutingPosition,
  WeeklyGameStatus,
} from '../generated/prisma/client.js';
import { localWeekday } from '../domain/schedule-time.js';
import { publishAvailability } from '../commands/availability.js';
import { requireManagement } from '../commands/authorization.js';
import type { BotContext } from '../commands/context.js';
import { renderGame, renderManagementWeek } from '../renderers/schedule.renderer.js';
import { renderSuccess } from '../renderers/design.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';

const POSITIONS: ScoutingPosition[] = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];

export async function handleWeekButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  if (parsed.value === 'publish') {
    const channelId = await publishAvailability(interaction, context, parsed.entityId);
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Availability published', `Posted or refreshed in <#${channelId}>.`)],
    });
    return;
  }
  if (parsed.value === 'lock' || parsed.value === 'reopen') {
    const updated = await context.weeklyAvailability.setState(
      parsed.entityId,
      parsed.value === 'lock' ? 'LOCKED' : 'OPEN',
      interaction.user.id,
    );
    if (updated.channelId && updated.messageId) {
      try {
        const channel = (await interaction.client.channels.fetch(updated.channelId)) as TextChannel;
        await (
          await channel.messages.fetch(updated.messageId)
        ).edit(renderWeeklyAvailability(updated));
      } catch {
        /* Publishing again repairs a missing post. */
      }
    }
    const week = await context.schedule.getWeek(parsed.entityId);
    if (!week) throw new AppError('NOT_FOUND', 'Week not found.');
    await interaction.update(renderManagementWeek(week));
    return;
  }
  if (parsed.value?.startsWith('edit-')) {
    const day = parsed.value.slice(5) as Exclude<ScheduleDay, 'OTHER'>;
    const [week, timezone] = await Promise.all([
      context.schedule.getWeek(parsed.entityId),
      context.schedule.managementTimezone(interaction.guildId, interaction.user.id),
    ]);
    if (!week) throw new AppError('NOT_FOUND', 'Week not found.');
    const games = week.games.filter((game) => localWeekday(game.scheduledAtUtc, timezone) === day);
    if (!games.length) throw new AppError('NOT_FOUND', `No ${day.toLowerCase()} slots exist.`);
    const value = games
      .map(
        (game) =>
          `${game.opponentNameSnapshot ?? 'TBD'} | ${game.homeAway ?? 'HOME'} | ${DateTime.fromJSDate(game.scheduledAtUtc).setZone(timezone).toFormat('h:mm a')}`,
      )
      .join('\n');
    const input = new TextInputBuilder()
      .setCustomId('games')
      .setLabel('Opponent | HOME/AWAY | time')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(value);
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(customId('modal-week-day', parsed.entityId, day))
        .setTitle(`Edit ${day[0]}${day.slice(1).toLowerCase()}`)
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
    );
  }
}

export async function handleWeekDayModal(
  interaction: ModalSubmitInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId || !parsed.value)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  const entries = interaction.fields
    .getTextInputValue('games')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [rawOpponent, rawHomeAway, rawTime] = line.split('|').map((value) => value.trim());
      const opponent = !rawOpponent || rawOpponent.toUpperCase() === 'TBD' ? null : rawOpponent;
      const normalizedHomeAway = rawHomeAway?.toUpperCase();
      if (normalizedHomeAway !== 'HOME' && normalizedHomeAway !== 'AWAY')
        throw new AppError('INVALID_INPUT', `Use HOME or AWAY in: ${line}`);
      const homeAway: HomeAway = normalizedHomeAway;
      return { opponent, homeAway, ...(rawTime ? { time: rawTime } : {}) };
    });
  const week = await context.schedule.updateDay(
    interaction.guildId,
    parsed.entityId,
    parsed.value as Exclude<ScheduleDay, 'OTHER'>,
    entries,
    interaction.user.id,
  );
  await refreshWeekPost(interaction, week);
  await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
}

export async function handleWeekGameSelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
) {
  await requireManagement(interaction, context);
  const game = await context.schedule.game(interaction.values[0]!);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
  await interaction.update(renderGame(game, true));
}

export async function handleLineupButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  if (parsed.value === 'confirm') {
    const result = await context.schedule.confirmLineup(
      interaction.guildId,
      parsed.entityId,
      interaction.user.id,
    );
    const game = await context.schedule.game(parsed.entityId);
    if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
    const delivered: string[] = [];
    for (const assignment of result.newlyConfirmed) {
      const sent = await context.notifications.lineupConfirmed(
        assignment.player.discordUserId,
        game,
        assignment.position,
      );
      if (sent) delivered.push(assignment.id);
    }
    await context.schedule.markConfirmationNotified(delivered);
    await interaction.update(renderGame(game, true));
    return;
  }
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('lineup-position-select', parsed.entityId))
      .setPlaceholder('Choose a lineup position')
      .addOptions(POSITIONS.map((position) => ({ label: position, value: position }))),
  );
  await interaction.reply({
    ephemeral: true,
    content: 'Choose the position to fill or edit.',
    components: [row],
  });
}

export async function handleLineupPositionSelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  const position = interaction.values[0] as ScoutingPosition;
  const candidates = await context.schedule.lineupCandidates(
    interaction.guildId,
    interaction.customId.split(':')[2]!,
    position,
  );
  if (!candidates.length)
    throw new AppError('NOT_FOUND', `No eligible ${position} players were found.`);
  const gameId = interaction.customId.split(':')[2]!;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('lineup-player-select', gameId, position))
    .setPlaceholder(`Select ${position}`)
    .addOptions(
      { label: `Clear ${position}`, value: 'CLEAR', description: 'Remove the current assignment' },
      ...candidates.slice(0, 24).map(({ player, availability }) => ({
        label: player.eaTag.slice(0, 100),
        value: player.id,
        description: `${availability} • ${player.teamStatus}`.slice(0, 100),
      })),
    );
  await interaction.update({
    content: `Select **${position}**. Available players are listed first.`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

export async function handleLineupPlayerSelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId || !parsed.value)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  const position = parsed.value as ScoutingPosition;
  let warning = '';
  if (interaction.values[0] === 'CLEAR') {
    const removed = await context.schedule.clearLineupPosition(
      interaction.guildId,
      parsed.entityId,
      position,
      interaction.user.id,
    );
    if (removed?.confirmed)
      await context.notifications.lineupRemoved(
        removed.player.discordUserId,
        await context.schedule.game(parsed.entityId),
        position,
      );
  } else {
    const result = await context.schedule.assignLineupPosition({
      guildId: interaction.guildId,
      gameId: parsed.entityId,
      playerId: interaction.values[0]!,
      position,
      actorDiscordId: interaction.user.id,
    });
    if (result.removed?.confirmed)
      await context.notifications.lineupRemoved(
        result.removed.player.discordUserId,
        await context.schedule.game(parsed.entityId),
        position,
      );
    if (result.movedConfirmed)
      await context.notifications.lineupRemoved(
        result.movedConfirmed.player.discordUserId,
        await context.schedule.game(parsed.entityId),
        result.movedConfirmed.position,
      );
    if (result.assignment.availabilityOverride)
      warning = `\n⚠️ ${result.assignment.player.eaTag} was ${result.availability}; this override was audited.`;
  }
  const game = await context.schedule.game(parsed.entityId);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
  await interaction.update({ content: `Lineup updated.${warning}`, ...renderGame(game, true) });
}

export async function handleGameButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  await requireManagement(interaction, context);
  const game = await context.schedule.game(parsed.entityId);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
  const make = (id: string, label: string, value?: string) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(80)
      .setRequired(true);
    if (value) input.setValue(value);
    return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  };
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(customId('modal-game-code', game.id))
      .setTitle('Set Server / Game Code')
      .addComponents(
        make('server', 'Server', game.gameServer ?? undefined),
        make('code', 'Game code', game.gameCode ?? undefined),
      ),
  );
}

export async function handlePlayerGameButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  const game = await context.schedule.game(parsed.entityId);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
  const assignment = game.lineup.find(
    (entry) => entry.confirmed && entry.player.discordUserId === interaction.user.id,
  );
  if (!assignment)
    throw new AppError('NOT_ALLOWED', 'You are not confirmed for this game anymore.');
  await interaction.reply({
    ...(interaction.inGuild() ? { ephemeral: true as const } : {}),
    ...renderGame(game, false, assignment.playerId),
  });
}

export async function handleGameCodeModal(
  interaction: ModalSubmitInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const { config } = await requireManagement(interaction, context);
  const game = await context.schedule.setServerCode({
    guildId: interaction.guildId,
    gameId: parsed.entityId,
    server: interaction.fields.getTextInputValue('server'),
    code: interaction.fields.getTextInputValue('code'),
    actorDiscordId: interaction.user.id,
  });
  const delivered: string[] = [];
  if (config.notifyConfirmedGameInfo)
    for (const assignment of game.lineup) {
      const sent = await context.notifications.gameInfoReady(
        assignment.player.discordUserId,
        game,
        assignment.position,
      );
      if (sent) delivered.push(assignment.id);
    }
  await context.schedule.markGameInfoNotified(delivered);
  await interaction.reply({
    ephemeral: true,
    embeds: [
      renderSuccess(
        'Game details saved',
        config.notifyConfirmedGameInfo
          ? 'Confirmed-player notifications were queued; temporary failures will retry automatically.'
          : 'Confirmed players can now use `/game`.',
      ),
    ],
  });
}

export async function handleGameStatusSelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  await context.schedule.setGameStatus(
    interaction.guildId,
    parsed.entityId,
    interaction.values[0] as WeeklyGameStatus,
    interaction.user.id,
  );
  const game = await context.schedule.game(parsed.entityId);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');
  for (const assignment of game.lineup.filter((entry) => entry.confirmed))
    await context.notifications.regularGameStatus(assignment.player.discordUserId, game);
  const week = await context.schedule.getWeek(game.weekId);
  if (week) await refreshWeekPost(interaction, week);
  await interaction.update(renderGame(game, true));
}

async function refreshWeekPost(
  interaction: ModalSubmitInteraction | StringSelectMenuInteraction,
  week: Awaited<ReturnType<BotContext['schedule']['getWeek']>>,
) {
  if (!week?.channelId || !week.messageId) return;
  try {
    const channel = (await interaction.client.channels.fetch(week.channelId)) as TextChannel;
    await (await channel.messages.fetch(week.messageId)).edit(renderWeeklyAvailability(week));
  } catch {
    /* Publishing again repairs a missing post. */
  }
}
