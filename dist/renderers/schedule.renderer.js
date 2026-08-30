import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
export function gameOpponentLabel(game) {
    if (!game.opponentNameSnapshot)
        return game.label;
    return `${game.homeAway === 'AWAY' ? '@' : 'vs'} ${game.opponentNameSnapshot}`;
}
export function groupGamesByGuildDay(games, timezone) {
    const groups = new Map();
    for (const game of games) {
        const day = DateTime.fromJSDate(game.scheduledAtUtc).setZone(timezone).toFormat('cccc, LLL d');
        groups.set(day, [...(groups.get(day) ?? []), game]);
    }
    return [...groups].map(([day, entries]) => ({ day, games: entries }));
}
export function renderManagementWeek(week) {
    const active = week.games.filter((game) => game.status !== 'CANCELLED');
    const embed = brandedEmbed()
        .setTitle(`${week.season?.label ? `${week.season.label} • ` : ''}${week.label.toUpperCase()}`)
        .setDescription(`Availability: **${week.status}** • Deadline ${discordTimestamp(week.deadline, 'F')}\nGame IDs and responses stay attached when opponents or times are edited.`);
    for (const group of groupGamesByGuildDay(active, week.guildConfig.timezone)) {
        embed.addFields({
            name: group.day.toUpperCase(),
            value: group.games
                .map((game) => {
                const roster = game.responses?.filter((r) => r.status === 'AVAILABLE' && r.submission.player.teamStatus === 'ROSTER').length ?? 0;
                const tc = game.responses?.filter((r) => r.status === 'AVAILABLE' && r.submission.player.teamStatus === 'TC').length ?? 0;
                const confirmed = game.lineup?.filter((entry) => entry.confirmed).length ?? 0;
                return `**${gameOpponentLabel(game)}** • ${discordTimestamp(game.scheduledAtUtc, 'F')}\nRoster ${roster} • TC ${tc} • Confirmed ${confirmed}/6 • ${game.status}`;
            })
                .join('\n\n'),
        });
    }
    const gameSelect = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('week-game-select', week.id))
        .setPlaceholder('Open a game / build lineup')
        .addOptions(active.slice(0, 25).map((game) => ({
        label: gameOpponentLabel(game).slice(0, 100),
        description: DateTime.fromJSDate(game.scheduledAtUtc)
            .setZone(week.guildConfig.timezone)
            .toFormat('ccc LLL d • h:mm a')
            .slice(0, 100),
        value: game.id,
    }))));
    const controls = new ActionRowBuilder().addComponents(...['SUNDAY', 'MONDAY', 'TUESDAY'].map((day) => new ButtonBuilder()
        .setCustomId(customId('week-action', week.id, `edit-${day}`))
        .setLabel(`Edit ${day[0]}${day.slice(1).toLowerCase()}`)
        .setStyle(ButtonStyle.Secondary)), new ButtonBuilder()
        .setCustomId(customId('week-action', week.id, 'publish'))
        .setLabel('Publish Availability')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(customId('week-action', week.id, week.status === 'LOCKED' ? 'reopen' : 'lock'))
        .setLabel(week.status === 'LOCKED' ? 'Reopen' : 'Lock')
        .setStyle(week.status === 'LOCKED' ? ButtonStyle.Success : ButtonStyle.Danger));
    return { embeds: [embed], components: active.length ? [gameSelect, controls] : [controls] };
}
export function renderPlayerWeek(week, playerId) {
    const embed = brandedEmbed()
        .setTitle(`${week.label.toUpperCase()} SCHEDULE`)
        .setDescription(`Times display in your Discord timezone. Availability is **${week.status}**.`);
    for (const group of groupGamesByGuildDay(week.games.filter((g) => g.status !== 'CANCELLED'), week.guildConfig.timezone)) {
        embed.addFields({
            name: group.day.toUpperCase(),
            value: group.games
                .map((game) => {
                const lineup = game.lineup?.find((entry) => entry.playerId === playerId && entry.confirmed);
                const response = game.responses?.find((entry) => entry.submission.playerId === playerId);
                const state = lineup
                    ? `CONFIRMED • ${lineup.position}`
                    : response?.status === 'AVAILABLE'
                        ? 'AVAILABLE • NOT SELECTED'
                        : (response?.status ?? 'NO RESPONSE');
                return `**${gameOpponentLabel(game)}** • ${discordTimestamp(game.scheduledAtUtc, 'F')}\n${state}`;
            })
                .join('\n\n'),
        });
    }
    return { embeds: [embed], components: [] };
}
export function renderGame(game, management, playerId) {
    const confirmed = game.lineup?.filter((entry) => entry.confirmed) ?? [];
    const embed = brandedEmbed()
        .setTitle(gameOpponentLabel(game).toUpperCase())
        .setDescription(`${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n**${game.status}**`)
        .addFields({
        name: 'LINEUP',
        value: game.lineup
            ?.map((entry) => `${entry.confirmed ? '✅' : '▫️'} **${entry.position}** • <@${entry.player.discordUserId}>`)
            .join('\n') || 'Not selected',
    });
    if (game.gameServer || game.gameCode)
        embed.addFields({
            name: 'SERVER / CODE',
            value: `**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`,
        });
    if (!management && playerId) {
        const own = confirmed.find((entry) => entry.playerId === playerId);
        if (own)
            embed.addFields({ name: 'YOUR POSITION', value: `**${own.position}**` });
    }
    if (management && game.eligiblePlayers) {
        const available = game.responses?.filter((entry) => entry.status === 'AVAILABLE') ?? [];
        for (const status of ['ROSTER', 'TC']) {
            const players = available
                .filter((entry) => entry.submission.player.teamStatus === status)
                .map((entry) => entry.submission.player);
            const group = (label, positionGroup) => {
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
            value: missing.map((player) => `\`${player.eaTag}\` • ${player.teamStatus}`).join('\n') || 'None',
        });
    }
    if (!management && !confirmed.length)
        embed.setFooter({ text: 'Only confirmed lineups receive game details.' });
    const statusRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('game-status-select', game.id))
        .setPlaceholder(`Status: ${game.status}`)
        .addOptions({ label: 'Scheduled', value: 'SCHEDULED', default: game.status === 'SCHEDULED' }, { label: 'Postponed', value: 'POSTPONED', default: game.status === 'POSTPONED' }, { label: 'Cancelled', value: 'CANCELLED', default: game.status === 'CANCELLED' }, { label: 'Completed', value: 'COMPLETED', default: game.status === 'COMPLETED' }));
    return {
        embeds: [embed],
        components: management
            ? [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(customId('lineup-action', game.id, 'build'))
                    .setLabel('Build / Edit Lineup')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(customId('lineup-action', game.id, 'confirm'))
                    .setLabel('Confirm Lineup')
                    .setStyle(ButtonStyle.Success), new ButtonBuilder()
                    .setCustomId(customId('game-action', game.id, 'set-code'))
                    .setLabel('Set Server / Code')
                    .setStyle(ButtonStyle.Secondary)),
                statusRow,
            ]
            : [],
    };
}
//# sourceMappingURL=schedule.renderer.js.map