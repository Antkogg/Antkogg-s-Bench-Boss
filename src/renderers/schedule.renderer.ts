import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import type {
  GameLineupAssignment,
  Player,
  PlayerGameAvailability,
  SeasonWeek,
  WeeklyAvailabilitySubmission,
  WeeklyGame,
} from '../generated/prisma/client.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
import { getTeamColor } from '../domain/ncaa-teams.js';
import type { WeekSchedulingSummary } from '../services/schedule.service.js';

export type ScheduleGame = WeeklyGame & {
  responses?: Array<
    PlayerGameAvailability & { submission: WeeklyAvailabilitySubmission & { player: Player } }
  >;
  lineup?: Array<GameLineupAssignment & { player: Player }>;
  eligiblePlayers?: Player[];
};

export type ScheduleWeek = SeasonWeek & {
  games: ScheduleGame[];
  guildConfig: { timezone: string };
  season?: { label: string } | null;
};

export function gameOpponentLabel(
  game: Pick<WeeklyGame, 'label' | 'opponentNameSnapshot' | 'homeAway'>,
) {
  if (!game.opponentNameSnapshot) return game.label;
  return `${game.homeAway === 'AWAY' ? '@' : 'vs'} ${game.opponentNameSnapshot}`;
}

export function groupGamesByGuildDay<T extends Pick<WeeklyGame, 'scheduledAtUtc'>>(
  games: T[],
  timezone: string,
) {
  const groups = new Map<string, T[]>();
  for (const game of games) {
    const day = DateTime.fromJSDate(game.scheduledAtUtc).setZone(timezone).toFormat('cccc, LLL d');
    groups.set(day, [...(groups.get(day) ?? []), game]);
  }
  return [...groups].map(([day, entries]) => ({ day, games: entries }));
}

export function renderManagementWeek(week: ScheduleWeek) {
  const active = week.games.filter((game) => game.status !== 'CANCELLED');
  const embed = brandedEmbed()
    .setTitle(`${week.season?.label ? `${week.season.label} • ` : ''}${week.label.toUpperCase()}`)
    .setDescription(
      `Availability: **${week.status}** • Deadline ${discordTimestamp(week.deadline, 'F')}\nGame IDs and responses stay attached when opponents or times are edited.`,
    );
  for (const group of groupGamesByGuildDay(active, week.guildConfig.timezone)) {
    embed.addFields({
      name: group.day.toUpperCase(),
      value: group.games
        .map((game) => {
          const roster =
            game.responses?.filter(
              (r) => r.status === 'AVAILABLE' && r.submission.player.teamStatus === 'ROSTER',
            ).length ?? 0;
          const tc =
            game.responses?.filter(
              (r) => r.status === 'AVAILABLE' && r.submission.player.teamStatus === 'TC',
            ).length ?? 0;
          const confirmed = game.lineup?.filter((entry) => entry.confirmed).length ?? 0;
          return `**${gameOpponentLabel(game)}** • ${discordTimestamp(game.scheduledAtUtc, 'F')}\nRoster ${roster} • TC ${tc} • Confirmed ${confirmed}/6 • ${game.status}`;
        })
        .join('\n\n'),
    });
  }
  const gameSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('week-game-select', week.id))
      .setPlaceholder('Open a game / build lineup')
      .addOptions(
        active.slice(0, 25).map((game) => ({
          label: gameOpponentLabel(game).slice(0, 100),
          description: DateTime.fromJSDate(game.scheduledAtUtc)
            .setZone(week.guildConfig.timezone)
            .toFormat('ccc LLL d • h:mm a')
            .slice(0, 100),
          value: game.id,
        })),
      ),
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(['SUNDAY', 'MONDAY', 'TUESDAY'] as const).map((day) =>
      new ButtonBuilder()
        .setCustomId(customId('week-action', week.id, `edit-${day}`))
        .setLabel(`Edit ${day[0]}${day.slice(1).toLowerCase()}`)
        .setStyle(ButtonStyle.Secondary),
    ),
    new ButtonBuilder()
      .setCustomId(customId('week-action', week.id, 'publish'))
      .setLabel('Publish Availability')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('week-action', week.id, week.status === 'LOCKED' ? 'reopen' : 'lock'))
      .setLabel(week.status === 'LOCKED' ? 'Reopen' : 'Lock')
      .setStyle(week.status === 'LOCKED' ? ButtonStyle.Success : ButtonStyle.Danger),
  );
  return { embeds: [embed], components: active.length ? [gameSelect, controls] : [controls] };
}

