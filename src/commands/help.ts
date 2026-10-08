import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './context.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { brandedEmbed } from '../renderers/design.js';

export async function handleHelp(
  interaction: ChatInputCommandInteraction,
  context?: BotContext,
): Promise<void> {
  let isManager = false;
  if (context && interaction.guildId && interaction.guild) {
    try {
      const [config, member] = await Promise.all([
        context.config.ensure(interaction.guildId),
        interaction.guild.members.fetch(interaction.user.id),
      ]);
      isManager = hasManagementAccess(accessLevel(member, config));
    } catch {
      isManager = false;
    }
  }

  const embed = isManager
    ? brandedEmbed()
        .setTitle("TEAM MANAGEMENT GUIDE  •  BENCH BOSS")
        .setDescription(
          'Quick reference for schedule, availability, lineups, and game setup.',
        )
        .addFields(
          {
            name: '1 • SCHEDULE & GAMES',
            value:
              '`/add-game` — Add a game (opponent, date, time, server, code).\n' +
              '`/add-games` — Bulk add games by pasting your schedule.\n' +
              '`/delete-game` — Remove a game from the schedule.\n' +
              '`/post-week` — Post the week schedule and individual game cards to `#team-availability`.\n' +
              '`/games` — View this week’s games and lineups.',
          },
          {
            name: '2 • GAME INFO & LINEUPS',
            value:
              '`/set-code` — Set server name and game code (or click on any game card).\n' +
              '`/lineup` — Set starters for a game (or click **Set Lineup** directly on the game card).\n' +
              'Click **Confirm Lineup** on any game card to confirm starters and send automatic DMs.',
          },
          {
            name: '3 • PLAYER POSITIONS',
            value:
              '`/set-position` — Assign a player’s position (LW, C, RW, LD, RD, G).\n' +
              '`/set-positions` — View and edit positions for all roster players.',
          },
          {
            name: '4 • AVAILABILITY & SETUP',
            value:
              '`/availability missing` — View players who have not submitted availability yet.\n' +
              '`/setup view` / `/setup roles` — Configure team role and settings.',
          },
        )
    : brandedEmbed()
        .setTitle("PLAYER GUIDE  •  BENCH BOSS")
        .setDescription(
          'How to submit availability and check your game lineup info.',
        )
        .addFields(
          {
            name: '1 • SUBMIT AVAILABILITY',
            value:
              'Go to `#team-availability` and click **Available** or **Unavailable** on individual game cards.\n' +
              'You can also click **Available for Day** to set recurring availability for all games that day.\n' +
              '*(Only players with the team role can submit)*',
          },
          {
            name: '2 • CHECK YOUR GAMES',
            value:
              '`/game` — View your next confirmed game, start time, server, and password.\n' +
              '`/games` — View the full schedule and active lineups.',
          },
          {
            name: '3 • CHECK YOUR AVAILABILITY',
            value: '`/availability mine` — See which games you are currently marked available for.',
          },
        );

  await interaction.reply({
    ephemeral: true,
    embeds: [embed],
  });
}
