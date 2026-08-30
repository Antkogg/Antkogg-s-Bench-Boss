import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { SeasonWeek, WeeklyGame } from '../generated/prisma/client.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
import { gameOpponentLabel, groupGamesByGuildDay } from './schedule.renderer.js';

type WeekWithGames = SeasonWeek & {
  games: WeeklyGame[];
  guildConfig?: { timezone: string };
};

export function renderWeeklyAvailability(week: WeekWithGames) {
  const games = week.games.filter((game) => game.status !== 'CANCELLED');
  const gameNumbers = new Map(games.map((game, index) => [game.id, index + 1]));
  const embed = brandedEmbed()
    .setTitle(`${week.label.toUpperCase()} AVAILABILITY`)
    .setDescription(
      `Choose every game you can play. Times automatically display in your Discord timezone.\n\n**Deadline:** ${discordTimestamp(week.deadline, 'F')} (${discordTimestamp(week.deadline, 'R')})\n**Status:** ${week.status}`,
    );
  const groups = groupGamesByGuildDay(games, week.guildConfig?.timezone ?? 'UTC');
  if (groups.length) {
    for (const group of groups) {
      embed.addFields({
        name: group.day.toUpperCase(),
        value: group.games
          .map(
            (game) =>
              `**${gameNumbers.get(game.id)}. ${gameOpponentLabel(game)}** • ${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})`,
          )
          .join('\n'),
      });
    }
  } else embed.addFields({ name: 'GAMES', value: 'Management has not configured games yet.' });
  return {
    embeds: [embed],
    components:
      week.status === 'OPEN'
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(customId('weekly-availability', week.id, 'submit'))
                .setLabel('Submit / Edit')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(customId('weekly-availability', week.id, 'unavailable'))
                .setLabel('Unavailable for All')
                .setStyle(ButtonStyle.Danger),
            ),
          ]
        : [],
  };
}