export function renderPlayerWeek(week: ScheduleWeek, playerId: string) {
  const games = week.games.filter((g) => g.status !== 'CANCELLED');
  const embeds = [];

  const headerEmbed = brandedEmbed()
    .setTitle(`${week.label.toUpperCase()} SCHEDULE`)
    .setDescription(`Times display in your Discord timezone. Availability is **${week.status}**.`);

  if (!games.length) {
    headerEmbed.addFields({ name: 'GAMES', value: 'No games scheduled for this week.' });
    embeds.push(headerEmbed);
  } else {
    embeds.push(headerEmbed);
    const displayGames = games.slice(0, 9);
    displayGames.forEach((game, index) => {
      const lineup = game.lineup?.find((entry) => entry.playerId === playerId && entry.confirmed);
      const response = game.responses?.find((entry) => entry.submission.playerId === playerId);
      const userState = lineup
        ? `🟢 **CONFIRMED (${lineup.position})**`
        : response?.status === 'AVAILABLE'
          ? '🔵 **AVAILABLE (Pending Lineup)**'
          : response?.status === 'UNAVAILABLE'
            ? '🔴 **UNAVAILABLE**'
            : '⚪ **NO RESPONSE**';

      const gameEmbed = brandedEmbed()
        .setTitle(`GAME ${index + 1}: ${gameOpponentLabel(game).toUpperCase()}`)
        .setDescription(
          `📅 **Time:** ${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n` +
            `**Status:** ${game.status}\n` +
            `**Your Status:** ${userState}`,
        );

      const positions = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;
      const lineupLines = positions.map((pos) => {
        const assignment = game.lineup?.find((entry) => entry.position === pos);
        if (assignment) {
          const badge = assignment.confirmed ? '✅' : '▫️';
          const isYou = assignment.playerId === playerId ? ' *(You)*' : '';
          return `**${pos}:** ${badge} <@${assignment.player.discordUserId}>${isYou}`;
        }
        return `**${pos}:** *Open*`;
      });

      gameEmbed.addFields({
        name: 'LINEUP',
        value: lineupLines.join('\n'),
      });

      if ((game.gameServer || game.gameCode) && lineup) {
        gameEmbed.addFields({
          name: 'SERVER / CODE',
          value: `**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`,
        });
      }

      embeds.push(gameEmbed);
    });

    if (games.length > 9) {
      embeds.push(
        brandedEmbed()
          .setTitle('ADDITIONAL GAMES')
          .setDescription(
            games
              .slice(9)
              .map(
                (g, i) =>
                  `**${i + 10}. ${gameOpponentLabel(g)}** • ${discordTimestamp(g.scheduledAtUtc, 'F')}`,
              )
              .join('\n'),
          ),
      );
    }
  }

  return { embeds, components: [] };
}

export function renderGame(
  game: ScheduleGame & { week: { label: string } },
  management: boolean,
  playerId?: string,
) {
  const confirmed = game.lineup?.filter((entry) => entry.confirmed) ?? [];
  const embed = brandedEmbed()
    .setTitle(gameOpponentLabel(game).toUpperCase())
    .setDescription(
      `${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n**${game.status}**`,
    )
    .addFields({
      name: 'LINEUP',
      value:
        game.lineup
          ?.map(
            (entry) =>
              `${entry.confirmed ? '✅' : '▫️'} **${entry.position}** • <@${entry.player.discordUserId}>`,
          )
          .join('\n') || 'Not selected',
    });
  if (game.gameServer || game.gameCode)
    embed.addFields({
      name: 'SERVER / CODE',
      value: `**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`,
    });
  if (!management && playerId) {
    const own = confirmed.find((entry) => entry.playerId === playerId);
    if (own) embed.addFields({ name: 'YOUR POSITION', value: `**${own.position}**` });
  }
  if (management && game.eligiblePlayers) {
    const available = game.responses?.filter((entry) => entry.status === 'AVAILABLE') ?? [];
    for (const status of ['ROSTER', 'TC'] as const) {
      const players = available
        .filter((entry) => entry.submission.player.teamStatus === status)
        .map((entry) => entry.submission.player);
      const group = (label: string, positionGroup: Player['positionGroup']) => {
        const rows = players
          .filter((player) => player.positionGroup === positionGroup)
          .map((player) => `\`${player.eaTag}\``);
        return `**${label}**\n${rows.join('\n') || 'None'}`;
      };
      embed.addFields({
        name: `AVAILABLE ${status}`,
        value: [
          group('Forwards', 'FORWARD'),
          group('Defense', 'DEFENSE'),
          group('Goalies', 'GOALIE'),
        ].join('\n\n'),
        inline: true,
      });
    }
    const responded = new Set(game.responses?.map((entry) => entry.submission.playerId));
    const missing = game.eligiblePlayers.filter((player) => !responded.has(player.id));
    embed.addFields({
      name: 'NO RESPONSE',
      value:
        missing.map((player) => `\`${player.eaTag}\` • ${player.teamStatus}`).join('\n') || 'None',
    });
  }
  if (!management && !confirmed.length)
    embed.setFooter({ text: 'Only confirmed lineups receive game details.' });
  const statusRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('game-status-select', game.id))
      .setPlaceholder(`Status: ${game.status}`)
      .addOptions(
        { label: 'Scheduled', value: 'SCHEDULED', default: game.status === 'SCHEDULED' },
        { label: 'Postponed', value: 'POSTPONED', default: game.status === 'POSTPONED' },
        { label: 'Cancelled', value: 'CANCELLED', default: game.status === 'CANCELLED' },
        { label: 'Completed', value: 'COMPLETED', default: game.status === 'COMPLETED' },
      ),
  );
  return {
    embeds: [embed],
    components: management
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(customId('lineup-action', game.id, 'build'))
              .setLabel('Build / Edit Lineup')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(customId('lineup-action', game.id, 'confirm'))
              .setLabel('Confirm Lineup')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(customId('game-action', game.id, 'set-code'))
              .setLabel('Set Server / Code')
              .setStyle(ButtonStyle.Secondary),
          ),
          statusRow,
        ]
      : [],
  };
}

