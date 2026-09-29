import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { brandedEmbed } from '../renderers/design.js';
export async function handleHelp(interaction, context) {
    let isManager = false;
    if (context && interaction.guildId && interaction.guild) {
        try {
            const [config, member] = await Promise.all([
                context.config.ensure(interaction.guildId),
                interaction.guild.members.fetch(interaction.user.id),
            ]);
            isManager = hasManagementAccess(accessLevel(member, config));
        }
        catch {
            isManager = false;
        }
    }
    const embed = isManager
        ? brandedEmbed()
            .setTitle("MANAGEMENT GUIDE  •  ANTKOGG'S LG ASSISTANT")
            .setDescription('Controls for creating scouting sessions, managing rosters, availability, and server setup.')
            .addFields({
            name: '1 • ADDING GAMES (SUPER SIMPLE)',
            value: '`/add-game` — Add a game with opponent, date, time (e.g. `/add-game opponent:Bruins date:Sunday time:8:30 PM`). No setup required! Automatically posts to `#team-availability`.\n`/set-code` — Set server name and game code for upcoming games.\n`/games` or `/schedule` — View weekly schedule and lineup cards.\n`/delete-game` — Remove any game from the schedule.',
        }, {
            name: '2 • LINEUP & ROSTER CONTROLS',
            value: 'Click **Build Lineup** to select players directly from Discord or registered team roster.\nClick **Confirm Lineup** when ready — confirmed players receive reminders and can check `/game`.',
        }, {
            name: '3 • SCOUTING SESSIONS',
            value: '`/scout create` — Create a new scouting session (One-side or 6v6).\n`/scout panel` — Master management control panel.\n`/scouting` — Browse upcoming sessions.',
        }, {
            name: '4 • TEAM & PLAYER MANAGEMENT',
            value: '`/player` — Search players, view activity logs, and edit status.\n`/team` & `/tc` — Manage roster and Training Camp players.',
        }, {
            name: '5 • SERVER CONFIGURATION',
            value: '`/setup` — Configure management roles, channels, and defaults.\n`/rules` — Manage rule documents for `/builds` and `/disconnect`.',
        })
        : brandedEmbed()
            .setTitle("PLAYER GUIDE  •  ANTKOGG'S LG ASSISTANT")
            .setDescription('Join scouting games, submit weekly availability, and check official rules—right inside Discord.')
            .addFields({
            name: '1 • FIND SCOUTING',
            value: 'Run `/scouting` or check your server’s scouting channel for upcoming games.',
        }, {
            name: '2 • CLAIM A SPOT',
            value: 'Tap any position button (**LW**, **C**, **RW**, **LD**, **RD**, **G**) on a scouting post. You are confirmed immediately with zero sign-up required!',
        }, {
            name: '3 • SWITCH OR LEAVE',
            value: 'Tap another position to switch spots, or tap **Leave Game** to release your spot for waitlisted players.',
        }, {
            name: '4 • WEEKLY AVAILABILITY',
            value: 'Use the weekly availability post to mark when you can play, or run `/availability mine` to check your submission.',
        }, {
            name: '5 • GAME DAY & RULES',
            value: 'Run `/game` to see your next confirmed game details, or check `/rules`, `/builds`, and `/disconnect` for official league rules.',
        }, {
            name: '6 • PROFILE (OPTIONAL)',
            value: 'Run `/profile` at any time if you want to view your stats or update your EA Tag / LG Username.',
        });
    await interaction.reply({
        ephemeral: true,
        embeds: [embed],
    });
}
//# sourceMappingURL=help.js.map