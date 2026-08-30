import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { BotContext } from '../commands/context.js';
import { requireManagement } from '../commands/authorization.js';
import { availabilityGameSelector } from '../commands/availability.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { gameOpponentLabel, groupGamesByGuildDay } from '../renderers/schedule.renderer.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';

export async function handleWeeklyAvailabilityButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Submit availability inside the server.');
  const [week, player] = await Promise.all([
    context.weeklyAvailability.getWeek(parsed.entityId),
    context.players.byDiscordId(interaction.guildId, interaction.user.id),
  ]);
  if (!week) throw new AppError('STALE_INTERACTION', 'This availability week no longer exists.');
  if (week.status !== 'OPEN')
    throw new AppError('INVALID_STATE', 'Availability is currently locked.');
  if (!week.games.length)
    throw new AppError('INVALID_STATE', 'No games have been configured for this week.');
  if (parsed.value === 'unavailable') {
    await context.weeklyAvailability.submit({
      guildId: interaction.guildId,
      discordUserId: interaction.user.id,
      weekId: week.id,
      gameIds: [],
    });
    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess(
          'Availability saved',
          'You marked yourself unavailable for every configured game.',
        ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(customId('weekly-availability', week.id, 'edit'))
            .setLabel('Edit Availability')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }
  const existing = week.submissions.find((submission) => submission.playerId === player.id);
  const defaults =
    existing?.responses
      .filter((response) => response.status === 'AVAILABLE')
      .map((response) => response.gameId) ?? [];
  const embed = brandedEmbed()
    .setTitle(`${week.label.toUpperCase()} • YOUR AVAILABILITY`)
    .setDescription(
      'Select every game you are available for. Unselected games will be saved as unavailable.',
    );
  for (const group of groupGamesByGuildDay(
    week.games.filter((game) => game.status !== 'CANCELLED'),
    week.guildConfig.timezone,
  )) {
    embed.addFields({
      name: group.day.toUpperCase(),
      value: group.games
        .map((game) => `${gameOpponentLabel(game)} • ${discordTimestamp(game.scheduledAtUtc, 'F')}`)
        .join('\n'),
    });
  }
  await interaction.reply({
    ephemeral: true,
    embeds: [embed],
    components: [availabilityGameSelector(week.id, week.games, defaults)],
  });
}

export async function handleAvailabilityReminderButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  await interaction.deferReply({ ephemeral: true });
  const [week, missing] = await Promise.all([
    context.weeklyAvailability.getWeek(parsed.entityId),
    context.weeklyAvailability.missing(parsed.entityId),
  ]);
  if (!week) throw new AppError('NOT_FOUND', 'Week not found.');
  const scheduledFor = new Date();
  scheduledFor.setSeconds(0, 0);
  let sent = 0;
  for (const player of missing) {
    const claim = await context.prisma.weeklyAvailabilityReminder.upsert({
      where: {
        weekId_playerId_kind_scheduledFor: {
          weekId: week.id,
          playerId: player.id,
          kind: 'MANUAL',
          scheduledFor,
        },
      },
      create: { weekId: week.id, playerId: player.id, kind: 'MANUAL', scheduledFor },
      update: {},
    });
    if (claim.sentAt || claim.failedAt) continue;
    const delivered = await context.notifications.availabilityReminder(
      player.discordUserId,
      week,
      player.teamStatus === 'ROSTER' ? 'required' : 'encouraged',
    );
    await context.prisma.weeklyAvailabilityReminder.update({
      where: { id: claim.id },
      data: delivered ? { sentAt: new Date() } : { failedAt: new Date() },
    });
    if (delivered) sent++;
  }
  await interaction.editReply({
    embeds: [
      renderSuccess(
        'Reminders sent',
        `Delivered **${sent}** DM(s) to players who still have no response.`,
      ),
    ],
  });
}

export async function handleWeeklyAvailabilitySelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Submit availability inside the server.');
  const submission = await context.weeklyAvailability.submit({
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
    weekId: parsed.entityId,
    gameIds: interaction.values,
  });
  if (!submission) throw new AppError('NOT_FOUND', 'Availability submission was not saved.');
  const available = submission.responses.filter((response) => response.status === 'AVAILABLE');
  const unavailable = submission.responses.filter((response) => response.status === 'UNAVAILABLE');
  const rows = (responses: typeof submission.responses) =>
    responses
      .map(
        (response) =>
          `${gameOpponentLabel(response.game)} • ${discordTimestamp(response.game.scheduledAtUtc, 'F')}`,
      )
      .join('\n') || 'None';
  await interaction.update({
    content: '',
    embeds: [
      renderSuccess(
        'Availability saved',
        `**AVAILABLE**\n${rows(available)}\n\n**UNAVAILABLE**\n${rows(unavailable)}`,
      ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId('weekly-availability', parsed.entityId, 'edit'))
          .setLabel('Edit Availability')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}
