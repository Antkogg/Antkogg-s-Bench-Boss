import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, } from 'discord.js';
import { DateTime } from 'luxon';
import { localWeekday } from '../domain/schedule-time.js';
import { publishAvailability } from '../commands/availability.js';
import { requireManagement } from '../commands/authorization.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { gameOpponentLabel, renderGame, renderIndividualGamePost, renderManagementWeek, renderLineupDashboard } from '../renderers/schedule.renderer.js';
import { parseScheduleLine, syncAvailabilityPost, syncSingleGamePost, syncLineupDashboard } from '../commands/schedule.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { customId, parseCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { DEFAULT_ROSTER_ROLE_ID } from '../config/constants.js';
import { checkTeamRole, resolveMemberTeamStatus } from './weekly-availability.js';
const POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
export async function handleWeekButton(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    if (parsed.value === 'quick-add') {
        const input = new TextInputBuilder()
            .setCustomId('game')
            .setLabel('Game Details')
            .setPlaceholder('e.g. MON 9:00 PM vs Bruins or 2026-10-05 21:00 vs Bruins')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        await interaction.showModal(new ModalBuilder()
            .setCustomId(customId('modal-quick-game', parsed.entityId))
            .setTitle('Add League Game')
            .addComponents(new ActionRowBuilder().addComponents(input)));
        return;
    }
    if (parsed.value === 'publish') {
        const channelId = await publishAvailability(interaction, context, parsed.entityId);
        await interaction.reply({
            ephemeral: true,
            embeds: [renderSuccess('Availability published', `Posted or refreshed in <#${channelId}>.`)],
        });
        return;
    }
    if (parsed.value === 'lock' || parsed.value === 'reopen') {
        const updated = await context.weeklyAvailability.setState(parsed.entityId, parsed.value === 'lock' ? 'LOCKED' : 'OPEN', interaction.user.id);
        if (updated.channelId && updated.messageId) {
            try {
                const channel = (await interaction.client.channels.fetch(updated.channelId));
                await (await channel.messages.fetch(updated.messageId)).edit(renderWeeklyAvailability(updated));
            }
            catch {
                /* Publishing again repairs a missing post. */
            }
        }
        const week = await context.schedule.getWeek(parsed.entityId);
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        await interaction.update(renderManagementWeek(week));
        return;
    }
    if (parsed.value?.startsWith('edit-')) {
        const day = parsed.value.slice(5);
        const [week, timezone] = await Promise.all([
            context.schedule.getWeek(parsed.entityId),
            context.schedule.managementTimezone(interaction.guildId, interaction.user.id),
        ]);
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const games = week.games.filter((game) => localWeekday(game.scheduledAtUtc, timezone) === day);
        if (!games.length)
            throw new AppError('NOT_FOUND', `No ${day.toLowerCase()} slots exist.`);
        const value = games
            .map((game) => `${game.opponentNameSnapshot ?? 'TBD'} | ${game.homeAway ?? 'HOME'} | ${DateTime.fromJSDate(game.scheduledAtUtc).setZone(timezone).toFormat('h:mm a')}`)
            .join('\n');
        const input = new TextInputBuilder()
            .setCustomId('games')
            .setLabel('Opponent | HOME/AWAY | time')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setValue(value);
        await interaction.showModal(new ModalBuilder()
            .setCustomId(customId('modal-week-day', parsed.entityId, day))
            .setTitle(`Edit ${day[0]}${day.slice(1).toLowerCase()}`)
            .addComponents(new ActionRowBuilder().addComponents(input)));
    }
}
export async function handleWeekDayModal(interaction, context, parsed) {
    if (!interaction.guildId || !parsed.value)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const entries = interaction.fields
        .getTextInputValue('games')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
        const [rawOpponent, rawHomeAway, rawTime] = line.split('|').map((value) => value.trim());
        const opponent = !rawOpponent || rawOpponent.toUpperCase() === 'TBD' ? null : rawOpponent;
        const normalizedHomeAway = rawHomeAway?.toUpperCase();
        if (normalizedHomeAway !== 'HOME' && normalizedHomeAway !== 'AWAY')
            throw new AppError('INVALID_INPUT', `Use HOME or AWAY in: ${line}`);
        const homeAway = normalizedHomeAway;
        return { opponent, homeAway, ...(rawTime ? { time: rawTime } : {}) };
    });
    const week = await context.schedule.updateDay(interaction.guildId, parsed.entityId, parsed.value, entries, interaction.user.id);
    await refreshWeekPost(interaction, week);
    await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
}
export async function handleQuickGameModal(interaction, context, _parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const rawInput = interaction.fields.getTextInputValue('game').trim();
    const parsedGame = parseScheduleLine(rawInput);
    if (!parsedGame) {
        throw new AppError('INVALID_INPUT', `Could not understand format in: "${rawInput}".\nTry: "MON 9:00 PM vs Bruins" or "2026-10-05 21:00 vs Bruins"`);
    }
    await context.schedule.addGame({
        guildId: interaction.guildId,
        opponent: parsedGame.opponent,
        date: parsedGame.date,
        time: parsedGame.time,
        homeAway: parsedGame.homeAway,
        actorDiscordId: interaction.user.id,
    });
    const week = await context.schedule.currentWeek(interaction.guildId);
    if (week) {
        await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
    }
    await interaction.reply({
        ephemeral: true,
        embeds: [
            renderSuccess('Game Added', `Added **${parsedGame.homeAway === 'AWAY' ? '@' : 'vs'} ${parsedGame.opponent}** for **${parsedGame.date} at ${parsedGame.time}**.\n` +
                'The `#team-availability` board has been refreshed!'),
        ],
    });
}
export async function handleWeekGameSelect(interaction, context) {
    await requireManagement(interaction, context);
    const game = await context.schedule.game(interaction.values[0]);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    await interaction.update(renderGame(game, true));
}
export async function handleEcuGameSelect(interaction, context) {
    await requireManagement(interaction, context);
    const gameId = interaction.values[0];
    const game = await context.schedule.game(gameId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('ecu-pos-select', game.id))
        .setPlaceholder('Choose which position needs an ECU...')
        .addOptions(POSITIONS.map((p) => ({ label: `Find ECU for ${p}`, value: p }))));
    await interaction.update({
        content: `🔍 Looking for ECU for **${gameOpponentLabel(game)}**:\nChoose the position:`,
        embeds: [],
        components: [row],
    });
}
export async function handleEcuPosSelect(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const position = interaction.values[0];
    const gameId = parsed?.entityId || parseCustomId(interaction.customId).entityId;
    const game = await context.schedule.game(gameId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const tcPlayers = await context.prisma.player.findMany({
        where: {
            guildConfig: { guildId: interaction.guildId },
            teamStatus: 'TC',
        },
        include: {
            weeklyAvailability: {
                where: { weekId: game.weekId },
                include: { responses: { where: { gameId: game.id } } },
                take: 1,
            },
            gameLineups: {
                where: { game: { weekId: game.weekId } },
            },
        },
        orderBy: [{ eaTag: 'asc' }],
    });
    const availableTc = tcPlayers.filter((p) => p.weeklyAvailability[0]?.responses[0]?.status === 'AVAILABLE');
    if (!availableTc.length) {
        await interaction.update({
            content: `⚠️ No TC players submitted availability as **Available** for **${gameOpponentLabel(game)}**.\n\nYou can still use the regular **Set Lineup** button to manually assign any player.`,
            components: [],
        });
        return;
    }
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId('lineup-player-select', game.id, position))
        .setPlaceholder(`Choose available TC player for ${position}...`)
        .addOptions(availableTc.slice(0, 25).map((player) => {
        const gamesPlayed = player.gameLineups?.length ?? 0;
        const ecuNote = gamesPlayed >= 2 ? '⚠️ (Used 2 ECU games)' : `(${gamesPlayed}/2 ECU games used)`;
        return {
            label: `${player.eaTag} [TC]`.slice(0, 100),
            value: player.id,
            description: `🟢 Available • ${ecuNote}`,
        };
    }));
    await interaction.update({
        content: `Found **${availableTc.length} available TC player(s)** for **${position}** in **${gameOpponentLabel(game)}**:\nSelect a player below to insert into the lineup:`,
        components: [new ActionRowBuilder().addComponents(menu)],
    });
}
export async function handleLineupButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const config = await context.config.get(interaction.guildId);
    const isMgmt = hasManagementAccess(accessLevel(member, config));
    if (!isMgmt) {
        throw new AppError('NOT_ALLOWED', 'Only team management can manage or confirm lineups.');
    }
    // Lock Weekly Lines
    if (parsed.value === 'lock-lines') {
        const result = await context.schedule.lockWeeklyLines(interaction.guildId, parsed.entityId, interaction.user.id);
        let dmCount = 0;
        for (const del of result.deliveries) {
            const sent = await context.notifications.weeklyScheduleConfirmed(del.discordUserId, result.week.label, del.games.map((g) => ({
                scheduledAtUtc: g.game.scheduledAtUtc,
                opponentNameSnapshot: g.game.opponentNameSnapshot,
                homeAway: g.game.homeAway,
                position: g.position,
                gameServer: g.game.gameServer,
                gameCode: g.game.gameCode,
            })));
            if (sent)
                dmCount++;
        }
        await syncAvailabilityPost(interaction.guildId, result.week, context, interaction.client);
        await syncLineupDashboard(interaction.guildId, result.week, context, interaction.client);
        const warning = result.openSpots > 0
            ? `\n⚠️ **${result.openSpots} lineup spot(s) were still open.**`
            : '';
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Weekly Lines Locked', `🔒 Finalized schedule for **${result.week.label}**!\n` +
                    `Delivered personalized schedule DMs to **${dmCount} player(s)**.${warning}\n` +
                    `The board in \`#team-availability\` is updated and locked.`),
            ],
        });
        return;
    }
    // Master Availability Sheet
    if (parsed.value === 'avail-sheet') {
        let week = await context.schedule.getWeek(parsed.entityId);
        if (!week) {
            const g = await context.schedule.game(parsed.entityId);
            if (g)
                week = await context.schedule.getWeek(g.weekId);
        }
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const activeGames = week.games.filter((g) => g.status !== 'CANCELLED');
        const totalGames = activeGames.length;
        const allPlayers = await context.prisma.player.findMany({
            where: {
                guildConfig: { guildId: interaction.guildId },
                teamStatus: { in: ['ROSTER', 'TC'] },
            },
            include: {
                weeklyAvailability: {
                    where: { weekId: week.id },
                    include: { responses: { where: { gameId: { in: activeGames.map((g) => g.id) } } } },
                    take: 1,
                },
            },
            orderBy: [{ teamStatus: 'asc' }, { eaTag: 'asc' }],
        });
        const fullAvail = [];
        const partialAvail = [];
        const outAll = [];
        const noResponse = [];
        for (const p of allPlayers) {
            const responses = p.weeklyAvailability[0]?.responses ?? [];
            const availCount = responses.filter((r) => r.status === 'AVAILABLE').length;
            const tcTag = p.teamStatus === 'TC' ? ' *(TC)*' : '';
            const mention = `<@${p.discordUserId}>${tcTag}`;
            if (!responses.length) {
                noResponse.push(mention);
            }
            else if (availCount === totalGames) {
                fullAvail.push(`${mention} (${totalGames}/${totalGames})`);
            }
            else if (availCount === 0) {
                outAll.push(mention);
            }
            else {
                partialAvail.push(`${mention} (${availCount}/${totalGames})`);
            }
        }
        const embed = brandedEmbed()
            .setTitle(`📋 ${week.label.toUpperCase()} MASTER AVAILABILITY SHEET`)
            .setDescription(`Total Active Players: **${allPlayers.length}** • Games Scheduled: **${totalGames}**\n\n` +
            `🟢 **AVAILABLE FOR ALL GAMES (${fullAvail.length}):**\n` +
            (fullAvail.length ? fullAvail.join(', ').slice(0, 950) : '*None*') +
            `\n\n🟡 **PARTIAL AVAILABILITY (${partialAvail.length}):**\n` +
            (partialAvail.length ? partialAvail.join(', ').slice(0, 950) : '*None*') +
            `\n\n🔴 **OUT FOR ALL GAMES (${outAll.length}):**\n` +
            (outAll.length ? outAll.join(', ').slice(0, 950) : '*None*') +
            `\n\n⚪ **NO RESPONSE YET (${noResponse.length}):**\n` +
            (noResponse.length ? noResponse.join(', ').slice(0, 950) : '*None*'));
        await interaction.reply({
            ephemeral: true,
            embeds: [embed],
        });
        return;
    }
    // Refresh Dashboard
    if (parsed.value === 'refresh-dashboard') {
        let week = await context.schedule.getWeek(parsed.entityId);
        if (!week) {
            const g = await context.schedule.game(parsed.entityId);
            if (g)
                week = await context.schedule.getWeek(g.weekId);
        }
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        await syncLineupDashboard(interaction.guildId, week, context, interaction.client);
        const summary = await context.schedule.getWeekSchedulingSummary(interaction.guildId, week.id);
        const payload = renderLineupDashboard(week, summary);
        await interaction.reply({
            ephemeral: true,
            content: '🔄 Lineup Dashboard refreshed in <#1557879793809096824>!',
            embeds: payload.embeds,
            components: payload.components,
        });
        return;
    }
    // Find ECU
    if (parsed.value === 'find-ecu') {
        let week = await context.schedule.getWeek(parsed.entityId);
        if (!week) {
            const g = await context.schedule.game(parsed.entityId);
            if (g)
                week = await context.schedule.getWeek(g.weekId);
        }
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const activeGames = week.games.filter((g) => g.status !== 'CANCELLED');
        if (!activeGames.length) {
            throw new AppError('NOT_FOUND', 'No active games in this week.');
        }
        const selectMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(customId('lineup-action', week.id, 'ecu-game-chosen'))
            .setPlaceholder('Choose game that needs an ECU replacement...')
            .addOptions(activeGames.map((g, idx) => ({
            label: `Game ${idx + 1}: ${gameOpponentLabel(g)}`.slice(0, 100),
            value: g.id,
            description: DateTime.fromJSDate(g.scheduledAtUtc).toFormat('cccc h:mm a'),
        }))));
        await interaction.reply({
            ephemeral: true,
            content: '🔍 **Select which game needs an ECU / replacement player:**',
            components: [selectMenu],
        });
        return;
    }
    // Nightly Line Shortcut Prompt
    if (parsed.value === 'night-prompt') {
        const week = await context.schedule.getWeek(parsed.entityId);
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(customId('lineup-action', week.id, 'night-SUNDAY'))
            .setLabel('🏒 Sunday Line (3 Games)')
            .setStyle(ButtonStyle.Primary), new ButtonBuilder()
            .setCustomId(customId('lineup-action', week.id, 'night-MONDAY'))
            .setLabel('🏒 Monday Line (3 Games)')
            .setStyle(ButtonStyle.Primary), new ButtonBuilder()
            .setCustomId(customId('lineup-action', week.id, 'night-TUESDAY'))
            .setLabel('🏒 Tuesday Line (3 Games)')
            .setStyle(ButtonStyle.Primary));
        await interaction.reply({
            ephemeral: true,
            content: '⚡ **NIGHTLY LINEUP SHORTCUT**\n' +
                'Select a night to assign an entire 6-player line to all 3 games at once without manually entering them 3 times:',
            components: [row],
        });
        return;
    }
    // Choose game from week
    if (parsed.value === 'choose-game') {
        let week = await context.schedule.getWeek(parsed.entityId);
        if (!week) {
            const g = await context.schedule.game(parsed.entityId);
            if (g)
                week = await context.schedule.getWeek(g.weekId);
        }
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const activeGames = week.games.filter((g) => g.status !== 'CANCELLED');
        if (!activeGames.length) {
            throw new AppError('NOT_FOUND', 'No active games in this week.');
        }
        const selectMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(customId('lineup-action', week.id, 'game-chosen'))
            .setPlaceholder('Choose a game to edit lineup...')
            .addOptions(activeGames.map((g, idx) => ({
            label: `Game ${idx + 1}: ${gameOpponentLabel(g)}`.slice(0, 100),
            value: g.id,
            description: DateTime.fromJSDate(g.scheduledAtUtc).toFormat('cccc h:mm a'),
        }))));
        await interaction.reply({
            ephemeral: true,
            content: '🏒 **Select which game to edit the lineup for:**',
            components: [selectMenu],
        });
        return;
    }
    // Night line builder view for specific day
    if (parsed.value?.startsWith('night-')) {
        const day = parsed.value.replace('night-', '');
        const week = await context.schedule.getWeek(parsed.entityId);
        if (!week)
            throw new AppError('NOT_FOUND', 'Week not found.');
        const tz = config?.timezone || 'America/New_York';
        const dayGames = week.games
            .filter((g) => g.status !== 'CANCELLED' && localWeekday(g.scheduledAtUtc, tz) === day)
            .sort((a, b) => a.scheduledAtUtc.getTime() - b.scheduledAtUtc.getTime());
        if (!dayGames.length) {
            throw new AppError('NOT_FOUND', `No scheduled games found on ${day} for this week.`);
        }
        const posMap = new Map();
        for (const pos of POSITIONS) {
            const firstAssigned = dayGames[0]?.lineup?.find((l) => l.position === pos);
            posMap.set(pos, firstAssigned ? `<@${firstAssigned.player.discordUserId}>` : '*Open*');
        }
        const timesText = dayGames
            .map((g, idx) => `Game ${idx + 1}: <t:${Math.floor(g.scheduledAtUtc.getTime() / 1000)}:t>`)
            .join(' • ');
        const embed = brandedEmbed()
            .setTitle(`⚡ ${day} LINEUP BUILDER`)
            .setDescription(`Assigning this line will fill **all ${dayGames.length} ${day} games** (${timesText}).\n\n` +
            `**Current Line:**\n` +
            `\`LW\` ${posMap.get('LW')} ┃ \`C\` ${posMap.get('C')} ┃ \`RW\` ${posMap.get('RW')}\n` +
            `\`LD\` ${posMap.get('LD')} ┃ \`RD\` ${posMap.get('RD')} ┃ \`G\` ${posMap.get('G')}\n\n` +
            `*Pick a position below to set a player across all ${day} games:*`);
        const selectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(customId('night-pos-select', week.id, day))
            .setPlaceholder(`Choose a position to assign for all ${day} games...`)
            .addOptions(POSITIONS.map((p) => ({ label: `Set ${p}`, value: p }))));
        const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(customId('lineup-action', week.id, 'night-prompt'))
            .setLabel('Switch Night')
            .setStyle(ButtonStyle.Secondary));
        if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
            await interaction.update({
                embeds: [embed],
                components: [selectRow, actionRow],
            });
        }
        else {
            await interaction.reply({
                ephemeral: true,
                embeds: [embed],
                components: [selectRow, actionRow],
            });
        }
        return;
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    if (parsed.value === 'confirm') {
        const assignments = game.lineup ?? [];
        if (!assignments.length) {
            await interaction.reply({
                ephemeral: true,
                content: `⚠️ No players are in the lineup for **${gameOpponentLabel(game)}** yet!\nUse the **Set Lineup** button to assign positions first.`,
            });
            return;
        }
        const result = await context.schedule.confirmLineup(interaction.guildId, parsed.entityId, interaction.user.id);
        const updatedGame = await context.schedule.game(parsed.entityId);
        if (!updatedGame)
            throw new AppError('NOT_FOUND', 'Game not found.');
        const delivered = [];
        for (const assignment of result.newlyConfirmed) {
            const sent = await context.notifications.lineupConfirmed(assignment.player.discordUserId, updatedGame, assignment.position);
            if (sent)
                delivered.push(assignment.id);
        }
        await context.schedule.markConfirmationNotified(delivered);
        const week = await context.schedule.getWeek(updatedGame.weekId);
        if (week && week.messageId) {
            await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
        }
        await syncSingleGamePost(interaction.guildId, parsed.entityId, context, interaction.client);
        const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);
        if (isEphemeral) {
            await interaction.update(renderGame(updatedGame, true));
        }
        else {
            await interaction.reply({
                ephemeral: true,
                content: `✅ Lineup confirmed for **${gameOpponentLabel(updatedGame)}**! Notified **${result.newlyConfirmed.length}** player(s) via DM. The card in the channel has been updated!`,
            });
        }
        return;
    }
    // Set / Edit Lineup
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('lineup-position-select', parsed.entityId))
        .setPlaceholder('Choose a position to fill or clear...')
        .addOptions(POSITIONS.map((position) => ({ label: position, value: position }))));
    const rendered = renderGame(game, true);
    const components = [row, ...rendered.components];
    const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);
    if (isEphemeral) {
        await interaction.update({
            embeds: rendered.embeds,
            components,
        });
    }
    else {
        await interaction.reply({
            ephemeral: true,
            embeds: rendered.embeds,
            components,
        });
    }
}
export async function handleLineupPositionSelect(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const position = interaction.values[0];
    const gameId = parsed?.entityId || parseCustomId(interaction.customId).entityId;
    const candidates = await context.schedule.lineupCandidates(interaction.guildId, gameId, position);
    const rows = [];
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId('lineup-player-select', gameId, position))
        .setPlaceholder(`Select ${position} from team players`);
    const options = [
        { label: `Clear ${position}`, value: 'CLEAR', description: 'Remove the current assignment' },
    ];
    if (candidates.length > 0) {
        options.push(...candidates.slice(0, 24).map(({ player, availability }) => {
            const badge = availability === 'AVAILABLE'
                ? '🟢 Available'
                : availability === 'UNAVAILABLE'
                    ? '🔴 Out'
                    : '⚪ No Response';
            return {
                label: player.eaTag.slice(0, 100),
                value: player.id,
                description: badge,
            };
        }));
    }
    menu.addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(menu));
    const userMenu = new UserSelectMenuBuilder()
        .setCustomId(customId('lineup-user-select', gameId, position))
        .setPlaceholder(`Or pick team player for ${position} from Discord`)
        .setMinValues(1)
        .setMaxValues(1);
    rows.push(new ActionRowBuilder().addComponents(userMenu));
    await interaction.update({
        content: `Select **${position}**. Pick from team players below, or select any member directly from Discord:`,
        components: rows,
    });
}
export async function handleLineupPlayerSelect(interaction, context, parsed) {
    if (!interaction.guildId || !parsed.value)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const position = parsed.value;
    let warning = '';
    if (interaction.values[0] === 'CLEAR') {
        const removed = await context.schedule.clearLineupPosition(interaction.guildId, parsed.entityId, position, interaction.user.id);
        if (removed?.confirmed)
            await context.notifications.lineupRemoved(removed.player.discordUserId, await context.schedule.game(parsed.entityId), position);
    }
    else {
        const result = await context.schedule.assignLineupPosition({
            guildId: interaction.guildId,
            gameId: parsed.entityId,
            playerId: interaction.values[0],
            position,
            actorDiscordId: interaction.user.id,
        });
        if (result.removed?.confirmed)
            await context.notifications.lineupRemoved(result.removed.player.discordUserId, await context.schedule.game(parsed.entityId), position);
        if (result.movedConfirmed)
            await context.notifications.lineupRemoved(result.movedConfirmed.player.discordUserId, await context.schedule.game(parsed.entityId), result.movedConfirmed.position);
        if (result.assignment.availabilityOverride)
            warning = `\n⚠️ ${result.assignment.player.eaTag} was ${result.availability}; this override was audited.`;
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const week = await context.schedule.getWeek(game.weekId);
    if (week && week.messageId && interaction.guildId) {
        await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
    }
    if (interaction.guildId) {
        await syncSingleGamePost(interaction.guildId, parsed.entityId, context, interaction.client);
        if (week) {
            await syncLineupDashboard(interaction.guildId, week, context, interaction.client);
        }
    }
    await interaction.update({ content: `Lineup updated.${warning}`, ...renderGame(game, true) });
}
export async function handleLineupUserSelect(interaction, context, parsed) {
    if (!interaction.guildId || !parsed.value || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const position = parsed.value;
    const targetUserId = interaction.values[0];
    const member = await interaction.guild.members.fetch(targetUserId);
    const player = await context.players.byDiscordId(interaction.guildId, member.user.id, member.displayName ?? member.user.username, member.user.displayAvatarURL());
    if (player.teamStatus !== 'ROSTER') {
        await context.prisma.player.update({
            where: { id: player.id },
            data: {
                teamStatus: 'ROSTER',
                registered: true,
                signupPositions: Array.from(new Set([...player.signupPositions, position])),
            },
        });
    }
    const result = await context.schedule.assignLineupPosition({
        guildId: interaction.guildId,
        gameId: parsed.entityId,
        playerId: player.id,
        position,
        actorDiscordId: interaction.user.id,
    });
    if (result.removed?.confirmed)
        await context.notifications.lineupRemoved(result.removed.player.discordUserId, await context.schedule.game(parsed.entityId), position);
    if (result.movedConfirmed)
        await context.notifications.lineupRemoved(result.movedConfirmed.player.discordUserId, await context.schedule.game(parsed.entityId), result.movedConfirmed.position);
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const week = await context.schedule.getWeek(game.weekId);
    if (week && week.messageId && interaction.guildId) {
        await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
    }
    if (interaction.guildId) {
        await syncSingleGamePost(interaction.guildId, parsed.entityId, context, interaction.client);
        if (week) {
            await syncLineupDashboard(interaction.guildId, week, context, interaction.client);
        }
    }
    await interaction.update({
        content: `Lineup updated: added <@${member.user.id}> at **${position}**.`,
        ...renderGame(game, true),
    });
}
export async function handleGameButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    if (parsed.value === 'delete') {
        await requireManagement(interaction, context);
        const updatedWeek = await context.schedule.deleteGame(interaction.guildId, parsed.entityId, interaction.user.id);
        if (updatedWeek) {
            await refreshWeekPost(interaction, updatedWeek);
            await syncAvailabilityPost(interaction.guildId, updatedWeek, context, interaction.client);
        }
        await interaction.reply({
            ephemeral: true,
            embeds: [renderSuccess('Game Deleted', 'The game was removed from the schedule.')],
        });
        return;
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    // Who's In / View List
    if (parsed.value === 'view-list') {
        const available = (game.responses ?? [])
            .filter((r) => r.status === 'AVAILABLE')
            .map((r) => `<@${r.submission.player.discordUserId}>`);
        const out = (game.responses ?? [])
            .filter((r) => r.status === 'UNAVAILABLE')
            .map((r) => `<@${r.submission.player.discordUserId}>`);
        const userResponse = game.responses?.find((r) => r.submission.player.discordUserId === interaction.user.id);
        const myStatus = userResponse
            ? userResponse.status === 'AVAILABLE'
                ? '🟢 **AVAILABLE**'
                : '🔴 **OUT**'
            : '⚪ **NO RESPONSE YET**';
        const embed = brandedEmbed()
            .setTitle(`📋 Game Responses: ${gameOpponentLabel(game).toUpperCase()}`)
            .setDescription(`📅 **Time:** <t:${Math.floor(game.scheduledAtUtc.getTime() / 1000)}:F>\n\n` +
            `👤 **Your Status:** ${myStatus}\n\n` +
            `🟢 **Available (${available.length}):**\n${available.length ? available.join(', ').slice(0, 800) : '*None yet*'}\n\n` +
            `🔴 **Out (${out.length}):**\n${out.length ? out.join(', ').slice(0, 800) : '*None*'}`);
        await interaction.reply({
            ephemeral: true,
            embeds: [embed],
        });
        return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const config = await context.config.get(interaction.guildId);
    const isMgmt = hasManagementAccess(accessLevel(member, config));
    if (!isMgmt) {
        const server = game.gameServer || 'Not set yet';
        const code = game.gameCode || 'Not set yet';
        await interaction.reply({
            ephemeral: true,
            content: `🎮 **Game Info for ${gameOpponentLabel(game)}**\n` +
                `**Server:** ${server}\n` +
                `**Game Code:** ${code}\n\n` +
                `*(Only team management can set or change the server and code)*`,
        });
        return;
    }
    const make = (id, label, value) => {
        const input = new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(false);
        if (value)
            input.setValue(value);
        return new ActionRowBuilder().addComponents(input);
    };
    await interaction.showModal(new ModalBuilder()
        .setCustomId(customId('modal-game-code', game.id))
        .setTitle('Set Server / Game Code')
        .addComponents(make('server', 'Server', game.gameServer ?? undefined), make('code', 'Game code', game.gameCode ?? undefined)));
}
export async function handlePlayerGameButton(interaction, context, parsed) {
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const assignment = game.lineup.find((entry) => entry.confirmed && entry.player.discordUserId === interaction.user.id);
    if (!assignment)
        throw new AppError('NOT_ALLOWED', 'You are not confirmed for this game anymore.');
    await interaction.reply({
        ...(interaction.inGuild() ? { ephemeral: true } : {}),
        ...renderGame(game, false, assignment.playerId),
    });
}
export async function handleGameAvailButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    const config = await context.config.get(interaction.guildId);
    const hasRole = await checkTeamRole(interaction, config?.rosterRoleId, config?.tcRoleId);
    if (!hasRole) {
        throw new AppError('NOT_ALLOWED', `Only players with the team role (<@&${config?.rosterRoleId ?? DEFAULT_ROSTER_ROLE_ID}>) can submit availability.`);
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const player = await context.players.byDiscordId(interaction.guildId, member.user.id, member.displayName ?? member.user.username, member.user.displayAvatarURL());
    const resolvedStatus = resolveMemberTeamStatus(member, config);
    if (player.teamStatus !== resolvedStatus || !player.registered) {
        await context.prisma.player.update({
            where: { id: player.id },
            data: { teamStatus: resolvedStatus, registered: true },
        });
        player.teamStatus = resolvedStatus;
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const status = parsed.value === 'available' ? 'AVAILABLE' : 'UNAVAILABLE';
    await context.prisma.$transaction(async (tx) => {
        const submission = await tx.weeklyAvailabilitySubmission.upsert({
            where: {
                weekId_playerId: {
                    weekId: game.weekId,
                    playerId: player.id,
                },
            },
            create: {
                weekId: game.weekId,
                playerId: player.id,
            },
            update: {
                submittedAt: new Date(),
            },
        });
        await tx.playerGameAvailability.upsert({
            where: {
                submissionId_gameId: {
                    submissionId: submission.id,
                    gameId: game.id,
                },
            },
            create: {
                submissionId: submission.id,
                gameId: game.id,
                status,
            },
            update: {
                status,
            },
        });
    });
    const updatedGame = await context.schedule.game(game.id);
    if (!updatedGame)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const week = await context.schedule.getWeek(game.weekId);
    const activeGames = week?.games.filter((g) => g.status !== 'CANCELLED') ?? [];
    const gameIndex = activeGames.findIndex((g) => g.id === game.id);
    const gameNumber = gameIndex >= 0 ? gameIndex + 1 : undefined;
    await interaction.update(renderIndividualGamePost(updatedGame, gameNumber));
    if (week) {
        syncAvailabilityPost(interaction.guildId, week, context, interaction.client).catch(() => null);
    }
}
export async function handleGameDayAvailButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    const config = await context.config.get(interaction.guildId);
    const hasRole = await checkTeamRole(interaction, config?.rosterRoleId, config?.tcRoleId);
    if (!hasRole) {
        throw new AppError('NOT_ALLOWED', `Only players with the team role (<@&${config?.rosterRoleId ?? DEFAULT_ROSTER_ROLE_ID}>) can submit availability.`);
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const player = await context.players.byDiscordId(interaction.guildId, member.user.id, member.displayName ?? member.user.username, member.user.displayAvatarURL());
    const resolvedStatus = resolveMemberTeamStatus(member, config);
    if (player.teamStatus !== resolvedStatus || !player.registered) {
        await context.prisma.player.update({
            where: { id: player.id },
            data: { teamStatus: resolvedStatus, registered: true },
        });
        player.teamStatus = resolvedStatus;
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const week = await context.schedule.getWeek(game.weekId);
    if (!week)
        throw new AppError('NOT_FOUND', 'Week not found.');
    const tz = config?.timezone ?? 'America/New_York';
    const targetDay = DateTime.fromJSDate(game.scheduledAtUtc, { zone: tz }).toFormat('cccc');
    const matchingGames = week.games.filter((g) => {
        if (g.status === 'CANCELLED')
            return false;
        const gDay = DateTime.fromJSDate(g.scheduledAtUtc, { zone: tz }).toFormat('cccc');
        return gDay === targetDay;
    });
    const dayNamePlural = `${targetDay}s`;
    if (parsed.value === 'prompt') {
        const promptRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(customId('game-day-avail', game.id, 'available'))
            .setLabel(`Available ${dayNamePlural}`)
            .setStyle(ButtonStyle.Success), new ButtonBuilder()
            .setCustomId(customId('game-day-avail', game.id, 'unavailable'))
            .setLabel(`Unavailable ${dayNamePlural}`)
            .setStyle(ButtonStyle.Danger));
        await interaction.reply({
            content: `Set your recurring availability for all **${dayNamePlural}** (${matchingGames.length} games):`,
            components: [promptRow],
            ephemeral: true,
        });
        return;
    }
    const status = parsed.value === 'available' ? 'AVAILABLE' : 'UNAVAILABLE';
    await context.prisma.$transaction(async (tx) => {
        const submission = await tx.weeklyAvailabilitySubmission.upsert({
            where: {
                weekId_playerId: {
                    weekId: game.weekId,
                    playerId: player.id,
                },
            },
            create: {
                weekId: game.weekId,
                playerId: player.id,
            },
            update: {
                submittedAt: new Date(),
            },
        });
        for (const mg of matchingGames) {
            await tx.playerGameAvailability.upsert({
                where: {
                    submissionId_gameId: {
                        submissionId: submission.id,
                        gameId: mg.id,
                    },
                },
                create: {
                    submissionId: submission.id,
                    gameId: mg.id,
                    status,
                },
                update: {
                    status,
                },
            });
        }
    });
    const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);
    if (isEphemeral) {
        await interaction.update({
            content: status === 'AVAILABLE'
                ? `✅ Marked as **Available** for all **${dayNamePlural}**.`
                : `❌ Marked as **Unavailable** for all **${dayNamePlural}**.`,
            components: [],
        });
        for (const mg of matchingGames) {
            await syncSingleGamePost(interaction.guildId, mg.id, context, interaction.client);
        }
    }
    else {
        const updatedThisGame = await context.schedule.game(game.id);
        const activeGames = week.games.filter((g) => g.status !== 'CANCELLED');
        const gameIndex = activeGames.findIndex((g) => g.id === game.id);
        const gameNumber = gameIndex >= 0 ? gameIndex + 1 : undefined;
        await interaction.update(renderIndividualGamePost(updatedThisGame, gameNumber));
        for (const otherGame of matchingGames) {
            if (otherGame.id !== game.id) {
                await syncSingleGamePost(interaction.guildId, otherGame.id, context, interaction.client);
            }
        }
    }
    syncAvailabilityPost(interaction.guildId, week, context, interaction.client).catch(() => null);
}
export async function handleGameCodeModal(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    const { config } = await requireManagement(interaction, context);
    const game = await context.schedule.setServerCode({
        guildId: interaction.guildId,
        gameId: parsed.entityId,
        server: interaction.fields.getTextInputValue('server'),
        code: interaction.fields.getTextInputValue('code'),
        actorDiscordId: interaction.user.id,
    });
    const delivered = [];
    if (config.notifyConfirmedGameInfo)
        for (const assignment of game.lineup) {
            const sent = await context.notifications.gameInfoReady(assignment.player.discordUserId, game, assignment.position);
            if (sent)
                delivered.push(assignment.id);
        }
    await context.schedule.markGameInfoNotified(delivered);
    await syncSingleGamePost(interaction.guildId, parsed.entityId, context, interaction.client);
    const week = await context.schedule.getWeek(game.weekId);
    if (interaction.message) {
        const activeGames = week?.games.filter((g) => g.status !== 'CANCELLED') ?? [];
        const gameIndex = activeGames.findIndex((g) => g.id === game.id);
        const gameNumber = gameIndex >= 0 ? gameIndex + 1 : undefined;
        await interaction.message.edit(renderIndividualGamePost(game, gameNumber)).catch(() => null);
    }
    else if (week) {
        await refreshWeekPost(interaction, week);
    }
    await interaction.reply({
        ephemeral: true,
        embeds: [
            renderSuccess('Server & Code Saved', `**Server:** ${game.gameServer ?? 'TBD'}\n**Code:** ${game.gameCode ?? 'TBD'}\n\n` +
                (config.notifyConfirmedGameInfo
                    ? 'Confirmed players were notified via DM.'
                    : 'Confirmed players can now use `/game`.')),
        ],
    });
}
export async function handleGameStatusSelect(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    await context.schedule.setGameStatus(interaction.guildId, parsed.entityId, interaction.values[0], interaction.user.id);
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    for (const assignment of game.lineup.filter((entry) => entry.confirmed))
        await context.notifications.regularGameStatus(assignment.player.discordUserId, game);
    const week = await context.schedule.getWeek(game.weekId);
    if (week)
        await refreshWeekPost(interaction, week);
    await interaction.update(renderGame(game, true));
}
async function refreshWeekPost(interaction, week) {
    if (!week?.channelId || !week.messageId)
        return;
    try {
        const channel = (await interaction.client.channels.fetch(week.channelId));
        await (await channel.messages.fetch(week.messageId)).edit(renderWeeklyAvailability(week));
    }
    catch {
        /* Publishing again repairs a missing post. */
    }
}
export async function handleNightPosSelect(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const weekId = parsed.entityId;
    const day = (parsed.value ?? 'SUNDAY');
    const position = interaction.values[0];
    const week = await context.schedule.getWeek(weekId);
    if (!week)
        throw new AppError('NOT_FOUND', 'Week not found.');
    const config = await context.config.get(interaction.guildId);
    const tz = config?.timezone || 'America/New_York';
    const dayGames = week.games.filter((g) => g.status !== 'CANCELLED' && localWeekday(g.scheduledAtUtc, tz) === day);
    const summary = await context.schedule.getWeekSchedulingSummary(interaction.guildId, weekId);
    const gameCounts = new Map();
    for (const p of summary?.playerGameCounts ?? []) {
        gameCounts.set(p.player.id, p.count);
    }
    const allPlayers = await context.prisma.player.findMany({
        where: {
            guildConfig: { guildId: interaction.guildId },
            teamStatus: { in: ['ROSTER', 'TC'] },
        },
        include: {
            weeklyAvailability: {
                where: { weekId },
                include: { responses: { where: { gameId: { in: dayGames.map((g) => g.id) } } } },
                take: 1,
            },
        },
        orderBy: [{ teamStatus: 'asc' }, { eaTag: 'asc' }],
    });
    const options = allPlayers.slice(0, 25).map((player) => {
        const responses = player.weeklyAvailability[0]?.responses ?? [];
        const availCount = responses.filter((r) => r.status === 'AVAILABLE').length;
        const totalDayGames = dayGames.length;
        const isAvail = availCount === totalDayGames;
        const isPartial = availCount > 0 && availCount < totalDayGames;
        const badge = isAvail
            ? `🟢 Avail (${availCount}/${totalDayGames})`
            : isPartial
                ? `🟡 Partial (${availCount}/${totalDayGames})`
                : responses.length
                    ? `🔴 Out (0/${totalDayGames})`
                    : '⚪ No Response';
        const count = gameCounts.get(player.id) ?? 0;
        const tcTag = player.teamStatus === 'TC' ? ' [TC]' : '';
        return {
            label: `${player.eaTag}${tcTag}`.slice(0, 100),
            value: player.id,
            description: `${badge} • ${count}/3 games assigned`,
        };
    });
    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('night-player-select', weekId, `${day}:${position}`))
        .setPlaceholder(`Select player for ${day} ${position} across all ${dayGames.length} games...`)
        .addOptions(options));
    await interaction.update({
        content: `Assigning **${day} ${position}** across all **${dayGames.length} games**:\nPick a player below:`,
        embeds: [],
        components: [menu],
    });
}
export async function handleNightPlayerSelect(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const weekId = parsed.entityId;
    const [day, position] = (parsed.value ?? '').split(':');
    const playerId = interaction.values[0];
    await context.schedule.assignNightLineup({
        guildId: interaction.guildId,
        weekId,
        day,
        lineup: { [position]: playerId },
        actorDiscordId: interaction.user.id,
    });
    const week = await context.schedule.getWeek(weekId);
    if (!week)
        throw new AppError('NOT_FOUND', 'Week not found.');
    const config = await context.config.get(interaction.guildId);
    const tz = config?.timezone || 'America/New_York';
    const dayGames = week.games
        .filter((g) => g.status !== 'CANCELLED' && localWeekday(g.scheduledAtUtc, tz) === day)
        .sort((a, b) => a.scheduledAtUtc.getTime() - b.scheduledAtUtc.getTime());
    await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
    await syncLineupDashboard(interaction.guildId, week, context, interaction.client);
    for (const g of dayGames) {
        await syncSingleGamePost(interaction.guildId, g.id, context, interaction.client);
    }
    const posMap = new Map();
    for (const pos of POSITIONS) {
        const firstAssigned = dayGames[0]?.lineup?.find((l) => l.position === pos);
        posMap.set(pos, firstAssigned ? `<@${firstAssigned.player.discordUserId}>` : '*Open*');
    }
    const timesText = dayGames
        .map((g, idx) => `Game ${idx + 1}: <t:${Math.floor(g.scheduledAtUtc.getTime() / 1000)}:t>`)
        .join(' • ');
    const embed = brandedEmbed()
        .setTitle(`⚡ ${day} LINEUP BUILDER`)
        .setDescription(`Assigned <@${dayGames[0]?.lineup?.find((l) => l.position === position)?.player.discordUserId}> to **${position}** for all **${dayGames.length} ${day} games** (${timesText}).\n\n` +
        `**Current Line:**\n` +
        `\`LW\` ${posMap.get('LW')} ┃ \`C\` ${posMap.get('C')} ┃ \`RW\` ${posMap.get('RW')}\n` +
        `\`LD\` ${posMap.get('LD')} ┃ \`RD\` ${posMap.get('RD')} ┃ \`G\` ${posMap.get('G')}\n\n` +
        `*Pick another position below to continue filling the ${day} line:*`);
    const selectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('night-pos-select', week.id, day))
        .setPlaceholder(`Choose another position for all ${day} games...`)
        .addOptions(POSITIONS.map((p) => ({ label: `Set ${p}`, value: p }))));
    const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(customId('lineup-action', week.id, 'night-prompt'))
        .setLabel('Switch Night')
        .setStyle(ButtonStyle.Secondary));
    await interaction.update({
        content: `✅ Updated **${day} ${position}**!`,
        embeds: [embed],
        components: [selectRow, actionRow],
    });
}
//# sourceMappingURL=schedule.js.map