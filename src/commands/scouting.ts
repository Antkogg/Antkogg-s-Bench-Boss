import { DateTime } from 'luxon';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { SessionFormat, SignupMode } from '../generated/prisma/enums.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { capacity } from '../domain/scouting.js';
import { renderManagementPanel } from '../renderers/management.renderer.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import type { BotContext } from './context.js';

export async function handleScoutingBrowser(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this command in the server.');
  const sessions = await context.scouting.upcoming(interaction.guildId);
  if (!sessions.length) {
    await interaction.reply({
      ephemeral: true,
      embeds: [
        brandedEmbed()
          .setTitle('UPCOMING SCOUTING')
          .setDescription('No upcoming sessions are posted yet.'),
      ],
    });
    return;
  }
  const embed = brandedEmbed()
    .setTitle('UPCOMING SCOUTING')
    .setDescription('Choose a time to jump to its signup post.')
    .addFields(
      ...sessions.slice(0, 10).map((session) => ({
        name: `${discordTimestamp(session.startsAt, 'D')} • ${discordTimestamp(session.startsAt, 't')}`,
        value: `${session.format === 'PRIVATE_6V6' ? 'Private 6v6' : 'One Side'} • ${session.assignments.length}/${capacity(session.format)} • ${session.status}`,
        inline: true,
      })),
    );
  const links = sessions.filter((session) => session.channelId && session.messageId).slice(0, 5);
  const components = links.length
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...links.map((session) =>
            new ButtonBuilder()
              .setLabel(DateTime.fromJSDate(session.startsAt).toFormat('ccc h:mm a'))
              .setStyle(ButtonStyle.Link)
              .setURL(
                `https://discord.com/channels/${interaction.guildId}/${session.channelId}/${session.messageId}`,
              ),
          ),
        ),
      ]
    : [];
  await interaction.reply({ ephemeral: true, embeds: [embed], components });
}

export async function handleScout(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId || !interaction.member || !('roles' in interaction.member))
    throw new AppError('NOT_ALLOWED', 'Use this command in the server.');
  const config = await context.config.ensure(interaction.guildId);
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!hasManagementAccess(accessLevel(member, config.managementRoleId)))
    throw new AppError('NOT_ALLOWED', 'This command is for Bench Boss management.');
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'upcoming') return handleScoutingBrowser(interaction, context);
  if (subcommand === 'create') {
    if (!config.scoutingChannelId)
      throw new AppError(
        'NOT_CONFIGURED',
        'Configure the scouting channel with `/setup channels` first.',
      );
    const local = interaction.options.getString('starts', true);
    const starts = DateTime.fromFormat(local, 'yyyy-MM-dd HH:mm', { zone: config.timezone });
    if (!starts.isValid)
      throw new AppError('INVALID_INPUT', 'Use `YYYY-MM-DD HH:mm`, such as `2026-08-19 21:00`.');
    if (starts.toMillis() < Date.now() - 60_000)
      throw new AppError('INVALID_INPUT', 'Scouting must start in the future.');
    await interaction.deferReply({ ephemeral: true });
    const note = interaction.options.getString('note');
    const session = await context.scouting.create({
      guildId: interaction.guildId,
      startsAt: starts.toUTC().toJSDate(),
      durationMinutes: interaction.options.getInteger('duration') ?? config.defaultDurationMinutes,
      format: (interaction.options.getString('format') ?? config.defaultFormat) as SessionFormat,
      signupMode: (interaction.options.getString('mode') ?? 'OPEN_SIGNUP') as SignupMode,
      ...(note ? { note } : {}),
      createdByDiscordId: interaction.user.id,
    });
    await context.posts.publish(session);
    await interaction.editReply({
      embeds: [
        renderSuccess(
          'Scouting posted',
          `${discordTimestamp(session.startsAt, 'F')} is live in <#${session.guildConfig.scoutingChannelId}>.`,
        ),
      ],
    });
    return;
  }
  const requestedId = interaction.options.getString('session');
  const session = requestedId
    ? await context.scouting.get(requestedId)
    : (await context.scouting.upcoming(interaction.guildId, 1))[0];
  if (!session) throw new AppError('NOT_FOUND', 'No upcoming scouting session was found.');
  await interaction.reply({ ephemeral: true, ...renderManagementPanel(session) });
}
