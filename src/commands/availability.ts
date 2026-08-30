import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { PositionGroup, TeamStatus, WeeklyGame } from '../generated/prisma/client.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import {
  renderManagementWeek,
  renderPlayerWeek,
  gameOpponentLabel,
} from '../renderers/schedule.renderer.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { customId } from '../utils/custom-id.js';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';

function filterFrom(value: string | null) {
  const teamStatus: TeamStatus | undefined =
    value === 'roster' ? 'ROSTER' : value === 'tc' ? 'TC' : undefined;
  const positionGroup: PositionGroup | undefined =
    value === 'forwards'
      ? 'FORWARD'
      : value === 'defense'
        ? 'DEFENSE'
        : value === 'goalies'
          ? 'GOALIE'
          : undefined;
  return { ...(teamStatus ? { teamStatus } : {}), ...(positionGroup ? { positionGroup } : {}) };
}

export async function handleAvailability(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Use availability inside the server.');
  const subcommand = interaction.options.getSubcommand();
  const week = await resolveWeek(interaction, context);
  if (subcommand === 'mine') {
    const player = await context.players.byDiscordId(interaction.guildId, interaction.user.id);
    await interaction.reply({ ephemeral: true, ...renderPlayerWeek(week, player.id) });
    return;
  }
  if (subcommand === 'state') {
    await requireManagement(interaction, context);
    const status = interaction.options.getString('status', true) as 'OPEN' | 'LOCKED' | 'CLOSED';
    const updated = await context.weeklyAvailability.setState(week.id, status, interaction.user.id);
    await refreshAvailabilityPost(interaction, updated);
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Availability updated', `**${updated.label}** is now **${status}**.`)],
    });
    return;
  }
  if (subcommand === 'set-player') {
    await requireManagement(interaction, context);
    const player = (
      await context.players.search(
        interaction.guildId,
        interaction.options.getString('player', true),
      )
    )[0];
    if (!player) throw new AppError('NOT_FOUND', 'Player not found.');
    const raw = interaction.options.getString('games', true).trim().toLowerCase();
    const numbers = ['none', 'unavailable'].includes(raw)
      ? []
      : raw.split(',').map((item) => Number(item.trim()));
    if (numbers.some((number) => !Number.isInteger(number) || number < 1))
      throw new AppError('INVALID_INPUT', 'Use comma-separated game numbers, or `none`.');
    const active = week.games.filter((game) => game.status !== 'CANCELLED');
    const gameIds = numbers
      .map((number) => active[number - 1]?.id)
      .filter((id): id is string => Boolean(id));
    if (gameIds.length !== new Set(numbers).size)
      throw new AppError('INVALID_INPUT', 'Use game numbers shown in the weekly post.');
    await context.weeklyAvailability.submit({
      guildId: interaction.guildId,
      discordUserId: player.discordUserId,
      weekId: week.id,
      gameIds,
      actorDiscordId: interaction.user.id,
      managementOverride: true,
    });
    await context.notifications.availabilityEdited(player.discordUserId, week.label);
    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess(
          'Availability updated',
          `${player.eaTag}: ${gameIds.length ? `${gameIds.length} available` : 'unavailable for all'}.`,
        ),
      ],
    });
    return;
  }
  await requireManagement(interaction, context);
  if (subcommand === 'manage') {
    await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
    return;
  }
  const summary = await context.weeklyAvailability.summary(
    week.id,
    filterFrom(interaction.options.getString('filter')),
  );
  const remind = interaction.options.getBoolean('remind') ?? false;
  let sent = 0;
  if (remind) {
    await interaction.deferReply({ ephemeral: true });
    const scheduledFor = new Date();
    scheduledFor.setSeconds(0, 0);
    for (const player of summary.missing) {
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
  }
  const grouped = (['ROSTER', 'TC'] as const).map((status) => {
    const players = summary.missing.filter((player) => player.teamStatus === status);
    return {
      name: `${status} • ${players.length}`,
      value:
        players
          .map((player) => `<@${player.discordUserId}> • ${player.positionGroup}`)
          .join('\n') || 'None',
    };
  });
  const response = {
    embeds: [
      brandedEmbed()
        .setTitle(`NO RESPONSE • ${week.label}`)
        .setDescription(
          `Only players missing at least one active-game response appear here.${remind ? `\n\nSent **${sent}** reminder DM(s).` : ''}`,
        )
        .addFields(grouped),
    ],
    components:
      !remind && summary.missing.length
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(customId('availability-remind', week.id))
                .setLabel('Remind No Response')
                .setStyle(ButtonStyle.Primary),
            ),
          ]
        : [],
  };
  if (interaction.deferred) await interaction.editReply(response);
  else await interaction.reply({ ephemeral: true, ...response });
}

export async function publishAvailability(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  context: BotContext,
  weekId: string,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const { config } = await requireManagement(interaction, context);
  if (!config.teamAvailabilityChannelId)
    throw new AppError(
      'NOT_CONFIGURED',
      'Configure the availability channel with `/setup channels`.',
    );
  const week = await context.weeklyAvailability.setState(weekId, 'OPEN', interaction.user.id);
  const channel = (await interaction.client.channels.fetch(
    config.teamAvailabilityChannelId,
  )) as TextChannel | null;
  if (!channel?.isTextBased() || channel.isDMBased())
    throw new AppError('NOT_FOUND', 'The availability channel is unavailable.');
  let message;
  if (week.messageId && week.channelId === channel.id) {
    try {
      message = await channel.messages.fetch(week.messageId);
      await message.edit(renderWeeklyAvailability(week));
    } catch {
      message = await channel.send(renderWeeklyAvailability(week));
    }
  } else message = await channel.send(renderWeeklyAvailability(week));
  await context.weeklyAvailability.saveMessage(week.id, channel.id, message.id);
  return channel.id;
}

async function refreshAvailabilityPost(
  interaction: ChatInputCommandInteraction,
  week: Awaited<ReturnType<BotContext['weeklyAvailability']['setState']>>,
) {
  if (!week.channelId || !week.messageId) return;
  try {
    const channel = (await interaction.client.channels.fetch(week.channelId)) as TextChannel;
    await (await channel.messages.fetch(week.messageId)).edit(renderWeeklyAvailability(week));
  } catch {
    /* A later publish repairs a deleted post. */
  }
}

async function resolveWeek(interaction: ChatInputCommandInteraction, context: BotContext) {
  const explicit = interaction.options.getString('week');
  const week = explicit
    ? await context.weeklyAvailability.getWeek(explicit)
    : await context.weeklyAvailability.current(interaction.guildId!);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found. Use `/week setup`.');
  if (week.guildConfig.guildId !== interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'That week belongs to another server.');
  return week;
}

export function availabilityGameSelector(weekId: string, games: WeeklyGame[], defaults: string[]) {
  const active = games.filter((game) => game.status !== 'CANCELLED');
  if (!active.length) throw new AppError('INVALID_STATE', 'No active games are configured.');
  if (active.length > 25)
    throw new AppError('INVALID_STATE', 'This week exceeds Discord’s 25-game selector limit.');
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('weekly-availability-select', weekId))
      .setPlaceholder('Select every game you can play')
      .setMinValues(1)
      .setMaxValues(active.length)
      .addOptions(
        active.map((game) => ({
          label: gameOpponentLabel(game).slice(0, 100),
          description: `${discordTimestamp(game.scheduledAtUtc, 'F')} • ${game.status}`.slice(
            0,
            100,
          ),
          value: game.id,
          default: defaults.includes(game.id),
        })),
      ),
  );
}
