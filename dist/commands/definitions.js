import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, } from 'discord.js';
export const commandDefinitions = [
    new SlashCommandBuilder()
        .setName('profile')
        .setDescription("View or update your Antkogg's LG Assistant player profile"),
    new SlashCommandBuilder().setName('scouting').setDescription('Browse upcoming scouting sessions'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription("Learn how to use Antkogg's LG Assistant"),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription("Configure Antkogg's LG Assistant for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub.setName('view').setDescription('View current server configuration'))
        .addSubcommand((sub) => sub
        .setName('onboarding')
        .setDescription('Post the registration panel to the current channel'))
        .addSubcommand((sub) => sub
        .setName('role-panel')
        .setDescription('Post a permanent position role selection panel')
        .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel to post panel to (default: current channel)')
        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand((sub) => sub
        .setName('channels')
        .setDescription("Configure Antkogg's LG Assistant channels")
        .addChannelOption((option) => option
        .setName('scouting')
        .setDescription('Public scouting channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
        .addChannelOption((option) => option
        .setName('scouting_announcements')
        .setDescription('Scouting announcements channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('availability')
        .setDescription('Weekly team availability channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('team_announcements')
        .setDescription('Team announcements channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('rules')
        .setDescription('LG rules and information channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('management')
        .setDescription('Private management channel')
        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand((sub) => sub
        .setName('roles')
        .setDescription('Configure management and registration roles')
        .addRoleOption((option) => option.setName('owner').setDescription('Owner role'))
        .addRoleOption((option) => option.setName('gm').setDescription('General Manager role'))
        .addRoleOption((option) => option.setName('agm').setDescription('Assistant General Manager role'))
        .addRoleOption((option) => option.setName('roster').setDescription('Roster player role'))
        .addRoleOption((option) => option.setName('tc').setDescription('Training Camp role'))
        .addRoleOption((option) => option.setName('registered').setDescription('Scout / registered player role'))
        .addRoleOption((option) => option.setName('management').setDescription('Optional legacy management role'))
        .addRoleOption((option) => option.setName('lw').setDescription('Optional LW role'))
        .addRoleOption((option) => option.setName('c').setDescription('Optional C role'))
        .addRoleOption((option) => option.setName('rw').setDescription('Optional RW role'))
        .addRoleOption((option) => option.setName('ld').setDescription('Optional LD role'))
        .addRoleOption((option) => option.setName('rd').setDescription('Optional RD role'))
        .addRoleOption((option) => option.setName('g').setDescription('Optional G role')))
        .addSubcommand((sub) => sub
        .setName('defaults')
        .setDescription('Configure timezone, format, duration, and reminders')
        .addStringOption((option) => option
        .setName('timezone')
        .setDescription('Your local timezone')
        .addChoices({ name: 'Eastern Time (EST/EDT)', value: 'America/New_York' }, { name: 'Central Time (CST/CDT)', value: 'America/Chicago' }, { name: 'Mountain Time (MST/MDT)', value: 'America/Denver' }, { name: 'Pacific Time (PST/PDT)', value: 'America/Los_Angeles' }, { name: 'Atlantic Time (AST/ADT)', value: 'America/Halifax' }, { name: 'Alaska Time (AKST/AKDT)', value: 'America/Anchorage' })
        .setRequired(true))
        .addStringOption((option) => option.setName('team_name').setDescription('Team name shown on dashboards'))
        .addStringOption((option) => option.setName('season').setDescription('Season label, e.g. S55'))
        .addStringOption((option) => option
        .setName('reminders')
        .setDescription('Comma-separated minutes before game, e.g. 60,15')))
        .addSubcommand((sub) => sub
        .setName('availability')
        .setDescription('Configure weekly availability reminders')
        .addStringOption((option) => option
        .setName('reminders')
        .setDescription('Minutes before deadline, e.g. 1440,360')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('tc_policy')
        .setDescription('Whether TC availability reminders are sent')
        .addChoices({ name: 'Required', value: 'REQUIRED' }, { name: 'Encouraged', value: 'ENCOURAGED' }, { name: 'Disabled', value: 'DISABLED' })
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName('schedule')
        .setDescription('Configure standard LG game slots and availability deadline')
        .addStringOption((option) => option
        .setName('sunday_times')
        .setDescription('Comma-separated times, e.g. 8:30 PM,9:10 PM')
        .setRequired(true))
        .addStringOption((option) => option.setName('monday_times').setDescription('Comma-separated times').setRequired(true))
        .addStringOption((option) => option.setName('tuesday_times').setDescription('Comma-separated times').setRequired(true))
        .addStringOption((option) => option
        .setName('deadline_day')
        .setDescription('Deadline day')
        .addChoices({ name: 'Saturday before the week', value: '-1' }, { name: 'Sunday', value: '0' })
        .setRequired(true))
        .addStringOption((option) => option
        .setName('deadline_time')
        .setDescription('Deadline time, e.g. 8:00 PM')
        .setRequired(true))
        .addIntegerOption((option) => option
        .setName('server_reminder')
        .setDescription('Minutes before game to warn management')
        .setMinValue(5)
        .setMaxValue(1440))
        .addBooleanOption((option) => option
        .setName('notify_game_info')
        .setDescription('DM confirmed players when server/code is set')))
        .addSubcommand((sub) => sub
        .setName('welcome')
        .setDescription('Configure Discord welcome mode and channels')
        .addStringOption((option) => option
        .setName('mode')
        .setDescription('Select welcome mode: Scouting Mode or Season Mode')
        .addChoices({ name: 'Scouting Mode (pre-season scouting)', value: 'SCOUTING' }, { name: 'Season Mode (roster players & game fill-ins)', value: 'SEASON' }))
        .addChannelOption((option) => option
        .setName('welcome_channel')
        .setDescription('Channel for welcome messages (default: 1533692233268728068)')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('s55_goals')
        .setDescription('Goals & info channel (default: 1534700577789841418)')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('lg_rules')
        .setDescription('LG rules & info channel (default: 1543414198741237911)')
        .addChannelTypes(ChannelType.GuildText))),
    new SlashCommandBuilder()
        .setName('scout')
        .setDescription('Create and manage scouting sessions')
        .addSubcommand((sub) => sub
        .setName('create')
        .setDescription('Create a scouting session')
        .addStringOption((option) => option
        .setName('date')
        .setDescription('Date of the game')
        .addChoices({ name: 'Today', value: 'Today' }, { name: 'Tomorrow', value: 'Tomorrow' }, { name: 'Monday', value: 'Monday' }, { name: 'Tuesday', value: 'Tuesday' }, { name: 'Wednesday', value: 'Wednesday' }, { name: 'Thursday', value: 'Thursday' }, { name: 'Friday', value: 'Friday' }, { name: 'Saturday', value: 'Saturday' }, { name: 'Sunday', value: 'Sunday' })
        .setRequired(true))
        .addStringOption((option) => option
        .setName('time')
        .setDescription('Start time (e.g. 8:15 PM)')
        .setAutocomplete(true)
        .setRequired(true))
        .addStringOption((option) => option
        .setName('format')
        .setDescription('Scouting format')
        .addChoices({ name: 'One Side', value: 'ONE_SIDE' }, { name: 'Private 6v6', value: 'PRIVATE_6V6' })
        .setRequired(true))
        .addStringOption((option) => option
        .setName('mode')
        .setDescription('Signup mode')
        .addChoices({ name: 'Open Signup', value: 'OPEN_SIGNUP' }, { name: 'Availability', value: 'AVAILABILITY' }))
        .addStringOption((option) => option
        .setName('title')
        .setDescription('Optional title (e.g. "Scouting vs X")')
        .setMaxLength(100)))
        .addSubcommand((sub) => sub
        .setName('manage')
        .setDescription('Open the private management panel')
        .addStringOption((option) => option.setName('session').setDescription('Session ID (omit for next session)')))
        .addSubcommand((sub) => sub.setName('upcoming').setDescription('View upcoming sessions'))
        .addSubcommand((sub) => sub.setName('panel').setDescription('Post the Master Management Dashboard to the current channel')),
    new SlashCommandBuilder()
        .setName('player')
        .setDescription('Find a player and open the private management view')
        .addStringOption((option) => option
        .setName('query')
        .setDescription('EA Tag, LG username, or Discord user ID')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('team_status')
        .setDescription('Optionally change team status')
        .addChoices({ name: 'Scout', value: 'SCOUT' }, { name: 'TC', value: 'TC' }, { name: 'Roster', value: 'ROSTER' }, { name: 'Management', value: 'MANAGEMENT' }, { name: 'Alumni / Inactive', value: 'ALUMNI_INACTIVE' }))
        .addStringOption((option) => option
        .setName('tc_status')
        .setDescription('Optionally change private TC status')
        .addChoices({ name: 'Unranked', value: 'UNRANKED' }, { name: 'Developing', value: 'DEVELOPING' }, { name: 'Watch', value: 'WATCH' }, { name: 'Call-Up Ready', value: 'CALL_UP_READY' }, { name: 'Roster Priority', value: 'ROSTER_PRIORITY' })),
    new SlashCommandBuilder().setName('board').setDescription('Open the scouting management board'),
    new SlashCommandBuilder()
        .setName('availability')
        .setDescription('Manage or submit weekly team availability')
        .addSubcommand((sub) => sub.setName('mine').setDescription('View your current weekly availability'))
        .addSubcommand((sub) => sub
        .setName('manage')
        .setDescription('Open the private management week view')
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week')))
        .addSubcommand((sub) => sub
        .setName('missing')
        .setDescription('Show players who have not submitted')
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week'))
        .addStringOption(availabilityFilter)
        .addBooleanOption((option) => option.setName('remind').setDescription('DM only players who have no response')))
        .addSubcommand((sub) => sub
        .setName('state')
        .setDescription('Open, lock, reopen, or close availability')
        .addStringOption((option) => option
        .setName('status')
        .setDescription('New state')
        .addChoices({ name: 'Open / Reopen', value: 'OPEN' }, { name: 'Lock', value: 'LOCKED' }, { name: 'Close', value: 'CLOSED' })
        .setRequired(true))
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week')))
        .addSubcommand((sub) => sub
        .setName('set-player')
        .setDescription("Override a player's weekly availability")
        .addStringOption((option) => option
        .setName('player')
        .setDescription('EA Tag, LG username, or Discord ID')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('games')
        .setDescription('Comma-separated game numbers, or none for unavailable')
        .setRequired(true))
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week'))),
    new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Set your management scheduling timezone')
        .addSubcommand((sub) => sub
        .setName('set')
        .setDescription('Save your timezone')
        .addStringOption((option) => option
        .setName('timezone')
        .setDescription('IANA timezone')
        .addChoices({ name: 'Eastern', value: 'America/New_York' }, { name: 'Central', value: 'America/Chicago' }, { name: 'Mountain', value: 'America/Edmonton' }, { name: 'Pacific', value: 'America/Los_Angeles' }, { name: 'Atlantic', value: 'America/Halifax' }, { name: 'Newfoundland', value: 'America/St_Johns' })
        .setRequired(true)))
        .addSubcommand((sub) => sub.setName('view').setDescription('View your saved timezone')),
    new SlashCommandBuilder()
        .setName('week')
        .setDescription('Create and manage the LG week')
        .addSubcommand((sub) => sub
        .setName('setup')
        .setDescription('Create a week from standard slots')
        .addIntegerOption((option) => option.setName('season').setDescription('Season number').setMinValue(1).setRequired(true))
        .addIntegerOption((option) => option.setName('week').setDescription('Week number').setMinValue(1).setRequired(true))
        .addStringOption((option) => option.setName('sunday').setDescription('Optional Sunday date: YYYY-MM-DD')))
        .addSubcommand((sub) => sub.setName('next').setDescription('Create the next week from standard slots'))
        .addSubcommand((sub) => sub.setName('view').setDescription('View the current week')),
    new SlashCommandBuilder().setName('schedule').setDescription('View the current LG schedule'),
    new SlashCommandBuilder().setName('game').setDescription('View your nearest confirmed game'),
    new SlashCommandBuilder()
        .setName('team')
        .setDescription('Open the regular-season management dashboard'),
    new SlashCommandBuilder()
        .setName('tc')
        .setDescription('Manage the Training Camp group')
        .addSubcommand((sub) => sub.setName('board').setDescription('Open the private TC development board'))
        .addSubcommand((sub) => sub
        .setName('player')
        .setDescription('Open a private TC player view')
        .addStringOption((option) => option
        .setName('query')
        .setDescription('EA Tag, LG username, or Discord ID')
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName('status')
        .setDescription('Set a private TC status')
        .addStringOption((option) => option
        .setName('player')
        .setDescription('EA Tag, LG username, or Discord ID')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('status')
        .setDescription('TC readiness')
        .addChoices({ name: 'Unranked', value: 'UNRANKED' }, { name: 'Developing', value: 'DEVELOPING' }, { name: 'Watch', value: 'WATCH' }, { name: 'Call-Up Ready', value: 'CALL_UP_READY' }, { name: 'Roster Priority', value: 'ROSTER_PRIORITY' })
        .setRequired(true))),
    new SlashCommandBuilder().setName('rules').setDescription('Browse official LG rule sources'),
    new SlashCommandBuilder()
        .setName('rule')
        .setDescription('Search or maintain official LG rules')
        .addSubcommand((sub) => sub
        .setName('search')
        .setDescription('Search indexed official rule text')
        .addStringOption((option) => option.setName('query').setDescription('Rule topic or phrase').setRequired(true)))
        .addSubcommand((sub) => sub
        .setName('ask')
        .setDescription('Retrieve official sources for a rule question')
        .addStringOption((option) => option
        .setName('question')
        .setDescription('Question to ground in official rules')
        .setRequired(true)))
        .addSubcommand((sub) => sub
        .setName('admin-add')
        .setDescription('Add or replace an official rule text version')
        .addStringOption((option) => option.setName('key').setDescription('Stable document key').setRequired(true))
        .addStringOption((option) => option.setName('title').setDescription('Official document title').setRequired(true))
        .addStringOption((option) => option
        .setName('kind')
        .setDescription('Document type')
        .addChoices({ name: 'Constitution', value: 'CONSTITUTION' }, { name: 'Playoff', value: 'PLAYOFF' }, { name: 'NHL 27 Builds', value: 'BUILD_RULES' }, { name: 'Disconnect', value: 'DISCONNECT' }, { name: 'Other', value: 'OTHER' })
        .setRequired(true))
        .addStringOption((option) => option.setName('version').setDescription('Version or season label').setRequired(true))
        .addAttachmentOption((option) => option
        .setName('text')
        .setDescription('UTF-8 text extracted from official source')
        .setRequired(true))
        .addStringOption((option) => option.setName('source').setDescription('Official HTTPS source URL').setRequired(true)))
        .addSubcommand((sub) => sub
        .setName('admin-state')
        .setDescription('Activate or deactivate a rule document')
        .addStringOption((option) => option.setName('key').setDescription('Document key').setRequired(true))
        .addBooleanOption((option) => option.setName('active').setDescription('Active state').setRequired(true))),
    new SlashCommandBuilder()
        .setName('builds')
        .setDescription('View configured official NHL 27 build restrictions'),
    new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('View the configured official disconnect procedure'),
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Post a management announcement')
        .addStringOption((option) => option
        .setName('target')
        .setDescription('Who to notify')
        .addChoices({ name: 'Everyone', value: 'EVERYONE' }, { name: 'Roster', value: 'ROSTER' }, { name: 'TC', value: 'TC' }, { name: 'Roster + TC', value: 'TEAM' }, { name: 'No ping', value: 'NONE' })
        .setRequired(true))
        .addStringOption((option) => option.setName('title').setDescription('Announcement title').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription('Announcement message').setRequired(true)),
].map((command) => command.toJSON());
function availabilityFilter(option) {
    return option
        .setName('filter')
        .setDescription('Filter players')
        .addChoices({ name: 'Roster only', value: 'roster' }, { name: 'TC only', value: 'tc' }, { name: 'Forwards', value: 'forwards' }, { name: 'Defense', value: 'defense' }, { name: 'Goalies', value: 'goalies' });
}
//# sourceMappingURL=definitions.js.map