import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View or update your Bench Boss player profile'),
  new SlashCommandBuilder().setName('scouting').setDescription('Browse upcoming scouting sessions'),
  new SlashCommandBuilder().setName('help').setDescription('Learn how to use Bench Boss'),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Bench Boss for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('view').setDescription('View current server configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('channels')
        .setDescription('Configure Bench Boss channels')
        .addChannelOption((option) =>
          option
            .setName('scouting')
            .setDescription('Public scouting channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('management')
            .setDescription('Private management channel')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Configure management and registration roles')
        .addRoleOption((option) =>
          option.setName('management').setDescription('Management role').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('registered').setDescription('Registered player role'),
        )
        .addRoleOption((option) => option.setName('lw').setDescription('Optional LW role'))
        .addRoleOption((option) => option.setName('c').setDescription('Optional C role'))
        .addRoleOption((option) => option.setName('rw').setDescription('Optional RW role'))
        .addRoleOption((option) => option.setName('ld').setDescription('Optional LD role'))
        .addRoleOption((option) => option.setName('rd').setDescription('Optional RD role'))
        .addRoleOption((option) => option.setName('g').setDescription('Optional G role')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('defaults')
        .setDescription('Configure timezone, format, duration, and reminders')
        .addStringOption((option) =>
          option
            .setName('timezone')
            .setDescription('IANA timezone, e.g. America/New_York')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('format')
            .setDescription('Default scouting format')
            .addChoices(
              { name: 'One Side', value: 'ONE_SIDE' },
              { name: 'Private 6v6', value: 'PRIVATE_6V6' },
            )
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('duration')
            .setDescription('Default game duration in minutes')
            .setMinValue(15)
            .setMaxValue(360)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('reminders')
            .setDescription('Comma-separated minutes before game, e.g. 60,15'),
        ),
    ),
  new SlashCommandBuilder()
    .setName('scout')
    .setDescription('Create and manage scouting sessions')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a scouting session')
        .addStringOption((option) =>
          option
            .setName('starts')
            .setDescription('Local date/time: YYYY-MM-DD HH:mm')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('format')
            .setDescription('Scouting format')
            .addChoices(
              { name: 'One Side', value: 'ONE_SIDE' },
              { name: 'Private 6v6', value: 'PRIVATE_6V6' },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName('duration')
            .setDescription('Expected duration in minutes')
            .setMinValue(15)
            .setMaxValue(360),
        )
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Signup mode')
            .addChoices(
              { name: 'Open Signup', value: 'OPEN_SIGNUP' },
              { name: 'Availability', value: 'AVAILABILITY' },
            ),
        )
        .addStringOption((option) =>
          option.setName('note').setDescription('Optional note').setMaxLength(500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('manage')
        .setDescription('Open the private management panel')
        .addStringOption((option) =>
          option.setName('session').setDescription('Session ID (omit for next session)'),
        ),
    )
    .addSubcommand((sub) => sub.setName('upcoming').setDescription('View upcoming sessions')),
  new SlashCommandBuilder()
    .setName('player')
    .setDescription('Find a player and open the private management view')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('EA Tag, LG username, or Discord user ID')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('board').setDescription('Open the Bench Boss management board'),
].map((command) => command.toJSON());
