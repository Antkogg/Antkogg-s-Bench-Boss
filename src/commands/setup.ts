import { DateTime } from 'luxon';
import type { ChatInputCommandInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import type { BotContext } from './context.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { customId } from '../utils/custom-id.js';

export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Setup is only available in a server.');
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    throw new AppError(
      'NOT_ALLOWED',
      "Only server administrators can configure Antkogg's LG Assistant.",
    );
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'view') {
    const config = await context.config.ensure(interaction.guildId);
    await interaction.reply({
      ephemeral: true,
      embeds: [
        brandedEmbed()
          .setTitle('SERVER SETUP')
          .addFields(
            {
              name: 'SCOUTING CHANNEL',
              value: config.scoutingChannelId ? `<#${config.scoutingChannelId}>` : 'Not configured',
              inline: true,
            },
            {
              name: 'MANAGEMENT ROLE',
              value:
                [config.ownerRoleId, config.gmRoleId, config.agmRoleId, config.managementRoleId]
                  .filter(Boolean)
                  .map((id) => `<@&${id}>`)
                  .join(' • ') || 'Administrators only',
              inline: true,
            },
            {
              name: 'TEAM CHANNELS',
              value: `Availability: ${config.teamAvailabilityChannelId ? `<#${config.teamAvailabilityChannelId}>` : 'Not configured'}\nAnnouncements: ${config.teamAnnouncementsChannelId ? `<#${config.teamAnnouncementsChannelId}>` : 'Not configured'}`,
              inline: false,
            },
            { name: 'TIMEZONE', value: config.timezone, inline: true },
            {
              name: 'DEFAULTS',
              value: `${config.defaultFormat} • ${config.defaultDurationMinutes} min`,
              inline: true,
            },
            {
              name: 'REMINDERS',
              value: config.reminderMinutes.map((minutes) => `${minutes} min`).join(' • '),
              inline: true,
            },
            {
              name: 'WELCOME CONFIG',
              value: `Mode: **${config.welcomeMode}**\nChannel: ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : '<#1533692233268728068>'}\nGoals Channel: ${config.s55GoalsChannelId ? `<#${config.s55GoalsChannelId}>` : '<#1534700577789841418>'}\nRules Channel: ${config.lgRulesChannelId ? `<#${config.lgRulesChannelId}>` : '<#1543414198741237911>'}`,
              inline: false,
            },
          ),
      ],
    });
    return;
  }
  if (subcommand === 'onboarding') {
    if (!interaction.channel) throw new AppError('NOT_FOUND', 'This must be used in a channel.');
    await interaction.channel.send({
      embeds: [
        brandedEmbed()
          .setTitle('SCOUTING REGISTRATION')
          .setThumbnail(interaction.client.user.displayAvatarURL())
          .setDescription(
            'Would you like to scout with us?\n\nClick the button below to register your **exact EA Tag** and positions so you can jump into upcoming scouting games.',
          ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(customId('profile-action', 'register'))
            .setLabel('Register for Scouting')
            .setStyle(ButtonStyle.Primary),
        ),
      ],
    });
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Onboarding posted', 'The registration panel has been posted.')],
    });
    return;
  }
  if (subcommand === 'channels') {
    const scouting = interaction.options.getChannel('scouting', true);
    const management = interaction.options.getChannel('management');
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      scoutingChannelId: scouting.id,
      managementChannelId: management?.id ?? null,
      scoutingAnnouncementsChannelId:
        interaction.options.getChannel('scouting_announcements')?.id ?? null,
      teamAvailabilityChannelId: interaction.options.getChannel('availability')?.id ?? null,
      teamAnnouncementsChannelId: interaction.options.getChannel('team_announcements')?.id ?? null,
      rulesChannelId: interaction.options.getChannel('rules')?.id ?? null,
    });
  } else if (subcommand === 'roles') {
    const positionRoleIds = Object.fromEntries(
      ['lw', 'c', 'rw', 'ld', 'rd', 'g']
        .map((name) => [name.toUpperCase(), interaction.options.getRole(name)?.id] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      ownerRoleId: interaction.options.getRole('owner')?.id ?? null,
      gmRoleId: interaction.options.getRole('gm')?.id ?? null,
      agmRoleId: interaction.options.getRole('agm')?.id ?? null,
      rosterRoleId: interaction.options.getRole('roster')?.id ?? null,
      tcRoleId: interaction.options.getRole('tc')?.id ?? null,
      scoutRoleId: interaction.options.getRole('registered')?.id ?? null,
      managementRoleId: interaction.options.getRole('management')?.id ?? null,
      registeredRoleId: interaction.options.getRole('registered')?.id ?? null,
      forwardRoleId: null,
      defenseRoleId: null,
      goalieRoleId: null,
      positionRoleIds,
    });
  } else if (subcommand === 'schedule') {
    const split = (name: string) =>
      interaction.options
        .getString(name, true)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    await context.schedule.configureSlots(
      interaction.guildId,
      interaction.user.id,
      {
        SUNDAY: split('sunday_times'),
        MONDAY: split('monday_times'),
        TUESDAY: split('tuesday_times'),
      },
      {
        dayOffset: Number(interaction.options.getString('deadline_day', true)),
        localTime: interaction.options.getString('deadline_time', true),
      },
    );
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      serverCodeReminderMinutes: interaction.options.getInteger('server_reminder') ?? 60,
      notifyConfirmedGameInfo: interaction.options.getBoolean('notify_game_info') ?? true,
    });
  } else if (subcommand === 'availability') {
    const reminderText = interaction.options.getString('reminders', true);
    const reminders = parseReminders(reminderText, 10080);
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      availabilityReminderMinutes: reminders,
      tcReminderPolicy: interaction.options.getString('tc_policy', true) as
        'REQUIRED' | 'ENCOURAGED' | 'DISABLED',
    });
  } else if (subcommand === 'welcome') {
    const mode = interaction.options.getString('mode') as 'SCOUTING' | 'SEASON' | null;
    const welcomeChannelId = interaction.options.getChannel('welcome_channel')?.id;
    const s55GoalsChannelId = interaction.options.getChannel('s55_goals')?.id;
    const lgRulesChannelId = interaction.options.getChannel('lg_rules')?.id;
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      ...(mode ? { welcomeMode: mode } : {}),
      ...(welcomeChannelId ? { welcomeChannelId } : {}),
      ...(s55GoalsChannelId ? { s55GoalsChannelId } : {}),
      ...(lgRulesChannelId ? { lgRulesChannelId } : {}),
    });
  } else {
    const timezone = interaction.options.getString('timezone', true);
    if (!DateTime.now().setZone(timezone).isValid)
      throw new AppError('INVALID_INPUT', 'Use a valid IANA timezone such as `America/New_York`.');
    const reminderText = interaction.options.getString('reminders') ?? '60,15';
    const reminders = parseReminders(reminderText, 1440);
    const teamName = interaction.options.getString('team_name');
    const seasonLabel = interaction.options.getString('season');
    await context.config.update({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      timezone,
      defaultFormat: 'PRIVATE_6V6',
      defaultDurationMinutes: 60,
      reminderMinutes: reminders,
      ...(teamName ? { teamName } : {}),
      ...(seasonLabel ? { seasonLabel } : {}),
    });
  }
  await interaction.reply({
    ephemeral: true,
    embeds: [
      renderSuccess(
        'Setup saved',
        "Antkogg's LG Assistant configuration is stored and ready to use.",
      ),
    ],
  });
}

function parseReminders(value: string, maximum: number): number[] {
  const reminders = [...new Set(value.split(',').map(Number))]
    .filter((minutes) => Number.isInteger(minutes) && minutes > 0 && minutes <= maximum)
    .sort((a, b) => b - a);
  if (!reminders.length)
    throw new AppError(
      'INVALID_INPUT',
      'Reminder times must be comma-separated minutes, such as `60,15`.',
    );
  return reminders;
}
