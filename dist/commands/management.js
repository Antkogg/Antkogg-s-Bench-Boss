import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, } from 'discord.js';
import { capacity } from '../domain/scouting.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { DEFAULT_TEAM_ROLE_ID, DEFAULT_ROSTER_ROLE_ID } from '../config/constants.js';
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
export async function getTeamMembersWithRole(guild, configRole, forceFetch = true) {
    if (!guild.roles.cache.size || forceFetch) {
        await guild.roles.fetch().catch(() => null);
    }
    const roleId = configRole || DEFAULT_TEAM_ROLE_ID;
    let role = guild.roles.cache.get(roleId) ??
        guild.roles.cache.find((r) => r.name.toLowerCase().includes('s55 bu')) ??
        guild.roles.cache.get(DEFAULT_ROSTER_ROLE_ID) ??
        guild.roles.cache.find((r) => r.name.toLowerCase().includes('roster'));
    if (!role) {
        await guild.roles.fetch().catch(() => null);
        role =
            guild.roles.cache.get(roleId) ??
                guild.roles.cache.find((r) => r.name.toLowerCase().includes('s55 bu')) ??
                guild.roles.cache.get(DEFAULT_ROSTER_ROLE_ID) ??
                guild.roles.cache.find((r) => r.name.toLowerCase().includes('roster'));
    }
    if (!role) {
        throw new AppError('NOT_FOUND', `Could not find the team role (${roleId}) in this server.`);
    }
    let members = [];
    try {
        const allMembers = await guild.members.fetch();
        members = Array.from(allMembers.filter((m) => m.roles.cache.has(role.id) && !m.user.bot).values());
    }
    catch {
        members = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(role.id) && !m.user.bot).values());
    }
    return { role, members };
}
export async function loadPlayerRows(guildId, members, context) {
    return Promise.all(members.map(async (member) => {
        const player = await context.players.byDiscordId(guildId, member.id, member.displayName || member.user.username, member.user.displayAvatarURL());
        return { member, player };
    }));
}
export function renderRosterPositionsPanel(roleId, playerRows, selectedMemberId, notice) {
    const unsetCount = playerRows.filter((p) => p.player.signupPositions.length === 0).length;
    const configuredCount = playerRows.length - unsetCount;
    // Determine active member to display in the wizard
    let activeMemberId = selectedMemberId;
    if (!activeMemberId || !playerRows.some((p) => p.member.id === activeMemberId)) {
        const firstUnset = playerRows.find((p) => p.player.signupPositions.length === 0);
        activeMemberId = firstUnset ? firstUnset.member.id : playerRows[0]?.member.id;
    }
    const activeIndex = playerRows.findIndex((p) => p.member.id === activeMemberId);
    const active = playerRows[activeIndex >= 0 ? activeIndex : 0];
    const embed = brandedEmbed()
        .setTitle(`🏒 S55 BU ROSTER POSITIONS (${configuredCount}/${playerRows.length} Set)`)
        .setDescription((notice ? `${notice}\n\n` : '') +
        (active
            ? `👉 **NOW SETTING: Player ${activeIndex + 1} of ${playerRows.length}**\n` +
                `👤 <@${active.member.id}> (**${active.member.displayName}**)\n` +
                `Current Position: **${active.player.signupPositions.join('/') || '⚠️ NOT SET'}**\n\n` +
                `*(Click any position button below to assign and **auto-advance** to the next player!)*`
            : 'No players found.'));
    if (playerRows.length) {
        const rosterLines = playerRows.slice(0, 25).map(({ member, player }, i) => {
            const pos = player.signupPositions.join('/') || '⚠️ NOT SET';
            const isActive = active && member.id === active.member.id;
            return `${i + 1}. <@${member.id}> • **${pos}**${isActive ? ' 👈 **(ACTIVE)**' : ''}`;
        });
        if (playerRows.length > 25) {
            rosterLines.push(`*...and ${playerRows.length - 25} more players*`);
        }
        embed.addFields({
            name: '👥 TEAM ROSTER',
            value: rosterLines.join('\n').slice(0, 1024),
        });
    }
    if (!active) {
        return { embeds: [embed], components: [] };
    }
    // Row 1: Forward buttons (Max 3 buttons)
    const forwardRow = new ActionRowBuilder().addComponents(['LW', 'C', 'RW'].map((pos) => new ButtonBuilder()
        .setCustomId(customId('roster-set-pos', active.member.id, pos))
        .setLabel(`🏒 ${pos}`)
        .setStyle(active.player.signupPositions.includes(pos)
        ? ButtonStyle.Success
        : ButtonStyle.Primary)));
    // Row 2: Defense & Goalie buttons (Max 3 buttons)
    const defGoalieRow = new ActionRowBuilder().addComponents(['LD', 'RD', 'G'].map((pos) => new ButtonBuilder()
        .setCustomId(customId('roster-set-pos', active.member.id, pos))
        .setLabel(pos === 'G' ? `🥅 ${pos}` : `🛡️ ${pos}`)
        .setStyle(active.player.signupPositions.includes(pos)
        ? ButtonStyle.Success
        : ButtonStyle.Secondary)));
    // Row 3: Navigation & Fast Edit Modal (Max 3 buttons)
    const navRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('roster-prev', active.member.id))
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
        .setCustomId(customId('roster-next', active.member.id))
        .setLabel('Skip / Next ▶')
        .setStyle(ButtonStyle.Secondary), new ButtonBuilder()
        .setCustomId(customId('roster-modal-btn', roleId))
        .setLabel('⚡ Bulk Paste / Edit')
        .setStyle(ButtonStyle.Success));
    // Row 4: Select Menu for jumping directly to any player (1 component)
    const selectMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('roster-player-select', roleId))
        .setPlaceholder(`Jump to player... (Now: ${active.member.displayName})`)
        .addOptions(playerRows.slice(0, 25).map(({ member, player }) => ({
        label: (member.displayName || member.user.username).slice(0, 100),
        value: member.id,
        description: `Current: ${player.signupPositions.join('/') || 'Not set'}`,
        default: member.id === active.member.id,
    }))));
    return {
        embeds: [embed],
        components: [forwardRow, defGoalieRow, navRow, selectMenu],
    };
}
const VALID_SIGNUP_POSITIONS = new Set(['LW', 'C', 'RW', 'LD', 'RD', 'G']);
export async function applyRosterLines(guild, context, rawRoster) {
    const lines = rawRoster.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const results = [];
    const errors = [];
    for (const line of lines) {
        const cleanTokens = line
            .replace(/[():\-–—,]/g, ' ')
            .split(/\s+/)
            .map((t) => t.trim().toUpperCase())
            .filter(Boolean);
        let foundPos;
        let foundPosIndex = -1;
        for (let i = cleanTokens.length - 1; i >= 0; i--) {
            if (VALID_SIGNUP_POSITIONS.has(cleanTokens[i])) {
                foundPos = cleanTokens[i];
                foundPosIndex = i;
                break;
            }
        }
        if (!foundPos) {
            errors.push(`Could not find a valid position in: \`${line}\``);
            continue;
        }
        const mentionMatch = line.match(/<@!?(\d+)>/);
        let discordUserId = mentionMatch ? mentionMatch[1] : null;
        if (!discordUserId) {
            const idToken = cleanTokens.find((t) => /^\d{17,20}$/.test(t));
            if (idToken)
                discordUserId = idToken;
        }
        if (discordUserId) {
            try {
                let displayName = discordUserId;
                const cachedMember = guild.members.cache.get(discordUserId);
                if (cachedMember) {
                    displayName = cachedMember.displayName || cachedMember.user.username;
                }
                else {
                    try {
                        const member = await guild.members.fetch(discordUserId);
                        displayName = member.displayName || member.user.username;
                    }
                    catch {
                        // ignore fetch error
                    }
                }
                await context.players.updatePositions(guild.id, discordUserId, [foundPos], displayName);
                results.push(`<@${discordUserId}> → **${foundPos}**`);
            }
            catch (err) {
                errors.push(`Failed for <@${discordUserId}>: ${err.message}`);
            }
            continue;
        }
        const nameTokens = cleanTokens.filter((t, idx) => idx !== foundPosIndex && !/^\d+\.?$/.test(t));
        const query = nameTokens.join(' ').trim();
        if (!query) {
            errors.push(`No player name found in: \`${line}\``);
            continue;
        }
        const memberMatch = Array.from(guild.members.cache.values()).find((m) => m.displayName.toLowerCase() === query.toLowerCase() ||
            m.user.username.toLowerCase() === query.toLowerCase() ||
            m.displayName.toLowerCase().includes(query.toLowerCase()));
        if (memberMatch) {
            try {
                await context.players.updatePositions(guild.id, memberMatch.id, [foundPos], memberMatch.displayName || memberMatch.user.username);
                results.push(`<@${memberMatch.id}> (${memberMatch.displayName}) → **${foundPos}**`);
            }
            catch (err) {
                errors.push(`Failed for ${memberMatch.displayName}: ${err.message}`);
            }
            continue;
        }
        const matches = await context.players.search(guild.id, query);
        if (matches.length > 0) {
            const p = matches[0];
            await context.players.updatePositions(guild.id, p.discordUserId, [foundPos], p.discordDisplayName);
            results.push(`\`${p.eaTag}\` (<@${p.discordUserId}>) → **${foundPos}**`);
        }
        else {
            errors.push(`Player not found for: \`${query}\``);
        }
    }
    return { results, errors };
}
export async function handleSetPositions(interaction, context) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferReply({ ephemeral: true });
    const rawRoster = interaction.options.getString('roster')?.trim();
    if (!rawRoster) {
        const config = await context.config.ensure(interaction.guildId);
        const { role, members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, true);
        if (!members.length) {
            throw new AppError('NOT_FOUND', `No members found with role <@&${role.id}>.`);
        }
        const playerRows = await loadPlayerRows(interaction.guildId, members, context);
        const panel = renderRosterPositionsPanel(role.id, playerRows);
        await interaction.editReply(panel);
        return;
    }
    const { results, errors } = await applyRosterLines(interaction.guild, context, rawRoster);
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
    await interaction.editReply({ embeds: [embed] });
}
export async function handleRosterPlayerSelect(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferUpdate();
    const roleId = parsed.entityId;
    const selectedMemberId = interaction.values[0];
    const config = await context.config.ensure(interaction.guildId);
    const { members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, false);
    const playerRows = await loadPlayerRows(interaction.guildId, members, context);
    const panel = renderRosterPositionsPanel(roleId, playerRows, selectedMemberId);
    await interaction.editReply(panel);
}
export async function handleRosterSetPosButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferUpdate();
    const targetUserId = parsed.entityId;
    const position = parsed.value;
    let displayName = targetUserId;
    const cachedMember = interaction.guild.members.cache.get(targetUserId);
    if (cachedMember) {
        displayName = cachedMember.displayName || cachedMember.user.username;
    }
    await context.players.updatePositions(interaction.guildId, targetUserId, [position], displayName);
    const config = await context.config.ensure(interaction.guildId);
    const { role, members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, false);
    const playerRows = await loadPlayerRows(interaction.guildId, members, context);
    // Automatically advance to the next player
    const currentIndex = playerRows.findIndex((p) => p.member.id === targetUserId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % playerRows.length : 0;
    const nextMemberId = playerRows[nextIndex]?.member.id;
    const notice = `✅ Saved <@${targetUserId}> as **${position}**!`;
    const panel = renderRosterPositionsPanel(role.id, playerRows, nextMemberId, notice);
    await interaction.editReply(panel);
}
export async function handleRosterNavButton(interaction, context, parsed, direction) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferUpdate();
    const currentMemberId = parsed.entityId;
    const config = await context.config.ensure(interaction.guildId);
    const { role, members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, false);
    const playerRows = await loadPlayerRows(interaction.guildId, members, context);
    const currentIndex = playerRows.findIndex((p) => p.member.id === currentMemberId);
    const newIndex = direction === 'prev'
        ? (currentIndex - 1 + playerRows.length) % playerRows.length
        : (currentIndex + 1) % playerRows.length;
    const nextMemberId = playerRows[newIndex]?.member.id;
    const panel = renderRosterPositionsPanel(role.id, playerRows, nextMemberId);
    await interaction.editReply(panel);
}
export async function handleRosterModalButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    const roleId = parsed.entityId;
    const config = await context.config.ensure(interaction.guildId);
    const { members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, false);
    const playerRows = await loadPlayerRows(interaction.guildId, members, context);
    const prefill = playerRows
        .map(({ member, player }) => `<@${member.id}> ${player.signupPositions[0] ?? 'C'}`)
        .join('\n');
    const modal = new ModalBuilder()
        .setCustomId(customId('modal-roster-positions', roleId))
        .setTitle('Bulk Set Roster Positions')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('rosterText')
        .setLabel('Roster & Positions (one per line)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('<@user_id> C\nAntkogg LW\nPlayer2 RD')
        .setValue(prefill.slice(0, 4000))
        .setRequired(true)));
    await interaction.showModal(modal);
}
export async function handleRosterModalSubmit(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await requireManagement(interaction, context);
    await interaction.deferUpdate();
    const rawText = interaction.fields.getTextInputValue('rosterText');
    const { results, errors } = await applyRosterLines(interaction.guild, context, rawText);
    const roleId = parsed.entityId;
    const config = await context.config.ensure(interaction.guildId);
    const { members } = await getTeamMembersWithRole(interaction.guild, config.rosterRoleId, false);
    const playerRows = await loadPlayerRows(interaction.guildId, members, context);
    let notice = results.length
        ? `⚡ **Bulk Updated ${results.length} Player(s)!**`
        : `⚠️ No positions were updated.`;
    if (errors.length) {
        notice += ` (${errors.length} skipped - check formatting)`;
    }
    const panel = renderRosterPositionsPanel(roleId, playerRows, undefined, notice);
    await interaction.editReply(panel);
}
//# sourceMappingURL=management.js.map