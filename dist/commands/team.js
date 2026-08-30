import { ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { signupPositionLabel } from '../domain/positions.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
export async function handleTeam(interaction, context) {
    const { config } = await requireManagement(interaction, context);
    const summary = await context.team.dashboard(interaction.guildId);
    const submitted = summary.currentWeek?.submissions.length ?? 0;
    const expected = summary.roster + (config.tcReminderPolicy === 'DISABLED' ? 0 : summary.tcs);
    await interaction.reply({
        ephemeral: true,
        embeds: [
            brandedEmbed()
                .setTitle(`${config.teamName.toUpperCase()} — ${config.seasonLabel}`)
                .addFields({
                name: 'ORGANIZATION',
                value: `Roster: **${summary.roster}**\nTCs: **${summary.tcs}**`,
                inline: true,
            }, {
                name: 'CURRENT WEEK',
                value: summary.currentWeek
                    ? `${summary.currentWeek.label}\nSubmitted: **${submitted}/${expected}**\nMissing: **${Math.max(0, expected - submitted)}**`
                    : 'No open availability week.',
                inline: true,
            }, {
                name: 'TC READINESS',
                value: `Call-Up Ready: **${summary.callUpReady}**\nWatch: **${summary.watch}**\nDeveloping: **${summary.developing}**`,
                inline: true,
            }),
        ],
        components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(customId('team-action', 'dashboard', 'availability'))
                .setLabel('Availability')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId(customId('team-action', 'dashboard', 'roster'))
                .setLabel('Roster')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(customId('team-action', 'dashboard', 'tcs'))
                .setLabel('TCs')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(customId('team-action', 'dashboard', 'player-search'))
                .setLabel('Player Search')
                .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
                .setCustomId(customId('team-action', 'dashboard', 'rules'))
                .setLabel('LG Rules')
                .setStyle(ButtonStyle.Secondary)),
        ],
    });
}
export async function handleTc(interaction, context) {
    await requireManagement(interaction, context);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'status') {
        const players = await context.players.search(interaction.guildId, interaction.options.getString('player', true));
        const player = players[0];
        if (!player)
            throw new AppError('NOT_FOUND', 'Player not found.');
        const status = interaction.options.getString('status', true);
        await context.team.setTcStatus(player.id, status, interaction.user.id);
        await interaction.reply({
            ephemeral: true,
            embeds: [renderSuccess('TC status updated', `**${player.eaTag}** is now **${status}**.`)],
        });
        return;
    }
    if (subcommand === 'player') {
        const players = await context.players.search(interaction.guildId, interaction.options.getString('query', true));
        const player = players[0];
        if (!player)
            throw new AppError('NOT_FOUND', 'Player not found.');
        const view = await context.evaluations.playerView(player.id);
        const played = view.attendance.filter((entry) => entry.status === 'PLAYED').length;
        const noShows = view.attendance.filter((entry) => entry.status === 'NO_SHOW').length;
        await interaction.reply({
            ephemeral: true,
            embeds: [
                brandedEmbed()
                    .setTitle(`TC • ${view.eaTag}`)
                    .addFields({ name: 'POSITION', value: signupPositionLabel(view.signupPositions), inline: true }, { name: 'TC STATUS', value: view.tcStatus, inline: true }, { name: 'ATTENDANCE', value: `${played} played • ${noShows} no-show`, inline: true }, {
                    name: 'RECENT ACTIVITY',
                    value: discordTimestamp(view.lastRelevantActivityAt, 'R'),
                    inline: true,
                }, {
                    name: 'PRIVATE RECORD',
                    value: `${view.evaluations.length} evaluations • ${view.notes.length} notes`,
                }),
            ],
        });
        return;
    }
    const players = await context.team.tcBoard(interaction.guildId);
    const lines = players.length
        ? players
            .map((player) => {
            const played = player.attendance.filter((entry) => entry.status === 'PLAYED').length;
            const noShows = player.attendance.filter((entry) => entry.status === 'NO_SHOW').length;
            return `**${player.tcStatus}** • \`${player.eaTag}\` • ${signupPositionLabel(player.signupPositions)} • ${played} played / ${noShows} NS • active ${discordTimestamp(player.lastRelevantActivityAt, 'R')}`;
        })
            .join('\n')
        : 'No players currently have TC team status.';
    await interaction.reply({
        ephemeral: true,
        embeds: [brandedEmbed().setTitle('TC DEVELOPMENT BOARD').setDescription(lines.slice(0, 4000))],
    });
}
export async function handleTeamButton(interaction, context, parsed) {
    await requireManagement(interaction, context);
    if (parsed.value === 'availability') {
        const week = await context.weeklyAvailability.current(interaction.guildId);
        const missing = week ? await context.weeklyAvailability.missing(week.id) : [];
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Availability', week
                    ? `${week.label} • ${week.status}\n${missing.length} response(s) missing.\nUse \`/availability view\` for details.`
                    : 'No current week.'),
            ],
        });
        return;
    }
    if (parsed.value === 'tcs') {
        const players = await context.team.tcBoard(interaction.guildId);
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('TCs', players.length
                    ? players.map((player) => `**${player.tcStatus}** • \`${player.eaTag}\``).join('\n')
                    : 'No TCs configured.'),
            ],
        });
        return;
    }
    if (parsed.value === 'roster') {
        const players = await context.prisma.player.findMany({
            where: {
                guildConfig: { guildId: interaction.guildId },
                teamStatus: 'ROSTER',
                registered: true,
            },
            orderBy: { eaTag: 'asc' },
        });
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Roster', players.length
                    ? players
                        .map((player) => `\`${player.eaTag}\` • ${signupPositionLabel(player.signupPositions)}`)
                        .join('\n')
                    : 'No roster players configured.'),
            ],
        });
        return;
    }
    if (parsed.value === 'player-search') {
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Player Search', 'Run `/player query:<EA Tag, LG username, or Discord ID>` to open the private player record.'),
            ],
        });
        return;
    }
    await interaction.reply({
        ephemeral: true,
        embeds: [
            renderSuccess('LG Rules', 'Use `/rules` to browse official sources or `/rule search` to search indexed text.'),
        ],
    });
}
//# sourceMappingURL=team.js.map