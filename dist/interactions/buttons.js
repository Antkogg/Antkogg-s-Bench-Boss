import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { groupForScoutingPosition } from '../domain/positions.js';
import { renderWaitlistButtons } from '../renderers/scouting.renderer.js';
import { renderSuccess, renderWarning } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { showRegistrationModal } from './modals.js';
import { handleManagementButton } from './management-buttons.js';
export async function handleButton(interaction, context, parsed) {
    if (parsed.action === 'profile-action') {
        if (parsed.entityId === 'register' || parsed.entityId === 'update')
            return showRegistrationModal(interaction);
        await interaction.reply({
            ephemeral: true,
            content: 'Use `/scouting` to browse upcoming sessions.',
        });
        return;
    }
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this control in the server.');
    if (parsed.action === 'manage' || parsed.action === 'manage-action')
        return handleManagementButton(interaction, context, parsed);
    if (parsed.action === 'signup') {
        const position = parsed.value;
        const result = await context.scouting.signup({
            guildId: interaction.guildId,
            discordUserId: interaction.user.id,
            sessionId: parsed.entityId,
            position,
        });
        if (result.previousPosition) {
            await interaction.reply({
                ephemeral: true,
                embeds: [
                    renderWarning('Switch position?', `You're currently playing **${result.previousPosition}**. Switch to **${position}**?`),
                ],
                components: [
                    new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(customId('switch-confirm', parsed.entityId, position))
                        .setLabel(`Switch to ${position}`)
                        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                        .setCustomId(customId('switch', parsed.entityId, 'keep'))
                        .setLabel(`Keep ${result.previousPosition}`)
                        .setStyle(ButtonStyle.Secondary)),
                ],
            });
            return;
        }
        await context.posts.queueRefresh(parsed.entityId);
        const player = result.session.assignments.find((assignment) => assignment.player.discordUserId === interaction.user.id)?.player;
        const dmSent = player
            ? await context.notifications.signup(interaction.user.id, result.session, position, player.eaTag)
            : false;
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess(`Confirmed at ${position}`, `${dmSent ? 'Your confirmation is in your DMs.' : "I couldn't DM you, but your spot is confirmed."}\n${result.session.messageId ? `[Open the lineup](https://discord.com/channels/${interaction.guildId}/${result.session.channelId}/${result.session.messageId})` : ''}`),
            ],
        });
        return;
    }
    if (parsed.action === 'switch-confirm') {
        const position = parsed.value;
        const before = await context.scouting.get(parsed.entityId);
        const old = before?.assignments.find((item) => item.player.discordUserId === interaction.user.id)?.position;
        const session = await context.scouting.switchPosition({
            guildId: interaction.guildId,
            discordUserId: interaction.user.id,
            sessionId: parsed.entityId,
            position,
        });
        await context.posts.queueRefresh(parsed.entityId);
        if (old)
            await context.notifications.positionChanged(interaction.user.id, session, old, position);
        await interaction.update({
            embeds: [renderSuccess('Position updated', `You're now confirmed at **${position}**.`)],
            components: [],
        });
        return;
    }
    if (parsed.action === 'switch') {
        await interaction.update({
            embeds: [renderSuccess('Spot kept', 'No lineup changes were made.')],
            components: [],
        });
        return;
    }
    if (parsed.action === 'leave') {
        const session = await context.scouting.get(parsed.entityId);
        if (!session)
            throw new AppError('NOT_FOUND', 'That scouting session was not found.');
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderWarning('Leave this game?', `Leave <t:${Math.floor(session.startsAt.getTime() / 1000)}:t> scouting and release your spot?`),
            ],
            components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(customId('leave-confirm', parsed.entityId))
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                    .setCustomId(customId('switch', parsed.entityId, 'keep'))
                    .setLabel('Keep My Spot')
                    .setStyle(ButtonStyle.Secondary)),
            ],
        });
        return;
    }
    if (parsed.action === 'leave-confirm') {
        const result = await context.scouting.leave(interaction.guildId, interaction.user.id, parsed.entityId);
        await context.posts.queueRefresh(parsed.entityId);
        if (result.offeredWaitlistId) {
            const offer = await context.prisma.waitlistEntry.findUnique({
                where: { id: result.offeredWaitlistId },
                include: { player: true },
            });
            if (offer?.offerToken && offer.offeredPosition)
                await context.notifications.waitlistOffer(offer.player.discordUserId, result.session, offer.offeredPosition, offer.offerToken);
        }
        await interaction.update({
            embeds: [
                renderSuccess('You left the game', 'Your spot has been released and the lineup is updated.'),
            ],
            components: [],
        });
        return;
    }
    if (parsed.action === 'waitlist') {
        const [group, position] = (parsed.value ?? '').split('.');
        await context.scouting.joinWaitlist(interaction.guildId, interaction.user.id, parsed.entityId, group, position);
        const session = await context.scouting.get(parsed.entityId);
        if (session)
            await context.notifications.status(interaction.user.id, session, 'WAITLIST JOINED', `You're queued with the **${group}** group. We'll send a one-click offer if a compatible spot opens.`);
        await interaction.update({
            embeds: [
                renderSuccess('Waitlist joined', "You're in queue. We'll DM you if a compatible spot opens."),
            ],
            components: [],
        });
        return;
    }
    if (parsed.action === 'offer') {
        if (parsed.value === 'accept') {
            const session = await context.scouting.acceptWaitlistOffer(parsed.entityId, interaction.user.id);
            await context.posts.queueRefresh(session.id);
            const assignment = session.assignments.find((entry) => entry.player.discordUserId === interaction.user.id);
            if (assignment)
                await context.notifications.signup(interaction.user.id, session, assignment.position, assignment.player.eaTag);
            await interaction.update({
                embeds: [renderSuccess('Spot claimed', 'You are confirmed and the lineup is updated.')],
                components: [],
            });
        }
        else {
            const nextId = await context.scouting.passWaitlistOffer(parsed.entityId, interaction.user.id);
            if (nextId) {
                const next = await context.prisma.waitlistEntry.findUnique({
                    where: { id: nextId },
                    include: { player: true },
                });
                const session = next ? await context.scouting.get(next.sessionId) : null;
                if (next?.offerToken && next.offeredPosition && session)
                    await context.notifications.waitlistOffer(next.player.discordUserId, session, next.offeredPosition, next.offerToken);
            }
            await interaction.update({
                embeds: [renderSuccess('Offer passed', 'No lineup changes were made.')],
                components: [],
            });
        }
        return;
    }
    if (parsed.action === 'availability') {
        const player = await context.players.byDiscordId(interaction.guildId, interaction.user.id);
        const existing = await context.prisma.availability.findUnique({
            where: { sessionId_playerId: { sessionId: parsed.entityId, playerId: player.id } },
        });
        if (existing) {
            await context.prisma.availability.delete({ where: { id: existing.id } });
            await interaction.reply({
                ephemeral: true,
                embeds: [
                    renderSuccess('Availability removed', 'Management will no longer include you for this time.'),
                ],
            });
        }
        else {
            const session = await context.scouting.get(parsed.entityId);
            if (!session || session.signupMode !== 'AVAILABILITY' || session.status !== 'OPEN')
                throw new AppError('SIGNUPS_CLOSED', 'Availability is closed for this session.');
            await context.prisma.availability.create({
                data: { sessionId: parsed.entityId, playerId: player.id },
            });
            await interaction.reply({
                ephemeral: true,
                embeds: [
                    renderSuccess('Availability saved', 'Management can now build this lineup with you in the pool.'),
                ],
            });
        }
        return;
    }
    throw new AppError('STALE_INTERACTION', 'That control is no longer valid.');
}
export function waitlistPrompt(sessionId, position) {
    return {
        embeds: [
            renderWarning(`${position} is full`, 'Join the position-group waitlist and we’ll notify you when a compatible spot opens.'),
        ],
        components: [renderWaitlistButtons(sessionId, groupForScoutingPosition(position), position)],
    };
}
//# sourceMappingURL=buttons.js.map