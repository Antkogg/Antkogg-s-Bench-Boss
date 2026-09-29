import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, } from 'discord.js';
import { capacity } from '../domain/scouting.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { DEFAULT_TEAM_ROLE_ID } from '../config/constants.js';
import { customId } from '../utils/custom-id.js';
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
export async function handleSetPosition(interaction, context) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferReply({ ephemeral: true });
    const targetUser = interaction.options.getUser('player', true);
    const position = interaction.options.getString('position', true);
    await context.players.byDiscordId(interaction.guildId, targetUser.id, targetUser.displayName ?? targetUser.username, targetUser.displayAvatarURL());
    const updated = await context.players.updatePositions(interaction.guildId, targetUser.id, [position], targetUser.displayName ?? targetUser.username, targetUser.displayAvatarURL());
    const groupLabel = updated.positionGroup === 'FORWARD'
        ? 'Forwards'
        : updated.positionGroup === 'DEFENSE'
            ? 'Defense'
            : 'Goalies';
    await interaction.editReply({
        embeds: [
            renderSuccess('Position Set', `Successfully set position for <@${targetUser.id}> to **${position}** (${groupLabel}).\n` +
                `They will now appear under **${groupLabel}** when they submit availability and in lineup building.`),
        ],
    });
}
export async function getTeamMembersWithRole(guild, configRole) {
    let role = guild.roles.cache.find((r) => r.name.toLowerCase().includes('s55 bu')) ??
        guild.roles.cache.get(configRole ?? '') ??
        guild.roles.cache.get(DEFAULT_TEAM_ROLE_ID);
    if (!role) {
        await guild.roles.fetch().catch(() => null);
        role =
            guild.roles.cache.find((r) => r.name.toLowerCase().includes('s55 bu')) ??
                guild.roles.cache.get(configRole ?? '') ??
                guild.roles.cache.get(DEFAULT_TEAM_ROLE_ID);
    }
    if (!role) {
        throw new AppError('NOT_FOUND', 'Could not find the "S55 BU" team role in this server.');
    }
    let members = Array.from(role.members.filter((m) => !m.user.bot).values());
    if (!members.length) {
        const fetched = await guild.members.fetch().catch(() => null);
        if (fetched) {
            members = Array.from(fetched.filter((m) => m.roles.cache.has(role.id) && !m.user.bot).values());
        }
    }
    return { role, members };
}
export function renderRosterPositionsPanel(roleId, playerRows, selectedMemberId) {
    const unsetCount = playerRows.filter((p) => p.player.signupPositions.length === 0).length;
    const embed = brandedEmbed()
        .setTitle(`S55 BU ROSTER POSITIONS (${playerRows.length} Players)`)
        .setDescription(`Role: <@&${roleId}> • **${playerRows.length - unsetCount}/${playerRows.length}** positions configured.\n` +
        `Choose a player from the dropdown below to set their position with one click!\n` +
        `*(Positions determine whether players show as Forwards, Defense, or Goalies for availability)*`)
        .addFields({
        name: '👥 ROSTER & POSITIONS',
        value: playerRows
            .map(({ member, player }, i) => `${i + 1}. <@${member.id}> • **${player.signupPositions.join('/') || '⚠️ NOT SET'}**`)
            .join('\n')
            .slice(0, 1024),
    }, {
        name: '📋 BULK COPY TEMPLATE',
        value: '```\n' +
            playerRows
                .map(({ member, player }) => `<@${member.id}> ${player.signupPositions[0] ?? 'C'}`)
                .join('\n')
                .slice(0, 1000) +
            '\n```\n*You can also copy this list, change the letters, and run `/set-positions roster:`.*',
    });
    const selectMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('roster-player-select', roleId))
        .setPlaceholder(selectedMemberId
        ? `Selected: ${playerRows.find((p) => p.member.id === selectedMemberId)?.member.displayName ?? 'Player'}`
        : 'Choose a player to assign a position...')
        .addOptions(playerRows.slice(0, 25).map(({ member, player }) => ({
        label: (member.displayName || member.user.username).slice(0, 100),
        value: member.id,
        description: `Current: ${player.signupPositions.join('/') || 'Not set'}`,
        default: member.id === selectedMemberId,
    }))));
    const components = [selectMenu];
    if (selectedMemberId) {
        const buttonRow = new ActionRowBuilder().addComponents(['LW', 'C', 'RW', 'LD', 'RD', 'G'].map((pos) => new ButtonBuilder()
            .setCustomId(customId('roster-set-pos', selectedMemberId, pos))
            .setLabel(pos)
            .setStyle(pos === 'C' || pos === 'LW' || pos === 'RW'
            ? ButtonStyle.Primary
            : pos === 'G'
                ? ButtonStyle.Success
                : ButtonStyle.Secondary)));
        components.push(buttonRow);
    }
    return { embeds: [embed], components };
}
export async function handleSetPositions(interaction, context) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferReply({ ephemeral: true });
    const rawRoster = interaction.options.getString('roster')?.trim();
    if (!rawRoster) {
        const config = await context.config.ensure(interaction.guildId);
        const { role, members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId);
        if (!members.length) {
            throw new AppError('NOT_FOUND', `No members found with role <@&${role.id}>.`);
        }
        const playerRows = await Promise.all(members.map(async (member) => {
            const player = await context.players.byDiscordId(interaction.guildId, member.id, member.displayName || member.user.username, member.user.displayAvatarURL());
            return { member, player };
        }));
        const panel = renderRosterPositionsPanel(role.id, playerRows);
        await interaction.editReply(panel);
        return;
    }
    const lines = rawRoster.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const results = [];
    const errors = [];
    const validPositions = new Set(['LW', 'C', 'RW', 'LD', 'RD', 'G']);
    for (const line of lines) {
        const mentionMatch = line.match(/<@!?(\d+)>/);
        let discordUserId = mentionMatch ? mentionMatch[1] : null;
        const tokens = line.split(/[:\s,]+/).map((t) => t.trim().toUpperCase());
        const foundPos = tokens.find((t) => validPositions.has(t));
        if (!foundPos) {
            errors.push(`Could not find a valid position in: \`${line}\``);
            continue;
        }
        if (!discordUserId) {
            const idToken = tokens.find((t) => /^\d{17,20}$/.test(t));
            if (idToken) {
                discordUserId = idToken;
            }
        }
        if (discordUserId) {
            try {
                let displayName = discordUserId;
                try {
                    const member = await interaction.guild.members.fetch(discordUserId);
                    displayName = member.displayName || member.user.username;
                }
                catch {
                    // ignore fetch error
                }
                await context.players.updatePositions(interaction.guildId, discordUserId, [foundPos], displayName);
                results.push(`<@${discordUserId}> → **${foundPos}**`);
            }
            catch (err) {
                errors.push(`Failed for <@${discordUserId}>: ${err.message}`);
            }
        }
        else {
            const searchTerms = tokens.filter((t) => t !== foundPos && !validPositions.has(t));
            const query = searchTerms.join(' ').trim();
            if (!query) {
                errors.push(`No player identifier in: \`${line}\``);
                continue;
            }
            const matches = await context.players.search(interaction.guildId, query);
            if (matches.length > 0) {
                const p = matches[0];
                await context.players.updatePositions(interaction.guildId, p.discordUserId, [foundPos], p.discordDisplayName);
                results.push(`\`${p.eaTag}\` (<@${p.discordUserId}>) → **${foundPos}**`);
            }
            else {
                errors.push(`Player not found for: \`${query}\``);
            }
        }
    }
    const embed = brandedEmbed()
        .setTitle('ROSTER POSITIONS UPDATED')
        .setDescription(results.length
        ? `Successfully updated positions for **${results.length}** player(s):\n\n${results.join('\n')}`
        : 'No players could be updated. Check formatting.');
    if (errors.length) {
        embed.addFields({
            name: '⚠️ Warnings / Skipped',
            value: errors.slice(0, 10).join('\n'),
        });
    }
    await interaction.editReply({
        embeds: [embed],
    });
}
export async function handleRosterPlayerSelect(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    const roleId = parsed.entityId;
    const selectedMemberId = interaction.values[0];
    const config = await context.config.ensure(interaction.guildId);
    const { members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId);
    const playerRows = [];
    for (const member of members) {
        const player = await context.players.byDiscordId(interaction.guildId, member.id, member.displayName || member.user.username, member.user.displayAvatarURL());
        playerRows.push({ member, player });
    }
    const panel = renderRosterPositionsPanel(roleId, playerRows, selectedMemberId);
    await interaction.update(panel);
}
export async function handleRosterSetPosButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    const targetUserId = parsed.entityId;
    const position = parsed.value;
    let displayName = targetUserId;
    try {
        const member = await interaction.guild.members.fetch(targetUserId);
        displayName = member.displayName || member.user.username;
    }
    catch {
        // ignore
    }
    await context.players.updatePositions(interaction.guildId, targetUserId, [position], displayName);
    const config = await context.config.ensure(interaction.guildId);
    const { role, members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId);
    const playerRows = [];
    for (const member of members) {
        const player = await context.players.byDiscordId(interaction.guildId, member.id, member.displayName || member.user.username, member.user.displayAvatarURL());
        playerRows.push({ member, player });
    }
    const panel = renderRosterPositionsPanel(role.id, playerRows, targetUserId);
    await interaction.update(panel);
}
//# sourceMappingURL=management.js.map