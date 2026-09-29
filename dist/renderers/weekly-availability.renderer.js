import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed } from './design.js';
import { gameOpponentLabel } from './schedule.renderer.js';
const POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
export function renderWeeklyAvailability(week, rosterMembers) {
    const games = week.games.filter((game) => game.status !== 'CANCELLED');
    const roleId = week.guildConfig?.rosterRoleId;
    const embed = brandedEmbed()
        .setTitle(`🏒 S55 BU TEAM AVAILABILITY & LINEUPS`)
        .setDescription(`📌 **Mark your availability for this week below!** Times show in your local time.\n` +
        (roleId ? `Role: <@&${roleId}> • ` : '') +
        `**${games.length} Games Scheduled**\n` +
        `─────────────────────────────────────`);
    if (!games.length) {
        embed.addFields({
            name: '⚠️ NO GAMES SCHEDULED YET',
            value: 'Management has not added games for this week yet.\n' +
                'Click **➕ Add Game** below or use `/add-game` to add your first game!',
        });
    }
    else {
        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            const timeUnix = Math.floor(game.scheduledAtUtc.getTime() / 1000);
            const label = gameOpponentLabel(game);
            // Starters from lineup
            const lineupParts = POSITIONS.map((pos) => {
                const assignment = game.lineup?.find((l) => l.position === pos);
                return assignment
                    ? `**${pos}:** <@${assignment.player.discordUserId}>`
                    : `**${pos}:** *Open*`;
            });
            const forwards = lineupParts.slice(0, 3).join(' | ');
            const defenseGoalie = lineupParts.slice(3).join(' | ');
            // Player availability responses
            const availablePlayers = (game.responses ?? [])
                .filter((r) => r.status === 'AVAILABLE')
                .map((r) => {
                const p = r.submission.player;
                const pos = p.signupPositions?.length ? ` (${p.signupPositions.join('/')})` : '';
                return `<@${p.discordUserId}>${pos}`;
            });
            const outPlayers = (game.responses ?? [])
                .filter((r) => r.status === 'UNAVAILABLE')
                .map((r) => `<@${r.submission.player.discordUserId}>`);
            const serverCode = game.gameServer || game.gameCode
                ? `\n🎮 **Server:** ${game.gameServer ?? 'TBD'} • **Code:** ${game.gameCode ?? 'TBD'}`
                : '';
            const fieldValue = `⏰ **Time:** <t:${timeUnix}:F> (<t:${timeUnix}:R>)${serverCode}\n` +
                `📋 **Lineup:**\n${forwards}\n${defenseGoalie}\n` +
                `🟢 **Available (${availablePlayers.length}):** ${availablePlayers.length ? availablePlayers.join(', ') : '*None yet*'}\n` +
                `🔴 **Out (${outPlayers.length}):** ${outPlayers.length ? outPlayers.join(', ') : '*None*'}`;
            embed.addFields({
                name: `🏒 GAME ${i + 1}: ${label.toUpperCase()}`,
                value: fieldValue.slice(0, 1024),
            });
        }
    }
    // Pending roster members who haven't responded yet
    if (rosterMembers && rosterMembers.length) {
        const submittedIds = new Set(week.submissions?.map((s) => s.player.discordUserId) ?? []);
        const pending = rosterMembers.filter((m) => !submittedIds.has(m.id));
        if (pending.length) {
            embed.addFields({
                name: `⚪ PENDING RESPONSES (${pending.length})`,
                value: pending
                    .slice(0, 25)
                    .map((m) => `<@${m.id}>`)
                    .join(', ')
                    .slice(0, 1024),
            });
        }
    }
    // Row 1: Player Availability Buttons (1 Click)
    const playerRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'avail-all'))
        .setLabel('🟢 Available for ALL')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'unavailable'))
        .setLabel('🔴 Out for ALL')
        .setStyle(ButtonStyle.Danger), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'pick'))
        .setLabel('⚙️ Pick Games')
        .setStyle(ButtonStyle.Secondary));
    // Row 2: Management Controls
    const mgmtRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('lineup-action', week.id, 'choose-game'))
        .setLabel('📋 Set Lineups')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(customId('week-action', week.id, 'quick-add'))
        .setLabel('➕ Add Game')
        .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
        .setCustomId(customId('weekly-availability', week.id, 'refresh'))
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary));
    if (week.status === 'LOCKED') {
        return {
            embeds: [embed],
            components: [],
        };
    }
    return {
        embeds: [embed],
        components: games.length ? [playerRow, mgmtRow] : [mgmtRow],
    };
}
//# sourceMappingURL=weekly-availability.renderer.js.map