export function renderIndividualGamePost(
  game: WeeklyGame & {
    lineup?: Array<GameLineupAssignment & { player: Player }>;
    responses?: Array<{
      status: string;
      submission: { player: Player };
    }>;
  },
  gameNumber?: number,
) {
  const timeUnix = Math.floor(game.scheduledAtUtc.getTime() / 1000);
  const isAway = game.homeAway === 'AWAY';
  const opponentFullName = game.opponentNameSnapshot ?? 'Opponent';

  const matchupLine = isAway
    ? `Boston University @ ${opponentFullName}`
    : `Boston University vs ${opponentFullName}`;

  const homeAwayTag = isAway ? 'AWAY @' : 'HOME vs';

  const dayName = DateTime.fromJSDate(game.scheduledAtUtc, { zone: 'America/Denver' }).toFormat('cccc');

  const formatSlot = (pos: 'LW' | 'C' | 'RW' | 'LD' | 'RD' | 'G') => {
    const assignment = game.lineup?.find((l) => l.position === pos);
    if (assignment) {
      const badge = assignment.confirmed ? '✅ ' : '▫️ ';
      return `${badge}<@${assignment.player.discordUserId}>`;
    }
    return '*Open*';
  };

  const availablePlayers = (game.responses ?? [])
    .filter((r) => r.status === 'AVAILABLE')
    .map((r) => `<@${r.submission.player.discordUserId}>`);

  const outPlayers = (game.responses ?? [])
    .filter((r) => r.status === 'UNAVAILABLE')
    .map((r) => `<@${r.submission.player.discordUserId}>`);

  const serverCodeValue =
    game.gameServer || game.gameCode
      ? `Server: **${game.gameServer ?? 'Not set'}** ┃ Code: **${game.gameCode ?? 'Not set'}**`
      : 'Not set';

  const assignedCount = game.lineup?.length ?? 0;
  const confirmedCount = game.lineup?.filter((l) => l.confirmed).length ?? 0;
  const lineupBadge =
    confirmedCount > 0 && confirmedCount === assignedCount
      ? `✅ **Lineup Confirmed (${confirmedCount}/6)**`
      : assignedCount > 0
        ? `▫️ **Lineup In Progress (${assignedCount}/6)**`
        : `⚪ **Lineup Open (0/6)**`;

  const opponentColor = getTeamColor(opponentFullName);

  const embed = brandedEmbed(opponentColor)
    .setAuthor(null)
    .setTitle(`🏒 GAME ${gameNumber ?? 1} • ${homeAwayTag} ${opponentFullName.toUpperCase()}`)
    .setDescription(
      `🏟️ **${matchupLine}**\n` +
      `📅 **${dayName}, <t:${timeUnix}:D>** • 🕖 **<t:${timeUnix}:t>** (<t:${timeUnix}:R>)\n` +
      `${lineupBadge}`
    )
    .addFields(
      {
        name: '⚔️ LINEUP',
        value:
          `\`LW\` ${formatSlot('LW')} ┃ \`C\` ${formatSlot('C')} ┃ \`RW\` ${formatSlot('RW')}\n` +
          `\`LD\` ${formatSlot('LD')} ┃ \`RD\` ${formatSlot('RD')} ┃ \`G\` ${formatSlot('G')}`,
        inline: false,
      },
      {
        name: '🎮 SERVER / ROOM CODE',
        value: serverCodeValue,
        inline: true,
      },
      {
        name: `👥 AVAILABILITY (${availablePlayers.length} in • ${outPlayers.length} out)`,
        value:
          availablePlayers.length || outPlayers.length
            ? (availablePlayers.length ? `🟢 **Available:** ${availablePlayers.join(', ').slice(0, 450)}\n` : '') +
              (outPlayers.length ? `🔴 **Out:** ${outPlayers.join(', ').slice(0, 450)}` : '')
            : '*No responses recorded yet*',
        inline: false,
      },
    )
    .setFooter({
      text: `S55 • Boston University • Game ${gameNumber ?? 1} • LG Assistant`,
    });

  const playerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('game-avail', game.id, 'available'))
      .setLabel('🟢 Available')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(customId('game-avail', game.id, 'unavailable'))
      .setLabel('🔴 Out')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(customId('game-day-avail', game.id, 'available'))
      .setLabel(`All ${dayName}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId('game-day-avail', game.id, 'unavailable'))
      .setLabel(`No ${dayName}`)
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [playerRow],
  };
}

export function renderLineupDashboard(
  week: ScheduleWeek,
  summary?: WeekSchedulingSummary | null,
) {
  const embed = brandedEmbed()
    .setTitle(`🏒 ${week.label.toUpperCase()} LINEUP DASHBOARD`)
    .setDescription(
      `⚡ **Boston University Lineup Operations**\n` +
      `Assign lines for Sunday, Monday, and Tuesday below. Changes sync directly to the game cards in <#1543417189208428564>.\n`
    );

  const formatLine = (nightSummary?: any) => {
    if (!nightSummary || !nightSummary.games.length) return '*No games scheduled*';
    const l = nightSummary.lineup ?? {};
    const fmt = (pos: string) => (l[pos] ? `<@${l[pos].discordUserId}>` : '*Open*');
    const tag = nightSummary.isUnified
      ? '✅ `Same 6 All Night`'
      : nightSummary.openCount > 0
        ? `⚠️ \`${nightSummary.openCount} Open Spots\``
        : '🔀 `Split Line`';
    return (
      `\`LW\` ${fmt('LW')} ┃ \`C\` ${fmt('C')} ┃ \`RW\` ${fmt('RW')}\n` +
      `\`LD\` ${fmt('LD')} ┃ \`RD\` ${fmt('RD')} ┃ \`G\` ${fmt('G')}\n` +
      `*Status:* ${tag}`
    );
  };

  if (summary) {
    embed.addFields(
      {
        name: `📅 SUNDAY LINE (${summary.gamesByNight.SUNDAY.length} Games)`,
        value: formatLine(summary.nightLines.SUNDAY),
        inline: false,
      },
      {
        name: `📅 MONDAY LINE (${summary.gamesByNight.MONDAY.length} Games)`,
        value: formatLine(summary.nightLines.MONDAY),
        inline: false,
      },
      {
        name: `📅 TUESDAY LINE (${summary.gamesByNight.TUESDAY.length} Games)`,
        value: formatLine(summary.nightLines.TUESDAY),
        inline: false,
      },
    );

    const counts = summary.playerGameCounts ?? [];
    if (counts.length) {
      const countsText = counts
        .map((p) => {
          const check = p.count === 3 ? '✅' : p.count > 3 ? '⚠️' : '▫️';
          return `${check} <@${p.player.discordUserId}>: **${p.count}** games`;
        })
        .join(' • ');
      embed.addFields({
        name: '📊 ASSIGNED GAMES TRACKER (Target: 3 games)',
        value: countsText.slice(0, 1024),
        inline: false,
      });
    }

    if (summary.openSpots > 0) {
      embed.addFields({
        name: '⚠️ ATTENTION NEEDED',
        value: `**${summary.openSpots} open lineup spot(s)** remaining across the week.`,
        inline: false,
      });
    }
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'night-SUNDAY'))
      .setLabel('⚡ Sunday Line')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'night-MONDAY'))
      .setLabel('⚡ Monday Line')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'night-TUESDAY'))
      .setLabel('⚡ Tuesday Line')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'choose-game'))
      .setLabel('🛠️ Single Game Edit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'find-ecu'))
      .setLabel('🔍 Find ECU / Replacement')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'lock-lines'))
      .setLabel('🔒 Lock Weekly Lines')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(customId('lineup-action', week.id, 'refresh-dashboard'))
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [row1, row2],
  };
}
