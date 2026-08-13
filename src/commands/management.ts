import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { capacity } from '../domain/scouting.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import type { BotContext } from './context.js';

async function requireManagement(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this command in the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!hasManagementAccess(accessLevel(member, config.managementRoleId)))
    throw new AppError('NOT_ALLOWED', 'This view is private to Bench Boss management.');
}

export async function handlePlayerSearch(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  await requireManagement(interaction, context);
  const players = await context.players.search(
    interaction.guildId!,
    interaction.options.getString('query', true),
  );
  if (!players.length) throw new AppError('NOT_FOUND', 'No matching player was found.');
  const selected = players[0]!;
  const view = await context.evaluations.playerView(selected.id);
  const played = view.attendance.filter((item) => item.status === 'PLAYED').length;
  await interaction.reply({
    ephemeral: true,
    embeds: [
      brandedEmbed()
        .setTitle('PLAYER • MANAGEMENT')
        .addFields(
          { name: 'EA TAG', value: `\`${view.eaTag}\``, inline: true },
          { name: 'LG', value: `${view.lgUsername} • ${view.signupPositions.join('/')}`, inline: true },
          { name: 'SCOUTING', value: `${played} Played`, inline: true },
          { name: 'STATUS', value: view.internalStatus, inline: true },
          {
            name: 'PRIVATE RECORD',
            value: `${view.evaluations.length} recent evaluations • ${view.notes.length} recent notes`,
          },
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`bb:manage-action:${view.id}:history`)
          .setLabel('History')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`bb:manage-action:${view.id}:note`)
          .setLabel('Add Note')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`bb:manage-action:${view.id}:evaluate`)
          .setLabel('Evaluate')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`bb:manage-action:${view.id}:status`)
          .setLabel('Status')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

export async function handleBoard(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  await requireManagement(interaction, context);
  const summary = await context.board.summary(interaction.guildId!);
  const tonight = summary.sessions.length
    ? summary.sessions
        .map(
          (session) =>
            `${discordTimestamp(session.startsAt, 't')}  **${session.assignments.length}/${capacity(session.format)}**  ${session.status}`,
        )
        .join('\n')
    : 'No scouting in the next 24 hours.';
  const attention =
    summary.sessions
      .filter((session) => session.assignments.length < capacity(session.format))
      .map(
        (session) =>
          `${discordTimestamp(session.startsAt, 't')} needs ${capacity(session.format) - session.assignments.length} player(s)`,
      )
      .join('\n') || 'All scheduled lineups are full.';
  await interaction.reply({
    ephemeral: true,
    embeds: [
      brandedEmbed()
        .setTitle('MANAGEMENT BOARD')
        .addFields(
          { name: 'NEXT 24 HOURS', value: tonight },
          {
            name: 'SCOUTING POOL',
            value: `${summary.playerCount} Players  •  ${summary.evaluatedPlayers} Evaluated  •  ${summary.shortlisted} Shortlisted`,
          },
          { name: 'NEEDS ATTENTION', value: attention },
        ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bb:manage-action:board:navigate')
          .setPlaceholder('Open management area')
          .addOptions(
            { label: 'Scouting', value: 'scouting' },
            { label: 'Players', value: 'players' },
            { label: 'Shortlist', value: 'shortlist' },
          ),
      ),
    ],
  });
}
