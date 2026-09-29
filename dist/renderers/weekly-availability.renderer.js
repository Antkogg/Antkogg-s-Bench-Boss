import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
import { gameOpponentLabel } from './schedule.renderer.js';
const POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
export function renderWeeklyAvailability(week) {
    const games = week.games.filter((game) => game.status !== 'CANCELLED');
    const embeds = [];
    const headerEmbed = brandedEmbed()
        .setTitle(`${week.label.toUpperCase()} AVAILABILITY`)
        .setDescription(`Choose every game you can play. Times automatically display in your Discord timezone.\n\n` +
        `**Deadline:** ${discordTimestamp(week.deadline, 'F')} (${discordTimestamp(week.deadline, 'R')})\n` +
        `**Status:** ${week.status}`);
    if (!games.length) {
        headerEmbed.addFields({ name: 'GAMES', value: 'Management has not configured games yet.' });
        embeds.push(headerEmbed);
    }
    else {
        embeds.push(headerEmbed);
        const displayGames = games.slice(0, 9);
        displayGames.forEach((game, index) => {
            const gameEmbed = brandedEmbed()
                .setTitle(`GAME ${index + 1}: ${gameOpponentLabel(game).toUpperCase()}`)
                .setDescription(`📅 **Time:** ${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n` +
                `**Status:** ${game.status}`);
            const lineupLines = POSITIONS.map((pos) => {
                const assignment = game.lineup?.find((entry) => entry.position === pos);
                if (assignment) {
                    const check = assignment.confirmed ? '✅' : '▫️';
                    return `**${pos}:** ${check} <@${assignment.player.discordUserId}>`;
                }
                return `**${pos}:** *Open*`;
            });
            gameEmbed.addFields({
                name: 'LINEUP',
                value: lineupLines.join('\n'),
            });
            if (game.gameServer || game.gameCode) {
                gameEmbed.addFields({
                    name: 'SERVER / CODE',
                    value: `**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`,
                });
            }
            embeds.push(gameEmbed);
        });
        if (games.length > 9) {
            const extraEmbed = brandedEmbed()
                .setTitle('ADDITIONAL GAMES')
                .setDescription(games
                .slice(9)
                .map((g, i) => `**${i + 10}. ${gameOpponentLabel(g)}** • ${discordTimestamp(g.scheduledAtUtc, 'F')}`)
                .join('\n'));
            embeds.push(extraEmbed);
        }
    }
    return {
        embeds,
        components: week.status === 'OPEN'
            ? [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(customId('weekly-availability', week.id, 'submit'))
                    .setLabel('Submit / Edit')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(customId('weekly-availability', week.id, 'unavailable'))
                    .setLabel('Unavailable for All')
                    .setStyle(ButtonStyle.Danger)),
            ]
            : [],
    };
}
//# sourceMappingURL=weekly-availability.renderer.js.map