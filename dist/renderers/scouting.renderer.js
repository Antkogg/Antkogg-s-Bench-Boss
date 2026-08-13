import { ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { BRAND } from '../config/constants.js';
import { ALL_SCOUTING_POSITIONS, groupForScoutingPosition } from '../domain/positions.js';
import { capacity, remainingByGroup } from '../domain/scouting.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
const STATUS_LABELS = {
    OPEN: 'SIGNUPS OPEN',
    LOCKED: 'LINEUP LOCKED',
    IN_PROGRESS: 'SCOUTING IN PROGRESS',
    COMPLETED: 'SCOUTING COMPLETE',
    CANCELLED: 'SESSION CANCELLED',
};
const STATUS_COLORS = {
    OPEN: BRAND.colors.primary,
    LOCKED: BRAND.colors.warning,
    IN_PROGRESS: BRAND.colors.inProgress,
    COMPLETED: BRAND.colors.success,
    CANCELLED: BRAND.colors.danger,
};
function slotLine(session, team, position) {
    const assignment = session.assignments.find((item) => item.team === team && item.position === position);
    return assignment ? `**${position}**  \`${assignment.player.eaTag}\`` : `**${position}**  *OPEN*`;
}
function teamFields(session, team, title) {
    const field = (name, positions) => ({
        name,
        value: positions.map((position) => slotLine(session, team, position)).join('\n'),
        inline: true,
    });
    const fields = [
        field(title ? `${title} • FORWARDS` : 'FORWARDS', ['LW', 'C', 'RW']),
        field(title ? `${title} • DEFENSE` : 'DEFENSE', ['LD', 'RD']),
        field(title ? `${title} • GOALIE` : 'GOALIE', ['G']),
    ];
    return fields;
}
function needsText(session) {
    const remaining = remainingByGroup(session.format, session.assignments.map((item) => item.position));
    const labels = {
        FORWARD: ['Forward', 'Forwards'],
        DEFENSE: ['Defense', 'Defense'],
        GOALIE: ['Goalie', 'Goalies'],
    };
    const needs = Object.entries(remaining)
        .filter(([, count]) => count > 0)
        .map(([group, count]) => `${count} ${labels[group][count === 1 ? 0 : 1]}`);
    return needs.length ? needs.join('  •  ') : '✓ Lineup full';
}
export function renderScoutingSession(session) {
    const total = capacity(session.format);
    const count = session.assignments.length;
    const format = session.format === 'ONE_SIDE' ? 'LG SCOUTING' : 'PRIVATE 6V6';
    const signupState = session.status === 'OPEN' && !session.signupsOpen
        ? 'SIGNUPS CLOSED'
        : STATUS_LABELS[session.status];
    const titleText = session.note ? session.note : format;
    const embed = brandedEmbed(STATUS_COLORS[session.status])
        .setTitle(`${titleText}  •  ${signupState}`)
        .setDescription([
        `## ${discordTimestamp(session.startsAt, 'F')}`,
        discordTimestamp(session.startsAt, 'R'),
    ]
        .filter(Boolean)
        .join('\n'))
        .addFields(...teamFields(session, 'TEAM_1', session.format === 'PRIVATE_6V6' ? 'TEAM 1' : undefined));
    if (session.format === 'PRIVATE_6V6')
        embed.addFields(...teamFields(session, 'TEAM_2', 'TEAM 2'));
    embed
        .addFields({
        name: `${count === total ? '✓ ' : ''}${count} / ${total} CONFIRMED`,
        value: needsText(session),
        inline: false,
    }, {
        name: 'HOW TO JOIN',
        value: session.status === 'OPEN' && session.signupsOpen
            ? session.signupMode === 'AVAILABILITY'
                ? 'Tap **I’m Available**. Management will build the lineup from the availability pool.'
                : 'Choose an eligible position below. Your exact EA Tag appears immediately.'
            : 'The lineup is preserved here. Player controls are currently disabled.',
        inline: false,
    })
        .setTimestamp(session.updatedAt);
    return { embeds: [embed], components: scoutingComponents(session) };
}
export function scoutingComponents(session) {
    const active = session.status === 'OPEN' && session.signupsOpen;
    const rows = [];
    const positionRows = [
        ['LW', 'C', 'RW'],
        ['LD', 'RD', 'G'],
    ];
    for (const positions of positionRows) {
        const row = new ActionRowBuilder();
        for (const position of positions) {
            const occupied = session.assignments.filter((assignment) => assignment.position === position).length;
            const positionCapacity = session.format === 'PRIVATE_6V6' ? 2 : 1;
            row.addComponents(new ButtonBuilder()
                .setCustomId(customId('signup', session.id, position))
                .setLabel(position)
                .setStyle(groupForScoutingPosition(position) === 'GOALIE'
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary)
                .setDisabled(!active || session.signupMode === 'AVAILABILITY' || occupied >= positionCapacity));
        }
        rows.push(row);
    }
    const leave = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('leave', session.id))
        .setLabel('Leave Game')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!active || session.signupMode === 'AVAILABILITY'), new ButtonBuilder()
        .setCustomId(customId('manage', session.id))
        .setLabel('Management')
        .setStyle(ButtonStyle.Secondary));
    if (session.signupMode === 'AVAILABILITY' && active) {
        leave.addComponents(new ButtonBuilder()
            .setCustomId(customId('availability', session.id, 'toggle'))
            .setLabel("I'm Available")
            .setStyle(ButtonStyle.Success));
    }
    rows.push(leave);
    if (session.signupMode === 'OPEN_SIGNUP' && active) {
        const groups = [
            ['FORWARD', ['LW', 'C', 'RW'], 'Forward Waitlist'],
            ['DEFENSE', ['LD', 'RD'], 'Defense Waitlist'],
            ['GOALIE', ['G'], 'Goalie Waitlist'],
        ];
        const fullGroups = groups.filter(([, positions]) => positions.every((position) => session.assignments.filter((assignment) => assignment.position === position).length >=
            (session.format === 'PRIVATE_6V6' ? 2 : 1)));
        if (fullGroups.length) {
            rows.push(new ActionRowBuilder().addComponents(...fullGroups.map(([group, , label]) => new ButtonBuilder()
                .setCustomId(customId('waitlist', session.id, `${group}.`))
                .setLabel(label)
                .setStyle(ButtonStyle.Primary))));
        }
    }
    return rows;
}
export function renderWaitlistButtons(sessionId, group, preferredPosition) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('waitlist', sessionId, `${group}.${preferredPosition ?? ''}`))
        .setLabel(`Join ${group === 'GOALIE' ? 'Goalie' : group === 'DEFENSE' ? 'Defense' : 'Forward'} Waitlist`)
        .setStyle(ButtonStyle.Primary));
}
export function positionCapacityAvailable(session, position) {
    const max = session.format === 'PRIVATE_6V6' ? 2 : 1;
    return session.assignments.filter((assignment) => assignment.position === position).length < max;
}
export const SCOUTING_POSITIONS = ALL_SCOUTING_POSITIONS;
//# sourceMappingURL=scouting.renderer.js.map