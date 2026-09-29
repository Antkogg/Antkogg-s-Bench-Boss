import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, } from 'discord.js';
import { DEFAULT_TEAM_ROLE_ID } from '../config/constants.js';
import { DateTime } from 'luxon';
import { localWeekday } from '../domain/schedule-time.js';
import { publishAvailability } from '../commands/availability.js';
import { requireManagement } from '../commands/authorization.js';
import { renderGame, renderIndividualGamePost, renderManagementWeek } from '../renderers/schedule.renderer.js';
import { parseScheduleLine, syncAvailabilityPost, syncSingleGamePost } from '../commands/schedule.js';
import { renderSuccess } from '../renderers/design.js';
import { renderWeeklyAvailability } from '../renderers/weekly-availability.renderer.js';
import { customId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
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
export async function handleLineupButton(interaction, context, parsed) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    if (parsed.value === 'confirm') {
        const result = await context.schedule.confirmLineup(interaction.guildId, parsed.entityId, interaction.user.id);
        const game = await context.schedule.game(parsed.entityId);
        if (!game)
            throw new AppError('NOT_FOUND', 'Game not found.');
        const delivered = [];
        for (const assignment of result.newlyConfirmed) {
            const sent = await context.notifications.lineupConfirmed(assignment.player.discordUserId, game, assignment.position);
            if (sent)
                delivered.push(assignment.id);
        }
        await context.schedule.markConfirmationNotified(delivered);
        const week = await context.schedule.getWeek(game.weekId);
        if (week && week.messageId) {
            await syncAvailabilityPost(interaction.guildId, week, context, interaction.client);
        }
        await syncSingleGamePost(interaction.guildId, parsed.entityId, context, interaction.client);
        await interaction.update(renderGame(game, true));
        return;
    }
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId('lineup-position-select', parsed.entityId))
        .setPlaceholder('Choose a lineup position')
        .addOptions(POSITIONS.map((position) => ({ label: position, value: position }))));
    await interaction.reply({
        ephemeral: true,
        content: 'Choose the position to fill or edit.',
        components: [row],
    });
}
export async function handleLineupPositionSelect(interaction, context) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    await requireManagement(interaction, context);
    const position = interaction.values[0];
    const gameId = interaction.customId.split(':')[2];
    const candidates = await context.schedule.lineupCandidates(interaction.guildId, gameId, position);
    const rows = [];
    if (candidates.length > 0) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(customId('lineup-player-select', gameId, position))
            .setPlaceholder(`Select ${position} from registered players`)
            .addOptions({ label: `Clear ${position}`, value: 'CLEAR', description: 'Remove the current assignment' }, ...candidates.slice(0, 24).map(({ player, availability }) => ({
            label: player.eaTag.slice(0, 100),
            value: player.id,
            description: `${availability} • ${player.teamStatus}`.slice(0, 100),
        })));
        rows.push(new ActionRowBuilder().addComponents(menu));
    }
    const userMenu = new UserSelectMenuBuilder()
        .setCustomId(customId('lineup-user-select', gameId, position))
        .setPlaceholder(`Or pick team player for ${position} from Discord`)
        .setMinValues(1)
        .setMaxValues(1);
    rows.push(new ActionRowBuilder().addComponents(userMenu));
    await interaction.update({
        content: `Select **${position}**. Pick from registered players below, or select any team player directly from Discord:`,
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
        if (interaction.guild) {
            const config = await context.config.get(interaction.guildId);
            const configuredRoleId = config?.rosterRoleId ?? DEFAULT_TEAM_ROLE_ID;
            const s55Role = interaction.guild.roles.cache.find((r) => r.id === configuredRoleId ||
                r.name.toLowerCase().includes('s55 bu') ||
                r.name.toLowerCase().includes('roster'));
            const requiredRoleId = s55Role?.id ?? configuredRoleId;
            const playerToAssign = await context.prisma.player.findUnique({
                where: { id: interaction.values[0] },
            });
            if (playerToAssign) {
                try {
                    const member = await interaction.guild.members.fetch(playerToAssign.discordUserId);
                    const hasRole = member.roles.cache.has(requiredRoleId) ||
                        member.roles.cache.some((r) => r.name.toLowerCase().includes('s55 bu'));
                    if (!hasRole) {
                        throw new AppError('NOT_ALLOWED', `That player does not have the team role (S55 BU). Only players with this role can be selected.`);
                    }
                }
                catch (err) {
                    if (err instanceof AppError)
                        throw err;
                }
            }
        }
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
    const config = await context.config.get(interaction.guildId);
    const configuredRoleId = config?.rosterRoleId ?? DEFAULT_TEAM_ROLE_ID;
    const s55Role = interaction.guild.roles.cache.find((r) => r.id === configuredRoleId ||
        r.name.toLowerCase().includes('s55 bu') ||
        r.name.toLowerCase().includes('roster'));
    const hasRole = member.roles.cache.has(configuredRoleId) ||
        (s55Role && member.roles.cache.has(s55Role.id)) ||
        member.roles.cache.some((r) => r.name.toLowerCase().includes('s55 bu'));
    if (!hasRole) {
        throw new AppError('NOT_ALLOWED', `That user does not have the team role (S55 BU). Only players with the team role can be selected.`);
    }
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
    }
    await interaction.update({
        content: `Lineup updated: added <@${member.user.id}> at **${position}**.`,
        ...renderGame(game, true),
    });
}
export async function handleGameButton(interaction, context, parsed) {
    await requireManagement(interaction, context);
    if (parsed.value === 'delete') {
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
    const make = (id, label, value) => {
        const input = new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true);
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
    const configuredRoleId = config?.rosterRoleId ?? DEFAULT_TEAM_ROLE_ID;
    const s55Role = interaction.guild.roles.cache.find((r) => r.id === configuredRoleId ||
        r.name.toLowerCase().includes('s55 bu') ||
        r.name.toLowerCase().includes('roster'));
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = member.roles.cache.has(configuredRoleId) ||
        (s55Role && member.roles.cache.has(s55Role.id)) ||
        member.roles.cache.some((r) => r.name.toLowerCase().includes('s55 bu'));
    if (!hasRole) {
        throw new AppError('NOT_ALLOWED', 'Only players with the S55 BU team role can submit availability.');
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const player = await context.players.byDiscordId(interaction.guildId, member.user.id, member.displayName ?? member.user.username, member.user.displayAvatarURL());
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
}
export async function handleGameDayAvailButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild)
        throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
    const config = await context.config.get(interaction.guildId);
    const configuredRoleId = config?.rosterRoleId ?? DEFAULT_TEAM_ROLE_ID;
    const s55Role = interaction.guild.roles.cache.find((r) => r.id === configuredRoleId ||
        r.name.toLowerCase().includes('s55 bu') ||
        r.name.toLowerCase().includes('roster'));
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = member.roles.cache.has(configuredRoleId) ||
        (s55Role && member.roles.cache.has(s55Role.id)) ||
        member.roles.cache.some((r) => r.name.toLowerCase().includes('s55 bu'));
    if (!hasRole) {
        throw new AppError('NOT_ALLOWED', 'Only players with the S55 BU team role can submit availability.');
    }
    const game = await context.schedule.game(parsed.entityId);
    if (!game)
        throw new AppError('NOT_FOUND', 'Game not found.');
    const week = await context.schedule.getWeek(game.weekId);
    if (!week)
        throw new AppError('NOT_FOUND', 'Week not found.');
    const targetDay = DateTime.fromJSDate(game.scheduledAtUtc, { zone: 'America/Edmonton' }).toFormat('cccc');
    const matchingGames = week.games.filter((g) => {
        if (g.status === 'CANCELLED')
            return false;
        const gDay = DateTime.fromJSDate(g.scheduledAtUtc, { zone: 'America/Edmonton' }).toFormat('cccc');
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
    const player = await context.players.byDiscordId(interaction.guildId, member.user.id, member.displayName ?? member.user.username, member.user.displayAvatarURL());
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
//# sourceMappingURL=schedule.js.map