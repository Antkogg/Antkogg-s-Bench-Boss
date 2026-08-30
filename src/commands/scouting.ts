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
  if (!hasManagementAccess(accessLevel(member, config)))
    throw new AppError('NOT_ALLOWED', 'This command is for LG Assistant management.');
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'upcoming') return handleScoutingBrowser(interaction, context);
  if (subcommand === 'create') {
    if (!config.scoutingChannelId)
      throw new AppError(
        'NOT_CONFIGURED',
        'Configure the scouting channel with `/setup channels` first.',
      );
    const dateStr = interaction.options.getString('date', true);
    const timeStr = interaction.options.getString('time', true);

    let starts = DateTime.now().setZone(config.timezone);
    if (dateStr === 'Tomorrow') {
      starts = starts.plus({ days: 1 });
    } else if (dateStr !== 'Today') {
      const targetDayMap: Record<string, number> = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
      };
      const targetDay = targetDayMap[dateStr];
      if (targetDay) {
        let daysToAdd = targetDay - starts.weekday;
        if (daysToAdd <= 0) daysToAdd += 7;
        starts = starts.plus({ days: daysToAdd });
      }
    }

    let hours = 0;
    let minutes = 0;
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
    } else {
      const pmMatch = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
      if (pmMatch && pmMatch[1] && pmMatch[3]) {
        hours = parseInt(pmMatch[1], 10);
        minutes = parseInt(pmMatch[2] || '0', 10);
        if (pmMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (pmMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
      } else {
        throw new AppError(
          'INVALID_INPUT',
          'Please select a valid time from the dropdown suggestions.',
        );
      }
    }

    starts = starts.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    if (!starts.isValid)
      throw new AppError('INVALID_INPUT', 'Failed to parse the selected date and time.');
    if (starts.toMillis() < Date.now() - 60_000)
      throw new AppError(
        'INVALID_INPUT',
        'Scouting must start in the future. Check your time selection.',
      );
    await interaction.deferReply({ ephemeral: true });
    const title = interaction.options.getString('title');
    const session = await context.scouting.create({
      guildId: interaction.guildId,
      startsAt: starts.toUTC().toJSDate(),
      durationMinutes: config.defaultDurationMinutes,
      format: interaction.options.getString('format', true) as SessionFormat,
      signupMode: (interaction.options.getString('mode') ?? 'OPEN_SIGNUP') as SignupMode,
      ...(title ? { note: title } : {}),
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
