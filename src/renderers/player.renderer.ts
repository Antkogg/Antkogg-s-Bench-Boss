import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eligiblePositions, signupPositionLabel } from '../domain/positions.js';
import type { Player, ScoutingAssignment, ScoutingSession } from '../generated/prisma/client.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';

type ProfilePlayer = Player & {
  assignments: (ScoutingAssignment & { session: ScoutingSession })[];
};

export function renderUnregisteredProfile() {
  return {
    embeds: [
      brandedEmbed()
        .setTitle('WELCOME TO BENCH BOSS')
        .setDescription('Register once, then every scouting signup is a single click.')
        .addFields(
          {
            name: 'WHAT YOU’LL NEED',
            value: 'Your LG username, exact EA Tag, and LG signup position.',
          },
          {
            name: 'EA TAG MATTERS',
            value:
              '**Enter it exactly as it appears in EA SPORTS NHL.**\nCapitalization, spaces, numbers, and special characters are preserved.',
          },
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId('profile-action', 'register'))
          .setLabel('Register')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

export function renderPlayerProfile(player: ProfilePlayer) {
  const upcoming = player.assignments.length
    ? player.assignments
        .map(
          (item) =>
            `${discordTimestamp(item.session.startsAt, 'D')} • **${item.position}** • ${discordTimestamp(item.session.startsAt, 't')}`,
        )
        .join('\n')
    : 'No upcoming scouting games.';
  return {
    embeds: [
      brandedEmbed()
        .setTitle('PLAYER PROFILE')
        .setThumbnail(player.discordAvatarUrl)
        .addFields(
          { name: 'EA TAG', value: `\`${player.eaTag}\``, inline: true },
          { name: 'LG USERNAME', value: player.lgUsername, inline: true },
          { name: 'LG POSITION', value: signupPositionLabel(player.signupPositions), inline: true },
          {
            name: 'ELIGIBLE',
            value: eligiblePositions(player.positionGroup).join('  •  '),
            inline: false,
          },
          { name: 'UPCOMING', value: upcoming, inline: false },
        )
        .setTimestamp(player.updatedAt),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId('profile-action', 'update'))
          .setLabel('Update Registration')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(customId('profile-action', 'scouting'))
          .setLabel('View Scouting')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}
