import { AppError } from '../utils/errors.js';
import { renderSuccess } from '../renderers/design.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { showManagementModal } from './modals.js';
import { signupPositionLabel } from '../domain/positions.js';
export async function handleSelectMenu(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this management control in the server.');
    const [config, member] = await Promise.all([
        context.config.ensure(interaction.guildId),
        interaction.guild.members.fetch(interaction.user.id),
    ]);
    if (!hasManagementAccess(accessLevel(member, config.managementRoleId)))
        throw new AppError('NOT_ALLOWED', 'This menu is private to Bench Boss management.');
    if (parsed.action === 'manage-action' && parsed.value === 'lineup') {
        const value = interaction.values[0];
        if (['add', 'remove', 'move', 'swap'].includes(value ?? '')) {
            await showManagementModal(interaction, { ...parsed, value: value });
            return;
        }
        if (value === 'waitlist') {
            const session = await context.scouting.get(parsed.entityId);
            const list = session?.waitlists.length
                ? session.waitlists
                    .map((entry) => `**${entry.positionGroup} #${entry.queueOrder}** • \`${entry.player.eaTag}\` • ${entry.status}`)
                    .join('\n')
                : 'The waitlist is empty.';
            await interaction.reply({
                ephemeral: true,
                embeds: [renderSuccess('Waitlist', list ?? 'The waitlist is empty.')],
            });
            return;
        }
        if (value === 'attendance') {
            await interaction.reply({
                ephemeral: true,
                content: 'Attendance is recorded from each player’s management view after the session.',
            });
            return;
        }
        throw new AppError('INVALID_INPUT', 'That management view is not available here.');
    }
    if (parsed.action === 'manage-action' && parsed.value === 'set-status') {
        await context.players.setInternalStatus(parsed.entityId, interaction.values[0], interaction.user.id);
        await interaction.update({
            content: '',
            embeds: [
                renderSuccess('Internal status updated', `Player status is now **${interaction.values[0]}**. This remains private.`),
            ],
            components: [],
        });
        return;
    }
    if (parsed.action === 'manage-action' &&
        parsed.entityId === 'board' &&
        parsed.value === 'navigate') {
        const value = interaction.values[0];
        if (value === 'scouting') {
            const sessions = await context.scouting.upcoming(interaction.guildId, 5);
            const lines = sessions.length
                ? sessions
                    .map((session) => `<t:${Math.floor(session.startsAt.getTime() / 1000)}:F> • **${session.assignments.length} confirmed** • ${session.status}`)
                    .join('\n')
                : 'No upcoming scouting sessions.';
            await interaction.reply({
                ephemeral: true,
                embeds: [renderSuccess('Upcoming scouting', lines)],
            });
            return;
        }
        if (value === 'players') {
            await interaction.reply({
                ephemeral: true,
                embeds: [
                    renderSuccess('Player search', 'Use `/player query:` with an EA Tag, LG username, or Discord user ID.'),
                ],
            });
            return;
        }
        const shortlist = await context.prisma.player.findMany({
            where: {
                guildConfig: { guildId: interaction.guildId },
                internalStatus: { in: ['SHORTLIST', 'PRIORITY'] },
            },
            orderBy: [{ internalStatus: 'asc' }, { updatedAt: 'desc' }],
            take: 15,
        });
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Shortlist', shortlist.length
                    ? shortlist
                        .map((player) => `**${player.internalStatus}** • \`${player.eaTag}\` • ${signupPositionLabel(player.signupPositions)}`)
                        .join('\n')
                    : 'No players are shortlisted yet.'),
            ],
        });
        return;
    }
    throw new AppError('STALE_INTERACTION', 'That menu is no longer valid.');
}
//# sourceMappingURL=select-menus.js.map