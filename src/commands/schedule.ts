import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import {
  renderGame,
  renderManagementWeek,
  renderPlayerWeek,
  type ScheduleWeek,
} from '../renderers/schedule.renderer.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';

export async function syncAvailabilityPost(
  guildId: string,
  week: ScheduleWeek,
  context: BotContext,
  client: any,
): Promise<TextChannel | null> {
  const config = await context.config.ensure(guildId);
  if (!config.teamAvailabilityChannelId) return null;
  try {
    const channel = (await client.channels.fetch(
      config.teamAvailabilityChannelId,
    )) as TextChannel | null;
    if (!channel?.isTextBased()) return null;
    if (week.messageId && week.channelId === channel.id) {
      try {
        const msg = await channel.messages.fetch(week.messageId);
        await msg.edit(renderWeeklyAvailability(week));
        return channel;
      } catch {
        const msg = await channel.send(renderWeeklyAvailability(week));
        await context.weeklyAvailability.saveMessage(week.id, channel.id, msg.id);
        return channel;
      }
    } else {
      const msg = await channel.send(renderWeeklyAvailability(week));
      await context.weeklyAvailability.saveMessage(week.id, channel.id, msg.id);
      return channel;
    }
  } catch (err) {
    console.error('Failed to sync weekly availability post:', err);
    return null;
  }
}

export async function handleAddGame(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);

  const opponent = interaction.options.getString('opponent', true);
  const date = interaction.options.getString('date', true);
  const time = interaction.options.getString('time', true);
  const homeAway = (interaction.options.getString('home_away') as 'HOME' | 'AWAY') ?? 'HOME';
  const server = interaction.options.getString('server')?.trim() || undefined;
  const code = interaction.options.getString('code')?.trim() || undefined;
  const weekId = interaction.options.getString('week')?.trim() || undefined;

  const week = await context.schedule.addGame({
    guildId: interaction.guildId,
    weekId,
    opponent,
    date,
    time,
    homeAway,
    server,
    code,
    actorDiscordId: interaction.user.id,
  });

  const postedChannel = await syncAvailabilityPost(
    interaction.guildId,
    week,
    context,
    interaction.client,
  );

  const newGame = week.games[week.games.length - 1];
  const timeUnix = newGame ? Math.floor(newGame.scheduledAtUtc.getTime() / 1000) : null;
  const gameLabel = homeAway === 'AWAY' ? `@ ${opponent}` : `vs ${opponent}`;

  const embed = brandedEmbed()
    .setTitle(`🏒 Game Added: ${gameLabel}`)
    .setDescription(
      timeUnix
        ? `📅 **<t:${timeUnix}:F>** (<t:${timeUnix}:R>)\n🏠 **Matchup:** ${homeAway === 'HOME' ? 'Home' : 'Away'}`
        : `📅 **${date}** at **${time}**`,
    )
    .addFields(
      {
        name: '🎮 Server & Code',
        value:
          server || code
            ? `**Server:** ${server ?? 'TBD'}\n**Code:** ${code ?? 'TBD'}`
            : 'Not set yet (use button below or `/set-code`)',
        inline: true,
      },
      {
        name: '📌 Availability Post',
        value: postedChannel
          ? `<#${postedChannel.id}> (updated)`
          : 'Configure `#team-availability` with `/setup channels`',
        inline: true,
      },
      {
        name: '📋 Total Games This Week',
        value: `${week.games.filter((g) => g.status !== 'CANCELLED').length} games scheduled`,
        inline: true,
      },
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>();
  if (newGame) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(customId('lineup-action', newGame.id, 'build'))
        .setLabel('Build Lineup')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId('game-action', newGame.id, 'set-code'))
        .setLabel('Set Server / Code')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customId('game-action', newGame.id, 'delete'))
        .setLabel('Delete Game')
        .setStyle(ButtonStyle.Danger),
    );
  }

  await interaction.reply({
    ephemeral: true,
    embeds: [embed],
    components: buttons.components.length ? [buttons] : [],
  });
}

export async function handleSetCode(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);

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
  if (week) {
    await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
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
}

export async function handleDeleteGame(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);

  const gameQuery = interaction.options.getString('game', true).trim();
  const currentWeek = await context.schedule.currentWeek(interaction.guildId);
  if (!currentWeek) throw new AppError('NOT_FOUND', 'No active week or games found.');

  const activeGames = currentWeek.games.filter((g) => g.status !== 'CANCELLED');
  let targetGameId: string | undefined;

  const num = parseInt(gameQuery, 10);
  if (!isNaN(num) && num >= 1 && num <= activeGames.length) {
    targetGameId = activeGames[num - 1]?.id;
  } else {
    const found = activeGames.find(
      (g) => g.id === gameQuery || g.opponentNameSnapshot?.toLowerCase() === gameQuery.toLowerCase(),
    );
    targetGameId = found?.id ?? gameQuery;
  }

  if (!targetGameId) {
    throw new AppError('NOT_FOUND', 'Could not find a game matching that number or ID.');
  }

  const updatedWeek = await context.schedule.deleteGame(
    interaction.guildId,
    targetGameId,
    interaction.user.id,
  );
  await syncAvailabilityPost(interaction.guildId, updatedWeek, context, interaction.client);

  await interaction.reply({
    ephemeral: true,
    embeds: [renderSuccess('Game Deleted', 'The game was removed from the schedule.')],
  });
}

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

  if (subcommand === 'code') return handleSetCode(interaction, context);
  if (subcommand === 'add-game') return handleAddGame(interaction, context);
  if (subcommand === 'delete-game') return handleDeleteGame(interaction, context);

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
        : await context.schedule.currentWeek(interaction.guildId);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
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
