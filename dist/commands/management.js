import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, } from 'discord.js';
import { capacity } from '../domain/scouting.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
export async function handlePlayerSearch(interaction, context) {
    await requireManagement(interaction, context);
    const players = await context.players.search(interaction.guildId, interaction.options.getString('query', true));
    if (!players.length)
        throw new AppError('NOT_FOUND', 'No matching player was found.');
    const selected = players[0];
    const requestedTeamStatus = interaction.options.getString('team_status');
    const requestedTcStatus = interaction.options.getString('tc_status');
    let current = selected;
    if (requestedTeamStatus) {
        current = await context.team.setTeamStatus(selected.id, requestedTeamStatus, interaction.user.id);
        if (interaction.guild) {
            try {
                const member = await interaction.guild.members.fetch(current.discordUserId);
                const config = await context.config.ensure(interaction.guildId);
                await context.roles.sync(member, current, config);
            }
            catch {
                // Database status remains authoritative if the Discord member/role is unavailable.
            }
        }
    }
    if (requestedTcStatus)
        current = await context.team.setTcStatus(selected.id, requestedTcStatus, interaction.user.id);
    const view = await context.evaluations.playerView(current.id);
    const played = view.attendance.filter((item) => item.status === 'PLAYED').length;
    const noShows = view.attendance.filter((item) => item.status === 'NO_SHOW').length;
    const availabilityRate = view.weeklyAvailability.length
        ? `${view.weeklyAvailability.length} week(s) submitted`
        : 'No weekly availability history';
    await interaction.reply({
        ephemeral: true,
        embeds: [
            brandedEmbed()
                .setTitle('PLAYER • MANAGEMENT')
                .addFields({ name: 'EA TAG', value: `\`${view.eaTag}\``, inline: true }, {
                name: 'LG',
                value: `${view.lgUsername} • ${view.signupPositions.join('/')}`,
                inline: true,
            }, { name: 'SCOUTING', value: `${played} Played`, inline: true }, { name: 'TEAM STATUS', value: view.teamStatus, inline: true }, { name: 'SCOUTING STATUS', value: view.internalStatus, inline: true }, { name: 'TC STATUS', value: view.tcStatus, inline: true }, { name: 'ATTENDANCE', value: `${played} played • ${noShows} no-show`, inline: true }, { name: 'AVAILABILITY', value: availabilityRate, inline: true }, {
                name: 'LAST ACTIVITY',
                value: `<t:${Math.floor(view.lastRelevantActivityAt.getTime() / 1000)}:R>`,
                inline: true,
            }, {
                name: 'PRIVATE RECORD',
                value: `${view.evaluations.length} recent evaluations • ${view.notes.length} recent notes`,
            }),
        ],
        components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`bb:manage-action:${view.id}:history`)
                .setLabel('History')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(`bb:manage-action:${view.id}:note`)
                .setLabel('Add Note')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(`bb:manage-action:${view.id}:evaluate`)
                .setLabel('Evaluate')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId(`bb:manage-action:${view.id}:status`)
                .setLabel('Status')
                .setStyle(ButtonStyle.Secondary)),
        ],
    });
}
export async function handleBoard(interaction, context) {
    await requireManagement(interaction, context);
    const summary = await context.board.summary(interaction.guildId);
    const tonight = summary.sessions.length
        ? summary.sessions
            .map((session) => `${discordTimestamp(session.startsAt, 't')}  **${session.assignments.length}/${capacity(session.format)}**  ${session.status}`)
            .join('\n')
        : 'No scouting in the next 24 hours.';
    const attention = summary.sessions
        .filter((session) => session.assignments.length < capacity(session.format))
        .map((session) => `${discordTimestamp(session.startsAt, 't')} needs ${capacity(session.format) - session.assignments.length} player(s)`)
        .join('\n') || 'All scheduled lineups are full.';
    await interaction.reply({
        ephemeral: true,
        embeds: [
            brandedEmbed()
                .setTitle('MANAGEMENT BOARD')
                .addFields({ name: 'NEXT 24 HOURS', value: tonight }, {
                name: 'SCOUTING POOL',
                value: `${summary.playerCount} Players  •  ${summary.evaluatedPlayers} Evaluated  •  ${summary.shortlisted} Shortlisted`,
            }, { name: 'NEEDS ATTENTION', value: attention }),
        ],
        components: [
            new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId('bb:manage-action:board:navigate')
                .setPlaceholder('Open management area')
                .addOptions({ label: 'Scouting', value: 'scouting' }, { label: 'Players', value: 'players' }, { label: 'Shortlist', value: 'shortlist' })),
        ],
    });
}
//# sourceMappingURL=management.js.map