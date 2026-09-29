import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { DateTime } from 'luxon';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import {
  gameOpponentLabel,
  renderGame,
  renderIndividualGamePost,
  renderManagementWeek,
  renderPlayerWeek,
  type ScheduleWeek,
} from '../renderers/schedule.renderer.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { DEFAULT_AVAILABILITY_CHANNEL_ID } from '../config/constants.js';
import { requireManagement } from './authorization.js';
import { getTeamMembersWithRole } from './management.js';
import type { BotContext } from './context.js';

export async function syncAvailabilityPost(
  guildId: string,
  week: ScheduleWeek,
  context: BotContext,
  client: any,
): Promise<TextChannel | null> {
  const config = await context.config.ensure(guildId);
  let channelId = config.teamAvailabilityChannelId;
  const guild =
    client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));

  if (!channelId) {
    channelId = DEFAULT_AVAILABILITY_CHANNEL_ID;
    await context.prisma.guildConfig.update({
      where: { guildId },
      data: { teamAvailabilityChannelId: channelId },
    }).catch(() => null);
  }

  try {
    const channel = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (!channel?.isTextBased()) return null;

    let rosterMembers: Array<{ id: string; displayName: string }> | undefined;
    if (guild) {
      try {
        const { members } = await getTeamMembersWithRole(guild, config.rosterRoleId, false);
        rosterMembers = members.map((m) => ({
          id: m.id,
          displayName: m.displayName || m.user.username,
        }));
      } catch {
        // ignore
      }
    }

    const payload = renderWeeklyAvailability(week as any, rosterMembers);

    if (week.messageId && week.channelId === channel.id) {
      try {
        const msg = await channel.messages.fetch(week.messageId);
        await msg.edit(payload);
        return channel;
      } catch {
        const msg = await channel.send(payload);
        await context.weeklyAvailability.saveMessage(week.id, channel.id, msg.id);
        return channel;
      }
    } else {
      const msg = await channel.send(payload);
      await context.weeklyAvailability.saveMessage(week.id, channel.id, msg.id);
      return channel;
    }
  } catch (err) {
    console.error('Failed to sync weekly availability post:', err);
    return null;
  }
}

export async function syncSingleGamePost(
  guildId: string,
  gameId: string,
  context: BotContext,
  client: any,
) {
  try {
    const game = await context.schedule.game(gameId);
    if (!game) return;
    const week = await context.schedule.getWeek(game.weekId);
    if (!week) return;
    const activeGames = week.games.filter((g) => g.status !== 'CANCELLED');
    const idx = activeGames.findIndex((g) => g.id === game.id);
    const gameNumber = idx >= 0 ? idx + 1 : undefined;

    const config = await context.config.ensure(guildId);
    const channelId = config.teamAvailabilityChannelId || DEFAULT_AVAILABILITY_CHANNEL_ID;
    const channel = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (!channel?.isTextBased()) return;

    if (game.notes) {
      const msg = await channel.messages.fetch(game.notes).catch(() => null);
      if (msg) {
        await msg.edit(renderIndividualGamePost(game, gameNumber)).catch(() => null);
      }
    }
  } catch (err) {
    console.error('Failed to sync single game post:', err);
  }
}

