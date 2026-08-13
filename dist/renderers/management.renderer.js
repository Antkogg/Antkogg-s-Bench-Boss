import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
export function renderManagementPanel(session) {
    const actions = [
        ['lock', session.status === 'LOCKED' ? 'Unlock Lineup' : 'Lock Lineup'],
        ['signups', session.signupsOpen ? 'Close Signups' : 'Open Signups'],
        ['start', 'Start Scouting'],
        ['complete', 'Complete Scouting'],
        ['repost', 'Regenerate Post'],
        ['cancel', 'Cancel Session'],
    ];
    return {
        embeds: [
            brandedEmbed()
                .setTitle('SCOUTING CONTROL ROOM')
                .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n**${session.assignments.length}** confirmed • **${session.waitlists.length}** waitlisted • **${session.status}**`)
                .addFields({
                name: 'LINEUP',
                value: 'Use the selector to move, remove, or review players.',
                inline: false,
            }, {
                name: 'GAME',
                value: 'Partial lineups can be started at any time. All changes update the canonical post.',
                inline: false,
            }),
        ],
        components: [
            new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId(customId('manage-action', session.id, 'lineup'))
                .setPlaceholder('Choose a lineup action')
                .addOptions({
                label: 'Add Player',
                value: 'add',
                description: 'Add with optional eligibility/conflict override',
            }, { label: 'Remove Player', value: 'remove' }, { label: 'Move Player', value: 'move' }, { label: 'Swap Players', value: 'swap' }, { label: 'View Waitlist', value: 'waitlist' })),
            new ActionRowBuilder().addComponents(...actions.slice(0, 5).map(([value, label]) => new ButtonBuilder()
                .setCustomId(customId('manage-action', session.id, value))
                .setLabel(label)
                .setStyle(value === 'start' ? ButtonStyle.Success : ButtonStyle.Secondary))),
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(customId('manage-action', session.id, 'cancel'))
                .setLabel('Cancel Session')
                .setStyle(ButtonStyle.Danger)),
        ],
    };
}
//# sourceMappingURL=management.renderer.js.map