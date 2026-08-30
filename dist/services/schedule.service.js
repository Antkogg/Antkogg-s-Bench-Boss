import { DateTime } from 'luxon';
import { localScheduleToUtc, localWeekday, nextSundayDate, normalizeLocalTime, offsetDate, validateIanaTimezone, } from '../domain/schedule-time.js';
import { isEligible } from '../domain/positions.js';
import { AppError } from '../utils/errors.js';
import { cleanDisplayValue, normalizeIdentity } from '../utils/normalize.js';
const DAY_OFFSETS = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
};
export class ScheduleService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async setManagementTimezone(guildId, discordUserId, timezone, actorDiscordId) {
        validateIanaTimezone(timezone);
        const config = await this.ensureConfig(guildId);
        return this.prisma.$transaction(async (tx) => {
            const profile = await tx.managementProfile.upsert({
                where: {
                    guildConfigId_discordUserId: { guildConfigId: config.id, discordUserId },
                },
                update: { timezone },
                create: { guildConfigId: config.id, discordUserId, timezone },
            });
            await this.audit(tx, config.id, actorDiscordId, 'MANAGEMENT_TIMEZONE_SET', 'ManagementProfile', profile.id, {
                timezone,
            });
            return profile;
        });
    }
    async managementTimezone(guildId, discordUserId) {
        const profile = await this.prisma.managementProfile.findFirst({
            where: { guildConfig: { guildId }, discordUserId },
        });
        if (!profile)
            throw new AppError('NOT_CONFIGURED', 'Set your management timezone once with `/timezone set` before entering schedules.');
        return profile.timezone;
    }
    async configureSlots(guildId, actorDiscordId, times, deadline) {
        const config = await this.ensureConfig(guildId);
        const normalized = Object.entries(times).flatMap(([day, values]) => values.map((value, index) => ({
            day: day,
            slotNumber: index + 1,
            localTime: normalizeLocalTime(value),
        })));
        if (!normalized.length)
            throw new AppError('INVALID_INPUT', 'Configure at least one game slot.');
        const deadlineTime = normalizeLocalTime(deadline.localTime);
        return this.prisma.$transaction(async (tx) => {
            await tx.standardGameSlot.updateMany({
                where: { guildConfigId: config.id },
                data: { active: false },
            });
            for (const slot of normalized) {
                await tx.standardGameSlot.upsert({
                    where: {
                        guildConfigId_day_slotNumber: {
                            guildConfigId: config.id,
                            day: slot.day,
                            slotNumber: slot.slotNumber,
                        },
                    },
                    update: { localTime: slot.localTime, active: true },
                    create: { guildConfigId: config.id, ...slot },
                });
            }
            await tx.guildConfig.update({
                where: { id: config.id },
                data: {
                    availabilityDeadlineDayOffset: deadline.dayOffset,
                    availabilityDeadlineLocalTime: deadlineTime,
                },
            });
            await this.audit(tx, config.id, actorDiscordId, 'STANDARD_GAME_SLOTS_CONFIGURED', 'GuildConfig', config.id, {
                slots: normalized,
                deadlineDayOffset: deadline.dayOffset,
                deadlineLocalTime: deadlineTime,
            });
            return normalized;
        });
    }
    async createWeek(input) {
        if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1)
            throw new AppError('INVALID_INPUT', 'Season number must be a positive whole number.');
        if (!Number.isInteger(input.weekNumber) || input.weekNumber < 1)
            throw new AppError('INVALID_INPUT', 'Week number must be a positive whole number.');
        const [config, timezone] = await Promise.all([
            this.ensureConfig(input.guildId),
            this.managementTimezone(input.guildId, input.actorDiscordId),
        ]);
        const sundayDate = input.sundayDate ?? nextSundayDate(timezone);
        if (DateTime.fromISO(sundayDate, { zone: timezone }).weekday !== 7)
            throw new AppError('INVALID_INPUT', 'The week start date must be a Sunday.');
        const slots = await this.prisma.standardGameSlot.findMany({
            where: {
                guildConfigId: config.id,
                active: true,
                day: { in: ['SUNDAY', 'MONDAY', 'TUESDAY'] },
            },
            orderBy: [{ day: 'asc' }, { slotNumber: 'asc' }],
        });
        if (!slots.length)
            throw new AppError('NOT_CONFIGURED', 'Configure the normal Sunday, Monday, and Tuesday times with `/setup schedule` first.');
        const existing = await this.prisma.seasonWeek.findFirst({
            where: {
                guildConfigId: config.id,
                season: { number: input.seasonNumber },
                weekNumber: input.weekNumber,
            },
        });
        if (existing)
            return this.getWeek(existing.id);
        const deadlineDate = offsetDate(sundayDate, config.availabilityDeadlineDayOffset, timezone);
        const deadline = localScheduleToUtc(deadlineDate, config.availabilityDeadlineLocalTime, timezone);
        return this.prisma.$transaction(async (tx) => {
            const season = await tx.season.upsert({
                where: {
                    guildConfigId_number: { guildConfigId: config.id, number: input.seasonNumber },
                },
                update: { label: `S${input.seasonNumber}`, status: 'ACTIVE' },
                create: {
                    guildConfigId: config.id,
                    number: input.seasonNumber,
                    label: `S${input.seasonNumber}`,
                    createdByDiscordId: input.actorDiscordId,
                },
            });
            const week = await tx.seasonWeek.create({
                data: {
                    guildConfigId: config.id,
                    seasonId: season.id,
                    weekNumber: input.weekNumber,
                    label: `Week ${input.weekNumber}`,
                    startsOn: localScheduleToUtc(sundayDate, '12:00 AM', timezone),
                    deadline,
                    createdByDiscordId: input.actorDiscordId,
                    games: {
                        create: slots.map((slot, index) => {
                            const date = offsetDate(sundayDate, DAY_OFFSETS[slot.day], timezone);
                            return {
                                label: `${slot.day[0]}${slot.day.slice(1).toLowerCase()} Game ${slot.slotNumber}`,
                                scheduledAtUtc: localScheduleToUtc(date, slot.localTime, timezone),
                                localEntryTimezone: timezone,
                                sortOrder: index,
                                createdByDiscordId: input.actorDiscordId,
                            };
                        }),
                    },
                },
            });
            await this.audit(tx, config.id, input.actorDiscordId, 'WEEK_SCHEDULE_CREATED', 'SeasonWeek', week.id, {
                seasonNumber: input.seasonNumber,
                weekNumber: input.weekNumber,
                sundayDate,
                timezone,
                gameCount: slots.length,
            });
            return tx.seasonWeek.findUniqueOrThrow({
                where: { id: week.id },
                include: this.weekInclude(),
            });
        });
    }
    async createNextWeek(guildId, actorDiscordId) {
        const timezone = await this.managementTimezone(guildId, actorDiscordId);
        const latest = await this.prisma.seasonWeek.findFirst({
            where: { guildConfig: { guildId }, seasonId: { not: null }, weekNumber: { not: null } },
            include: { season: true },
            orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        });
        if (!latest?.season || latest.weekNumber === null)
            throw new AppError('NOT_FOUND', 'Create the first week with `/week setup`.');
        const sundayDate = latest.startsOn
            ? DateTime.fromJSDate(latest.startsOn).setZone(timezone).plus({ days: 7 }).toISODate()
            : nextSundayDate(timezone);
        return this.createWeek({
            guildId,
            seasonNumber: latest.season.number,
            weekNumber: latest.weekNumber + 1,
            sundayDate,
            actorDiscordId,
        });
    }
    getWeek(weekId) {
        return this.prisma.seasonWeek.findUnique({
            where: { id: weekId },
            include: this.weekInclude(),
        });
    }
    async currentWeek(guildId, now = new Date()) {
        const nextGame = await this.prisma.weeklyGame.findFirst({
            where: {
                week: { guildConfig: { guildId } },
                status: { in: ['SCHEDULED', 'POSTPONED'] },
                scheduledAtUtc: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
            },
            orderBy: { scheduledAtUtc: 'asc' },
        });
        if (nextGame)
            return this.getWeek(nextGame.weekId);
        const latest = await this.prisma.seasonWeek.findFirst({
            where: { guildConfig: { guildId } },
            orderBy: { createdAt: 'desc' },
        });
        return latest ? this.getWeek(latest.id) : null;
    }
    async updateDay(guildId, weekId, day, entries, actorDiscordId) {
        const timezone = await this.managementTimezone(guildId, actorDiscordId);
        const week = await this.getWeek(weekId);
        if (!week || week.guildConfig.guildId !== guildId)
            throw new AppError('NOT_FOUND', 'That week does not belong to this server.');
        const games = week.games.filter((game) => localWeekday(game.scheduledAtUtc, timezone) === day);
        if (entries.length !== games.length)
            throw new AppError('INVALID_INPUT', `Enter exactly ${games.length} ${day.toLowerCase()} game lines.`);
        return this.prisma.$transaction(async (tx) => {
            for (const [index, game] of games.entries()) {
                const entry = entries[index];
                const opponent = entry.opponent
                    ? await this.resolveOpponent(tx, week.guildConfigId, week.seasonId, entry.opponent)
                    : null;
                const localDate = DateTime.fromJSDate(game.scheduledAtUtc).setZone(timezone).toISODate();
                const scheduledAtUtc = entry.time
                    ? localScheduleToUtc(localDate, entry.time, timezone)
                    : game.scheduledAtUtc;
                const previous = {
                    opponent: game.opponentNameSnapshot,
                    homeAway: game.homeAway,
                    scheduledAtUtc: game.scheduledAtUtc.toISOString(),
                };
                const updated = await tx.weeklyGame.update({
                    where: { id: game.id },
                    data: {
                        opponentId: opponent?.id ?? null,
                        opponentNameSnapshot: opponent?.name ?? null,
                        homeAway: entry.homeAway,
                        scheduledAtUtc,
                        localEntryTimezone: timezone,
                    },
                });
                await this.audit(tx, week.guildConfigId, actorDiscordId, 'WEEKLY_GAME_EDITED', 'WeeklyGame', game.id, {
                    previous,
                    next: {
                        opponent: updated.opponentNameSnapshot,
                        homeAway: updated.homeAway,
                        scheduledAtUtc: updated.scheduledAtUtc.toISOString(),
                    },
                });
            }
            return tx.seasonWeek.findUniqueOrThrow({
                where: { id: weekId },
                include: this.weekInclude(),
            });
        });
    }
    async setGameStatus(guildId, gameId, status, actorDiscordId) {
        const game = await this.requireGuildGame(guildId, gameId);
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.weeklyGame.update({ where: { id: gameId }, data: { status } });
            await this.audit(tx, game.week.guildConfigId, actorDiscordId, 'GAME_STATUS_CHANGED', 'WeeklyGame', gameId, {
                previous: game.status,
                next: status,
            });
            return updated;
        });
    }
    async game(gameId) {
        const game = await this.prisma.weeklyGame.findUnique({
            where: { id: gameId },
            include: {
                week: { include: { guildConfig: true, season: true } },
                responses: { include: { submission: { include: { player: true } } } },
                lineup: { include: { player: true }, orderBy: { position: 'asc' } },
            },
        });
        if (!game)
            return null;
        const eligiblePlayers = await this.prisma.player.findMany({
            where: {
                guildConfigId: game.week.guildConfigId,
                registered: true,
                teamStatus: { in: ['ROSTER', 'TC'] },
            },
            orderBy: [{ teamStatus: 'asc' }, { positionGroup: 'asc' }, { eaTag: 'asc' }],
        });
        return { ...game, eligiblePlayers };
    }
    async lineupCandidates(guildId, gameId, position) {
        const game = await this.requireGuildGame(guildId, gameId);
        const players = await this.prisma.player.findMany({
            where: {
                guildConfigId: game.week.guildConfigId,
                registered: true,
                teamStatus: { in: ['ROSTER', 'TC'] },
            },
            include: {
                weeklyAvailability: {
                    where: { weekId: game.weekId },
                    include: { responses: { where: { gameId } } },
                    take: 1,
                },
            },
            orderBy: [{ teamStatus: 'asc' }, { eaTag: 'asc' }],
        });
        return players
            .filter((player) => isEligible(player.positionGroup, position))
            .map((player) => ({
            player,
            availability: player.weeklyAvailability[0]?.responses[0]?.status ?? 'NO_RESPONSE',
        }))
            .sort((left, right) => left.availability === right.availability
            ? left.player.eaTag.localeCompare(right.player.eaTag)
            : left.availability === 'AVAILABLE'
                ? -1
                : right.availability === 'AVAILABLE'
                    ? 1
                    : 0);
    }
    async assignLineupPosition(input) {
        const game = await this.requireGuildGame(input.guildId, input.gameId);
        const player = await this.prisma.player.findFirst({
            where: {
                id: input.playerId,
                guildConfigId: game.week.guildConfigId,
                registered: true,
                teamStatus: { in: ['ROSTER', 'TC'] },
            },
            include: {
                weeklyAvailability: {
                    where: { weekId: game.weekId },
                    include: { responses: { where: { gameId: input.gameId } } },
                    take: 1,
                },
            },
        });
        if (!player)
            throw new AppError('NOT_FOUND', 'That roster/TC player was not found.');
        if (!isEligible(player.positionGroup, input.position))
            throw new AppError('INELIGIBLE_POSITION', `${player.eaTag} is not eligible for ${input.position}.`);
        const availability = player.weeklyAvailability[0]?.responses[0]?.status ?? 'NO_RESPONSE';
        const availabilityOverride = availability !== 'AVAILABLE';
        return this.prisma.$transaction(async (tx) => {
            const occupied = await tx.gameLineupAssignment.findUnique({
                where: { gameId_position: { gameId: input.gameId, position: input.position } },
                include: { player: true },
            });
            if (occupied && occupied.playerId !== player.id)
                await tx.gameLineupAssignment.delete({ where: { id: occupied.id } });
            const existingPlayer = await tx.gameLineupAssignment.findUnique({
                where: { gameId_playerId: { gameId: input.gameId, playerId: player.id } },
            });
            const movedConfirmed = existingPlayer?.confirmed && existingPlayer.position !== input.position
                ? { player, position: existingPlayer.position }
                : null;
            const assignment = existingPlayer
                ? await tx.gameLineupAssignment.update({
                    where: { id: existingPlayer.id },
                    data: {
                        position: input.position,
                        availabilityOverride,
                        assignedByDiscordId: input.actorDiscordId,
                        confirmed: false,
                        confirmedAt: null,
                        confirmationNotifiedAt: null,
                        gameInfoNotifiedAt: null,
                    },
                    include: { player: true },
                })
                : await tx.gameLineupAssignment.create({
                    data: {
                        gameId: input.gameId,
                        playerId: player.id,
                        position: input.position,
                        availabilityOverride,
                        assignedByDiscordId: input.actorDiscordId,
                    },
                    include: { player: true },
                });
            await this.audit(tx, game.week.guildConfigId, input.actorDiscordId, 'GAME_LINEUP_POSITION_SET', 'WeeklyGame', input.gameId, {
                position: input.position,
                playerId: player.id,
                availability,
                availabilityOverride,
                replacedPlayerId: occupied?.playerId ?? null,
            });
            return {
                assignment,
                removed: occupied && occupied.playerId !== player.id ? occupied : null,
                movedConfirmed,
                availability,
            };
        });
    }
    async clearLineupPosition(guildId, gameId, position, actorDiscordId) {
        const game = await this.requireGuildGame(guildId, gameId);
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.gameLineupAssignment.findUnique({
                where: { gameId_position: { gameId, position } },
                include: { player: true },
            });
            if (!existing)
                return null;
            await tx.gameLineupAssignment.delete({ where: { id: existing.id } });
            await this.audit(tx, game.week.guildConfigId, actorDiscordId, 'GAME_LINEUP_POSITION_CLEARED', 'WeeklyGame', gameId, {
                position,
                removedPlayerId: existing.playerId,
            });
            return existing;
        });
    }
    async confirmLineup(guildId, gameId, actorDiscordId) {
        const game = await this.requireGuildGame(guildId, gameId);
        return this.prisma.$transaction(async (tx) => {
            const assignments = await tx.gameLineupAssignment.findMany({
                where: { gameId },
                include: { player: true },
            });
            const required = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
            const missing = required.filter((position) => !assignments.some((assignment) => assignment.position === position));
            if (missing.length)
                throw new AppError('INVALID_STATE', `Fill ${missing.join(', ')} before confirming this lineup.`);
            const newlyConfirmed = assignments.filter((assignment) => !assignment.confirmed);
            const confirmedAt = new Date();
            await tx.gameLineupAssignment.updateMany({
                where: { gameId },
                data: { confirmed: true, confirmedAt },
            });
            await this.audit(tx, game.week.guildConfigId, actorDiscordId, 'GAME_LINEUP_CONFIRMED', 'WeeklyGame', gameId, {
                assignments: assignments.map((assignment) => ({
                    playerId: assignment.playerId,
                    position: assignment.position,
                    availabilityOverride: assignment.availabilityOverride,
                })),
            });
            return {
                game: await tx.weeklyGame.findUniqueOrThrow({ where: { id: gameId } }),
                newlyConfirmed,
            };
        });
    }
    async markConfirmationNotified(assignmentIds) {
        if (!assignmentIds.length)
            return;
        await this.prisma.gameLineupAssignment.updateMany({
            where: { id: { in: assignmentIds } },
            data: { confirmationNotifiedAt: new Date() },
        });
    }
    async markGameInfoNotified(assignmentIds) {
        if (!assignmentIds.length)
            return;
        await this.prisma.gameLineupAssignment.updateMany({
            where: { id: { in: assignmentIds } },
            data: { gameInfoNotifiedAt: new Date() },
        });
    }
    async setServerCode(input) {
        const game = await this.requireGuildGame(input.guildId, input.gameId);
        const server = cleanDisplayValue(input.server, 80);
        const code = cleanDisplayValue(input.code, 80);
        if (!server || !code)
            throw new AppError('INVALID_INPUT', 'Server and game code are required.');
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.weeklyGame.update({
                where: { id: input.gameId },
                data: {
                    gameServer: server,
                    gameCode: code,
                    serverCodeUpdatedAt: new Date(),
                    serverCodeUpdatedBy: input.actorDiscordId,
                },
                include: { lineup: { where: { confirmed: true }, include: { player: true } }, week: true },
            });
            await tx.gameLineupAssignment.updateMany({
                where: { gameId: input.gameId, confirmed: true },
                data: { gameInfoNotifiedAt: null },
            });
            await this.audit(tx, game.week.guildConfigId, input.actorDiscordId, 'GAME_SERVER_CODE_CHANGED', 'WeeklyGame', input.gameId, {
                previous: { server: game.gameServer, code: game.gameCode },
                next: { server, code },
            });
            return updated;
        });
    }
    async nearestGame(guildId, playerId, now = new Date()) {
        return this.prisma.weeklyGame.findFirst({
            where: {
                week: { guildConfig: { guildId } },
                status: { in: ['SCHEDULED', 'POSTPONED'] },
                scheduledAtUtc: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
                ...(playerId ? { lineup: { some: { playerId, confirmed: true } } } : {}),
            },
            include: {
                week: { include: { guildConfig: true, season: true } },
                lineup: {
                    where: { confirmed: true },
                    include: { player: true },
                    orderBy: { position: 'asc' },
                },
            },
            orderBy: { scheduledAtUtc: 'asc' },
        });
    }
    weekInclude() {
        return {
            guildConfig: true,
            season: true,
            games: {
                orderBy: [{ scheduledAtUtc: 'asc' }, { sortOrder: 'asc' }],
                include: {
                    opponent: true,
                    responses: { include: { submission: { include: { player: true } } } },
                    lineup: { include: { player: true } },
                },
            },
            submissions: {
                include: { player: true, responses: { include: { game: true } } },
                orderBy: { updatedAt: 'asc' },
            },
        };
    }
    ensureConfig(guildId) {
        return this.prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
    }
    async requireGuildGame(guildId, gameId) {
        const game = await this.prisma.weeklyGame.findFirst({
            where: { id: gameId, week: { guildConfig: { guildId } } },
            include: { week: true },
        });
        if (!game)
            throw new AppError('NOT_FOUND', 'That game does not belong to this server.');
        return game;
    }
    async resolveOpponent(tx, guildConfigId, seasonId, raw) {
        const value = cleanDisplayValue(raw, 100);
        if (!value)
            return null;
        const normalized = normalizeIdentity(value);
        const existing = await tx.opponent.findFirst({
            where: {
                guildConfigId,
                active: true,
                OR: [
                    { name: { equals: value, mode: 'insensitive' } },
                    { abbreviation: { equals: value, mode: 'insensitive' } },
                ],
            },
        });
        if (existing)
            return existing;
        return tx.opponent.create({
            data: {
                guildConfigId,
                seasonId,
                name: value,
                abbreviation: normalized.length <= 8 ? value.toUpperCase() : null,
            },
        });
    }
    audit(tx, guildConfigId, actorDiscordId, action, targetType, targetId, details) {
        return tx.auditLog.create({
            data: { guildConfigId, actorDiscordId, action, targetType, targetId, details },
        });
    }
}
//# sourceMappingURL=schedule.service.js.map