export async function handleAddGame(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
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

  await interaction.editReply({
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
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

  const server = interaction.options.getString('server', true);
  const code = interaction.options.getString('code', true);
  const gameQuery = interaction.options.getString('game')?.trim();
  let targetGameId: string | undefined;

  if (gameQuery) {
    const num = parseInt(gameQuery, 10);
    const currentWeek = await context.schedule.currentWeek(interaction.guildId);
    const activeGames = (currentWeek?.games.filter((g) => g.status !== 'CANCELLED') ?? []).sort(
      (a, b) => a.scheduledAtUtc.getTime() - b.scheduledAtUtc.getTime(),
    );
    if (!isNaN(num) && num >= 1 && num <= activeGames.length && !gameQuery.startsWith('c')) {
      targetGameId = activeGames[num - 1]?.id;
    } else {
      const found = activeGames.find(
        (g) =>
          g.id.toLowerCase() === gameQuery.toLowerCase() ||
          g.id.toLowerCase().includes(gameQuery.toLowerCase()) ||
          g.opponentNameSnapshot?.toLowerCase().includes(gameQuery.toLowerCase()),
      );
      if (found) {
        targetGameId = found.id;
      } else {
        const allGuildGames = await context.prisma.weeklyGame.findMany({
          where: {
            week: { guildConfig: { guildId: interaction.guildId } },
            status: { not: 'CANCELLED' },
          },
          orderBy: { scheduledAtUtc: 'asc' },
        });
        if (!isNaN(num) && num >= 1 && num <= allGuildGames.length) {
          targetGameId = allGuildGames[num - 1]?.id;
        } else {
          const match = allGuildGames.find((g) =>
            g.opponentNameSnapshot?.toLowerCase().includes(gameQuery.toLowerCase()),
          );
          targetGameId = match?.id ?? gameQuery;
        }
      }
    }
  } else {
    const nearest = await context.schedule.nearestGame(interaction.guildId);
    targetGameId = nearest?.id;
  }

  if (!targetGameId) {
    throw new AppError(
      'NOT_FOUND',
      'No game found to set server and code for. Specify a game number (e.g. 1, 2) or ID.',
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
  if (week && week.messageId) {
    await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
  }
  await syncSingleGamePost(interaction.guildId, targetGameId, context, interaction.client);

  await interaction.editReply({
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
  await interaction.deferReply({ ephemeral: true });
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

  await interaction.editReply({
    embeds: [renderSuccess('Game Deleted', 'The game was removed from the schedule.')],
  });
}

export async function handleTimezone(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);
  if (interaction.options.getSubcommand() === 'set') {
    const timezone = interaction.options.getString('timezone', true);
    await context.schedule.setManagementTimezone(
      interaction.guildId,
      interaction.user.id,
      timezone,
      interaction.user.id,
    );
    await interaction.editReply({
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
    await interaction.editReply({
      embeds: [renderSuccess('Management timezone', timezone)],
    });
  }
}

export async function handleWeek(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'code') return handleSetCode(interaction, context);
  if (subcommand === 'add-game') return handleAddGame(interaction, context);
  if (subcommand === 'delete-game') return handleDeleteGame(interaction, context);

  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

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
  await interaction.editReply(renderManagementWeek(week));
}

export async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  const [week, config, member] = await Promise.all([
    context.schedule.currentWeek(interaction.guildId),
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
  if (hasManagementAccess(accessLevel(member, config))) {
    await interaction.editReply(renderManagementWeek(week));
    return;
  }
  const player = await context.players.byDiscordId(
    interaction.guildId,
    interaction.user.id,
    interaction.user.displayName ?? interaction.user.username,
    interaction.user.displayAvatarURL(),
  );
  await interaction.editReply(renderPlayerWeek(week, player.id));
}

export async function handleGame(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.editReply(renderGame(game, management, player?.id));
}

export function parseScheduleLine(
  line: string,
  fallbackDate?: string,
): {
  opponent: string;
  date: string;
  time: string;
  homeAway: 'HOME' | 'AWAY';
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let homeAway: 'HOME' | 'AWAY' = 'HOME';
  if (/\b(at|@)\b/i.test(trimmed)) {
    homeAway = 'AWAY';
  }

  const cleanLine = trimmed.replace(/\b(vs|@|at)\b/gi, ' ');

  const timeMatch = cleanLine.match(/(\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b|\b\d{1,2}:\d{2}\b)/);
  const time = timeMatch ? timeMatch[1]!.trim() : '8:30 PM';

  const dayMatch = cleanLine.match(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Today|Tomorrow|\d{1,2}[\/-]\d{1,2})\b/i,
  );
  const date = dayMatch ? dayMatch[1]!.trim() : (fallbackDate ?? 'Sunday');

  let opponent = cleanLine;
  if (timeMatch) opponent = opponent.replace(timeMatch[0], ' ');
  if (dayMatch) opponent = opponent.replace(dayMatch[0], ' ');
  opponent = opponent.replace(/[\-–—:,]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!opponent) return null;

  return { opponent, date, time, homeAway };
}

export async function handleAddGames(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

  const rawGames = interaction.options.getString('schedule', true);
  const lines = rawGames.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  const results: string[] = [];
  const errors: string[] = [];
  let lastDate: string | undefined;

  for (const line of lines) {
    const parsed = parseScheduleLine(line, lastDate);
    if (!parsed) {
      errors.push(`Could not understand format in: \`${line}\``);
      continue;
    }
    lastDate = parsed.date;

    try {
      await context.schedule.addGame({
        guildId: interaction.guildId,
        opponent: parsed.opponent,
        date: parsed.date,
        time: parsed.time,
        homeAway: parsed.homeAway,
        actorDiscordId: interaction.user.id,
      });
      results.push(
        `✅ **${parsed.homeAway === 'AWAY' ? '@' : 'vs'} ${parsed.opponent}** • ${parsed.date} at ${parsed.time}`,
      );
    } catch (err) {
      errors.push(`Failed for \`${line}\`: ${(err as Error).message}`);
    }
  }

  const week = await context.schedule.currentWeek(interaction.guildId);
  if (week) {
    await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
  }

  const embed = brandedEmbed()
    .setTitle(`SCHEDULE UPDATED: ${results.length} Game(s) Added`)
    .setDescription(
      results.length
        ? results.join('\n') +
            '\n\n*The availability board in `#team-availability` has been updated!*'
        : 'No games could be added. Check formatting.',
    );

  if (errors.length) {
    embed.addFields({
      name: '⚠️ Skipped / Errors',
      value: errors.slice(0, 10).join('\n'),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function handleLineupCommand(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

  const currentWeek = await context.schedule.currentWeek(interaction.guildId);
  if (!currentWeek || !currentWeek.games.length) {
    throw new AppError('NOT_FOUND', 'No games are scheduled for this week yet. Add games first!');
  }

  const activeGames = currentWeek.games.filter((g) => g.status !== 'CANCELLED');
  const gameArg = interaction.options.getString('game')?.trim();

  let targetGameId: string | undefined;
  if (gameArg) {
    const num = parseInt(gameArg, 10);
    if (!isNaN(num) && num >= 1 && num <= activeGames.length) {
      targetGameId = activeGames[num - 1]?.id;
    } else {
      targetGameId = activeGames.find((g) => g.id === gameArg)?.id;
    }
  }

  if (!targetGameId) {
    if (activeGames.length === 1) {
      targetGameId = activeGames[0]!.id;
    } else {
      const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId('lineup-action', currentWeek.id, 'game-chosen'))
          .setPlaceholder('Choose a game to set starters for...')
          .addOptions(
            activeGames.map((g, idx) => ({
              label: `Game ${idx + 1}: ${gameOpponentLabel(g)}`.slice(0, 100),
              value: g.id,
              description: DateTime.fromJSDate(g.scheduledAtUtc).toFormat('cccc h:mm a'),
            })),
          ),
      );
      await interaction.editReply({
        content: '🏒 **Choose which game to set the lineup for:**',
        components: [selectMenu],
      });
      return;
    }
  }

  const game = await context.schedule.game(targetGameId);
  if (!game) throw new AppError('NOT_FOUND', 'Game not found.');

  await interaction.editReply(renderGame(game, true));
}
