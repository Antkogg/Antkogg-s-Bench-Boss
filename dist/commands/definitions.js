import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, } from 'discord.js';
export const commandDefinitions = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription("Quick guide for using the Chel bot"),
    new SlashCommandBuilder()
        .setName('games')
        .setDescription('View scheduled games and lineup cards for this week'),
    new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('View scheduled games and lineup cards for this week'),
    new SlashCommandBuilder()
        .setName('game')
        .setDescription('View your nearest confirmed game details (server, code, time)'),
    new SlashCommandBuilder()
        .setName('add-game')
        .setDescription('Add a game to the schedule (opponent, date, time)')
        .addStringOption((option) => option.setName('opponent').setDescription('Opponent team name (e.g. Bruins, NYR)').setRequired(true))
        .addStringOption((option) => option
        .setName('date')
        .setDescription('Game date (e.g. Sunday, Monday, Tomorrow, Today, or 10/04)')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('time')
        .setDescription('Game start time (e.g. 8:30 PM, 9:00 PM, 21:00)')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('home_away')
        .setDescription('Home or Away game (default: Home)')
        .addChoices({ name: 'Home', value: 'HOME' }, { name: 'Away', value: 'AWAY' }))
        .addStringOption((option) => option.setName('server').setDescription('Optional server name (e.g. East Coast 1)'))
        .addStringOption((option) => option.setName('code').setDescription('Optional game password/code')),
    new SlashCommandBuilder()
        .setName('add-games')
        .setDescription('Bulk add multiple games at once (paste your schedule)')
        .addStringOption((option) => option
        .setName('schedule')
        .setDescription('Paste games: e.g. Sunday 8:30 PM vs Bruins / Monday 9:00 PM @ Rangers')
        .setRequired(true)),
    new SlashCommandBuilder()
        .setName('delete-game')
        .setDescription('Delete a game from the schedule')
        .addStringOption((option) => option.setName('game').setDescription('Game number (1, 2...) or ID to delete').setRequired(true)),
    new SlashCommandBuilder()
        .setName('post-week')
        .setDescription('Post official LG week schedule and availability cards to #team-availability')
        .addStringOption((option) => option
        .setName('week')
        .setDescription('Select week (Week 2, Week 3, Week 4, Week 5, Week 6)')
        .addChoices({ name: 'Week 2 (Oct 04 - Oct 06)', value: 'week-2' }, { name: 'Week 3 (Oct 11 - Oct 13)', value: 'week-3' }, { name: 'Week 4 (Oct 18 - Oct 20)', value: 'week-4' }, { name: 'Week 5 (Oct 25 - Oct 27)', value: 'week-5' }, { name: 'Week 6 (Nov 01 - Nov 03)', value: 'week-6' }, { name: 'Week 7 (Nov 08 - Nov 10)', value: 'week-7' }, { name: 'Week 8 (Nov 15 - Nov 17)', value: 'week-8' })),
    new SlashCommandBuilder()
        .setName('lineup')
        .setDescription('Set starters for a game or assign an entire night line')
        .addStringOption((option) => option
        .setName('night')
        .setDescription('Assign entire line to a full night (Sunday, Monday, Tuesday)')
        .addChoices({ name: 'Sunday (All 3 games)', value: 'SUNDAY' }, { name: 'Monday (All 3 games)', value: 'MONDAY' }, { name: 'Tuesday (All 3 games)', value: 'TUESDAY' }))
        .addUserOption((option) => option.setName('lw').setDescription('Left Wing (LW)'))
        .addUserOption((option) => option.setName('c').setDescription('Center (C)'))
        .addUserOption((option) => option.setName('rw').setDescription('Right Wing (RW)'))
        .addUserOption((option) => option.setName('ld').setDescription('Left Defense (LD)'))
        .addUserOption((option) => option.setName('rd').setDescription('Right Defense (RD)'))
        .addUserOption((option) => option.setName('g').setDescription('Goalie (G)'))
        .addStringOption((option) => option.setName('game').setDescription('Game number (1, 2...) or ID to set individually')),
    new SlashCommandBuilder()
        .setName('set-code')
        .setDescription('Set or update server and password code for a game')
        .addStringOption((option) => option.setName('server').setDescription('Server name (e.g. East Coast 1)').setRequired(true))
        .addStringOption((option) => option.setName('code').setDescription('Game password/code').setRequired(true))
        .addStringOption((option) => option
        .setName('game')
        .setDescription('Game number (1, 2...) or ID (omit for nearest upcoming game)')),
    new SlashCommandBuilder()
        .setName('set-position')
        .setDescription('Set a player position (LW, C, RW, LD, RD, G)')
        .addUserOption((option) => option.setName('player').setDescription('Select the team player').setRequired(true))
        .addStringOption((option) => option
        .setName('position')
        .setDescription('Position to assign')
        .setRequired(true)
        .addChoices({ name: 'Left Wing (LW)', value: 'LW' }, { name: 'Center (C)', value: 'C' }, { name: 'Right Wing (RW)', value: 'RW' }, { name: 'Left Defense (LD)', value: 'LD' }, { name: 'Right Defense (RD)', value: 'RD' }, { name: 'Goalie (G)', value: 'G' })),
    new SlashCommandBuilder()
        .setName('set-positions')
        .setDescription('View and set positions for all roster players')
        .addStringOption((option) => option
        .setName('roster')
        .setDescription('Optional: paste list like @Player C (omit to pull all team players)')
        .setRequired(false)),
    new SlashCommandBuilder()
        .setName('availability')
        .setDescription('Manage or check team availability')
        .addSubcommand((sub) => sub.setName('mine').setDescription('View your current weekly availability'))
        .addSubcommand((sub) => sub
        .setName('missing')
        .setDescription('Show players who have not submitted availability')
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week'))
        .addStringOption(availabilityFilter)
        .addBooleanOption((option) => option.setName('remind').setDescription('DM players who have no response')))
        .addSubcommand((sub) => sub
        .setName('manage')
        .setDescription('Open the management week availability view')
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week')))
        .addSubcommand((sub) => sub
        .setName('state')
        .setDescription('Open, lock, or reopen availability')
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
        .setDescription('Player name, EA Tag, or Discord ID')
        .setRequired(true))
        .addStringOption((option) => option
        .setName('games')
        .setDescription('Comma-separated game numbers, or none for unavailable')
        .setRequired(true))
        .addStringOption((option) => option.setName('week').setDescription('Week ID; omit for current week'))),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription("Configure bot settings for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub.setName('view').setDescription('View current server configuration'))
        .addSubcommand((sub) => sub
        .setName('roles')
        .setDescription('Configure team role (@S55 BU) and management roles')
        .addRoleOption((option) => option.setName('roster').setDescription('Team player role (e.g. @S55 BU)'))
        .addRoleOption((option) => option.setName('owner').setDescription('Owner role'))
        .addRoleOption((option) => option.setName('gm').setDescription('General Manager role'))
        .addRoleOption((option) => option.setName('agm').setDescription('Assistant General Manager role'))
        .addRoleOption((option) => option.setName('management').setDescription('Optional management role'))
        .addRoleOption((option) => option.setName('lw').setDescription('Optional LW role'))
        .addRoleOption((option) => option.setName('c').setDescription('Optional C role'))
        .addRoleOption((option) => option.setName('rw').setDescription('Optional RW role'))
        .addRoleOption((option) => option.setName('ld').setDescription('Optional LD role'))
        .addRoleOption((option) => option.setName('rd').setDescription('Optional RD role'))
        .addRoleOption((option) => option.setName('g').setDescription('Optional G role')))
        .addSubcommand((sub) => sub
        .setName('channels')
        .setDescription("Configure availability and management channels")
        .addChannelOption((option) => option
        .setName('availability')
        .setDescription('Weekly team availability channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('management')
        .setDescription('Private management channel')
        .addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option
        .setName('team_announcements')
        .setDescription('Team announcements channel')
        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand((sub) => sub
        .setName('defaults')
        .setDescription('Configure timezone, team name, and reminders')
        .addStringOption((option) => option
        .setName('timezone')
        .setDescription('Your local timezone')
        .addChoices({ name: 'Eastern Time (EST/EDT)', value: 'America/New_York' }, { name: 'Central Time (CST/CDT)', value: 'America/Chicago' }, { name: 'Mountain Time (MST/MDT)', value: 'America/Denver' }, { name: 'Pacific Time (PST/PDT)', value: 'America/Los_Angeles' }, { name: 'Atlantic Time (AST/ADT)', value: 'America/Halifax' }, { name: 'Alaska Time (AKST/AKDT)', value: 'America/Anchorage' })
        .setRequired(true))
        .addStringOption((option) => option.setName('team_name').setDescription('Team name shown on schedule'))
        .addStringOption((option) => option.setName('season').setDescription('Season label, e.g. S55'))
        .addStringOption((option) => option
        .setName('reminders')
        .setDescription('Comma-separated minutes before game, e.g. 60,15')))
        .addSubcommand((sub) => sub
        .setName('schedule')
        .setDescription('Configure standard game slots and deadline')
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
        .setDescription('DM confirmed players when server/code is set'))),
].map((command) => command.toJSON());
function availabilityFilter(option) {
    return option
        .setName('filter')
        .setDescription('Filter players')
        .addChoices({ name: 'Forwards', value: 'forwards' }, { name: 'Defense', value: 'defense' }, { name: 'Goalies', value: 'goalies' });
}
//# sourceMappingURL=definitions.js.map