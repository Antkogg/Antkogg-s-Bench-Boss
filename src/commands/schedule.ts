import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import {
  renderGame,
  renderManagementWeek,
  renderPlayerWeek,
} from '../renderers/schedule.renderer.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';

export async function handleTimezone(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  if (interaction.options.getSubcommand() === 'set') {
    const timezone = interaction.options.getString('timezone', true);
    await context.schedule.setManagementTimezone(
      interaction.guildId,
      interaction.user.id,
      timezone,
      interaction.user.id,
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess(
          'Timezone saved',
          `Schedule times you enter will be interpreted as **${timezone}**.`,
        ),
      ],
    });
  } else {
    const timezone = await context.schedule.managementTimezone(
      interaction.guildId,
      interaction.user.id,
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Management timezone', timezone)],
    });
  }
}

export async function handleWeek(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'code') {
    const server = interaction.options.getString('server', true);
    const code = interaction.options.getString('code', true);
    const gameQuery = interaction.options.getString('game')?.trim();
    let targetGameId: string | undefined;

    if (gameQuery) {
      const currentWeek = await context.schedule.currentWeek(interaction.guildId);
      const activeGames = currentWeek?.games.filter((g) => g.status !== 'CANCELLED') ?? [];
      const num = parseInt(gameQuery, 10);
      if (!isNaN(num) && num >= 1 && num <= activeGames.length) {
        targetGameId = activeGames[num - 1]?.id;
      } else {
        targetGameId = gameQuery;
      }
    } else {
      const nearest = await context.schedule.nearestGame(interaction.guildId);
      targetGameId = nearest?.id;
    }

    if (!targetGameId) {
      throw new AppError(
        'NOT_FOUND',
        'No game found to set server and code for. Specify a game number or ID.',
      );
    }

    const config = await context.config.ensure(interaction.guildId);
    const updatedGame = await context.schedule.setServerCode({
      guildId: interaction.guildId,
      gameId: targetGameId,
      server,
      code,
      actorDiscordId: interaction.user.id,
    });

    const delivered: string[] = [];
    if (config.notifyConfirmedGameInfo) {
      for (const assignment of updatedGame.lineup) {
        const sent = await context.notifications.gameInfoReady(
          assignment.player.discordUserId,
          updatedGame,
          assignment.position,
        );
        if (sent) delivered.push(assignment.id);
      }
    }
    await context.schedule.markGameInfoNotified(delivered);

    const week = await context.schedule.getWeek(updatedGame.weekId);
    if (week?.channelId && week.messageId) {
      try {
        const channel = (await interaction.client.channels.fetch(
          week.channelId,
        )) as TextChannel | null;
        if (channel?.isTextBased()) {
          const msg = await channel.messages.fetch(week.messageId);
          await msg.edit(renderWeeklyAvailability(week));
        }
      } catch {
        /* Silently ignore */
      }
    }

    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess(
          'Server & Code Saved',
          `**${updatedGame.opponentNameSnapshot ?? 'Upcoming Game'}**\n` +
            `**Server:** ${server}\n**Code:** ${code}\n\n` +
            (config.notifyConfirmedGameInfo
              ? 'Confirmed lineup players were notified via DM.'
              : 'Confirmed players can now use `/game`.'),
        ),
      ],
    });
    return;
  }

  const week =
    subcommand === 'setup'
      ? await context.schedule.createWeek({
          guildId: interaction.guildId,
          seasonNumber: interaction.options.getInteger('season', true),
          weekNumber: interaction.options.getInteger('week', true),
          ...(interaction.options.getString('sunday')
            ? { sundayDate: interaction.options.getString('sunday')! }
            : {}),
          actorDiscordId: interaction.user.id,
        })
      : subcommand === 'next'
        ? await context.schedule.createNextWeek(interaction.guildId, interaction.user.id)
        : subcommand === 'add-game'
          ? await context.schedule.addGame({
              guildId: interaction.guildId,
              weekId: interaction.options.getString('week') ?? undefined,
              opponent: interaction.options.getString('opponent', true),
              date: interaction.options.getString('date', true),
              time: interaction.options.getString('time', true),
              homeAway: (interaction.options.getString('home_away') as 'HOME' | 'AWAY') ?? 'HOME',
              actorDiscordId: interaction.user.id,
            })
          : await context.schedule.currentWeek(interaction.guildId);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
  if (subcommand === 'add-game' && week.channelId && week.messageId) {
    try {
      const channel = (await interaction.client.channels.fetch(
        week.channelId,
      )) as TextChannel | null;
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(week.messageId);
        await msg.edit(renderWeeklyAvailability(week));
      }
    } catch {
      /* Silently ignore message edit failures */
    }
  }
  await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
}

export async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const [week, config, member] = await Promise.all([
    context.schedule.currentWeek(interaction.guildId),
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
  if (hasManagementAccess(accessLevel(member, config))) {
    await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
    return;
  }
  const player = await context.players.byDiscordId(
    interaction.guildId,
    interaction.user.id,
    interaction.user.displayName ?? interaction.user.username,
    interaction.user.displayAvatarURL(),
  );
  await interaction.reply({ ephemeral: true, ...renderPlayerWeek(week, player.id) });
}

export async function handleGame(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  const management = hasManagementAccess(accessLevel(member, config));
  const player = management
    ? null
    : await context.players.byDiscordId(
        interaction.guildId,
        interaction.user.id,
        interaction.user.displayName ?? interaction.user.username,
        interaction.user.displayAvatarURL(),
      );
  const game = await context.schedule.nearestGame(interaction.guildId, player?.id);
  if (!game)
    throw new AppError(
      'NOT_FOUND',
      management ? 'No upcoming game was found.' : 'You do not have an upcoming confirmed game.',
    );
  await interaction.reply({ ephemeral: true, ...renderGame(game, management, player?.id) });
}
