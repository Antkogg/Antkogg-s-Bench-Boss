import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed } from './design.js';
import { localWeekday } from '../domain/schedule-time.js';
import { DEFAULT_TEAM_ROLE_ID, DEFAULT_ROSTER_ROLE_ID, DEFAULT_TC_ROLE_ID, } from '../config/constants.js';
export function renderWeeklyAvailability(week, rosterMembers) {
    const games = week.games.filter((game) => game.status !== 'CANCELLED');
    const rosterRoleId = week.guildConfig?.rosterRoleId ?? DEFAULT_ROSTER_ROLE_ID;
    const tcRoleId = week.guildConfig?.tcRoleId ?? DEFAULT_TC_ROLE_ID;
    const roleText = [
        `Team: <@&${DEFAULT_TEAM_ROLE_ID}>`,
        rosterRoleId ? `Roster: <@&${rosterRoleId}>` : null,
        tcRoleId ? `TC: <@&${tcRoleId}>` : null,
    ]
        .filter(Boolean)
        .join(' • ');
    const embed = brandedEmbed(0xcc0000)
        .setTitle(`🏒 S55 BOSTON UNIVERSITY • ${week.label.toUpperCase()} SCHEDULE & AVAILABILITY`)
        .setDescription(`📌 **Mark your weekly availability below!** Times show in your local time.\n` +
        (roleText ? `${roleText} • ` : '') +
        `**${games.length} Games Scheduled**\n` +
        `*Individual game cards with full rosters & room codes are posted below!*`);
    if (!games.length) {
        embed.addFields({
            name: '⚠️ NO GAMES SCHEDULED YET',
            value: 'Management has not added games for this week yet.\n' +
                'Click **➕ Add Game** below or use `/add-game` to add your first game!',
        });
    }
    else {
        const tz = week.guildConfig?.timezone ?? 'America/Denver';
        const gamesByDay = {
            SUNDAY: [],
            MONDAY: [],
            TUESDAY: [],
            OTHER: [],
        };
        games.forEach((g) => {
            const day = localWeekday(g.scheduledAtUtc, tz);
            (gamesByDay[day] ?? gamesByDay.OTHER).push(g);
        });
        const formatDayBlock = (dayGames) => {
            if (!dayGames.length)
                return '*No games scheduled*';
            return dayGames
                .map((g) => {
                const idx = games.indexOf(g) + 1;
                const timeUnix = Math.floor(g.scheduledAtUtc.getTime() / 1000);
                const opponent = g.opponentNameSnapshot ?? 'TBD';
                const matchup = g.homeAway === 'AWAY' ? `@ **${opponent}**` : `vs **${opponent}**`;
                const availCount = (g.responses ?? []).filter((r) => r.status === 'AVAILABLE').length;
                const assignedCount = (g.lineup ?? []).length;
                const lineupStatus = assignedCount === 6
                    ? '✅ `Lineup Set`'
                    : assignedCount > 0
                        ? `▫️ \`${assignedCount}/6 Set\``
                        : '⚪ `Open`';
                return `**Game ${idx}** • <t:${timeUnix}:t> • ${matchup} ┃ 🟢 \`${availCount}\` in ┃ ${lineupStatus}`;
            })
                .join('\n');
        };
        if (gamesByDay.SUNDAY.length) {
            embed.addFields({
                name: `📅 SUNDAY (${gamesByDay.SUNDAY.length} Games)`,
                value: formatDayBlock(gamesByDay.SUNDAY),
                inline: false,
            });
        }
        if (gamesByDay.MONDAY.length) {
            embed.addFields({
                name: `📅 MONDAY (${gamesByDay.MONDAY.length} Games)`,
                value: formatDayBlock(gamesByDay.MONDAY),
                inline: false,
            });
        }
        if (gamesByDay.TUESDAY.length) {
            embed.addFields({
                name: `📅 TUESDAY (${gamesByDay.TUESDAY.length} Games)`,
                value: formatDayBlock(gamesByDay.TUESDAY),
                inline: false,
            });
        }
        if (gamesByDay.OTHER.length) {
            embed.addFields({
                name: `📅 OTHER GAMES (${gamesByDay.OTHER.length} Games)`,
                value: formatDayBlock(gamesByDay.OTHER),
                inline: false,
            });
        }
        // Submission summary
        const totalSubmissions = week.submissions?.length ?? 0;
        const rosterSubmitted = (week.submissions ?? []).filter((s) => s.player.teamStatus === 'ROSTER').length;
        const tcSubmitted = (week.submissions ?? []).filter((s) => s.player.teamStatus === 'TC').length;
        embed.addFields({
            name: '📊 SUBMISSION SUMMARY',
            value: `✅ **${totalSubmissions} Submitted** (${rosterSubmitted} Active Roster • ${tcSubmitted} TC/ECU)\n` +
                `👇 *Click **Available for ALL** below to mark full week availability in 1 click!*`,
            inline: false,
        });
    }
    // Pending team members who haven't responded yet
    if (rosterMembers && rosterMembers.length) {
        const submittedIds = new Set(week.submissions?.map((s) => s.player.discordUserId) ?? []);
        const pending = rosterMembers.filter((m) => !submittedIds.has(m.id));
        if (pending.length) {
            const display = pending.slice(0, 25).map((m) => `<@${m.id}>`).join(', ');
            const extra = pending.length > 25 ? `\n*...and ${pending.length - 25} more*` : '';
            embed.addFields({
                name: `⚪ PENDING S55 BU RESPONSES (${pending.length})`,
                value: (display + extra).slice(0, 1024),
            });
        }
        else {
            embed.addFields({
                name: '⚪ PENDING S55 BU RESPONSES (0)',
                value: `🎉 **All ${rosterMembers.length} team members have submitted!**`,
            });
        }
    }
    // Player Availability Buttons
    const playerRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'avail-all'))
        .setLabel('🟢 Available for ALL')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'pick'))
        .setLabel('⚙️ Custom Pick')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'my-schedule'))
        .setLabel('📅 My Schedule')
        .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'unavailable'))
        .setLabel('🔴 Out for ALL')
        .setStyle(ButtonStyle.Danger));
    if (week.status === 'LOCKED') {
        return {
            embeds: [embed],
            components: [],
        };
    }
    return {
        embeds: [embed],
        components: games.length ? [playerRow] : [],
    };
}
//# sourceMappingURL=weekly-availability.renderer.js.map