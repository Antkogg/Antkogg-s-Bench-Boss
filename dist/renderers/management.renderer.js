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
    const pool = session.availability ?? [];
    const poolOptions = pool.slice(0, 25).map((item) => ({
        label: `Confirm ${item.player.discordDisplayName} (${item.position ?? 'Any'})`,
        value: `${item.player.discordUserId}.${item.position ?? 'LW'}`,
        description: `EA Tag: ${item.player.eaTag}`,
    }));
    const components = [];
    if (session.status !== 'CANCELLED' && session.status !== 'COMPLETED') {
        if (poolOptions.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId(customId('manage-action', session.id, 'confirm-pool'))
                .setPlaceholder(`Confirm starter from signup pool (${pool.length} available)...`)
                .addOptions(poolOptions)));
        }
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(customId('manage-action', session.id, 'lineup'))
            .setPlaceholder('Choose a lineup action')
            .addOptions({
            label: 'Add Player (Manual Search)',
            value: 'add',
            description: 'Add with optional eligibility/conflict override',
        }, { label: 'Remove Player', value: 'remove' }, { label: 'Move Player', value: 'move' }, { label: 'Swap Players', value: 'swap' }, { label: 'View Waitlist', value: 'waitlist' })), new ActionRowBuilder().addComponents(...actions.slice(0, 5).map(([value, label]) => new ButtonBuilder()
            .setCustomId(customId('manage-action', session.id, value))
            .setLabel(label)
            .setStyle(value === 'start' ? ButtonStyle.Success : ButtonStyle.Secondary))), new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(customId('manage-action', session.id, 'cancel'))
            .setLabel('Cancel Session')
            .setStyle(ButtonStyle.Danger)));
    }
    return {
        embeds: [
            brandedEmbed()
                .setTitle('SCOUTING CONTROL ROOM')
                .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n**${session.assignments.length}** confirmed • **${pool.length}** in pool • **${session.waitlists.length}** waitlisted • **${session.status}**`)
                .addFields({
                name: 'LINEUP & POOL CONFIRMATION',
                value: pool.length
                    ? 'Select a player from the pool dropdown to instantly confirm them into the starting lineup.'
                    : 'The signup pool is currently empty. Use **Add Player** to manually insert starters.',
                inline: false,
            }, {
                name: 'GAME CONTROLS',
                value: 'Partial lineups can be started at any time. All changes update the canonical post.',
                inline: false,
            }),
        ],
        components,
    };
}
export function renderMasterDashboard() {
    return {
        embeds: [
            brandedEmbed()
                .setTitle("MANAGEMENT CONTROL CENTER  •  ANTKOGG'S LG ASSISTANT")
                .setDescription('Private control panel for scouting operations, weekly availability, player rosters, and server setup.')
                .addFields({
                name: '1 • SCOUTING SESSIONS',
                value: 'Click **➕ New Scouting Session** to launch a new session, or **📋 Active Sessions** to manage lineups and publish posts.',
            }, {
                name: '2 • WEEKLY AVAILABILITY',
                value: 'Click **📅 Weekly Availability** to open, lock, or review player availability submissions.',
            }, {
                name: '3 • PLAYERS & ROSTER',
                value: 'Click **🔍 Search Player** to view activity history, evaluations, and internal player status.',
            }),
        ],
        components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(customId('manage-hub', 'hub', 'create-session'))
                .setLabel('➕ New Scouting Session')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId(customId('manage-hub', 'hub', 'list-sessions'))
                .setLabel('📋 Active Sessions')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(customId('manage-hub', 'hub', 'weekly-avail'))
                .setLabel('📅 Weekly Availability')
                .setStyle(ButtonStyle.Secondary)),
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(customId('manage-hub', 'hub', 'search-player'))
                .setLabel('🔍 Search Player')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(customId('manage-hub', 'hub', 'setup-view'))
                .setLabel('⚙️ Server Settings')
                .setStyle(ButtonStyle.Secondary)),
        ],
    };
}
//# sourceMappingURL=management.renderer.js.map