import { AppError } from '../utils/errors.js';
import { getOrCreatePlayer } from './player.service.js';
export class WeeklyAvailabilityService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    getWeek(weekId) {
        return this.prisma.seasonWeek.findUnique({
            where: { id: weekId },
            include: {
                guildConfig: true,
                season: true,
                games: {
                    orderBy: [{ scheduledAtUtc: 'asc' }, { sortOrder: 'asc' }],
                    include: {
                        responses: { include: { submission: { include: { player: true } } } },
                        lineup: { include: { player: true } },
                    },
                },
                submissions: {
                    include: { player: true, responses: { include: { game: true } } },
                    orderBy: { updatedAt: 'asc' },
                },
            },
        });
    }
    async current(guildId, now = new Date()) {
        const next = await this.prisma.weeklyGame.findFirst({
            where: {
                week: { guildConfig: { guildId } },
                status: { in: ['SCHEDULED', 'POSTPONED'] },
                scheduledAtUtc: { gte: new Date(now.getTime() - 3 * 60 * 60_000) },
            },
            orderBy: { scheduledAtUtc: 'asc' },
        });
        if (next)
            return this.getWeek(next.weekId);
        return this.prisma.seasonWeek.findFirst({
            where: { guildConfig: { guildId } },
            include: {
                guildConfig: true,
                season: true,
                games: {
                    orderBy: [{ scheduledAtUtc: 'asc' }, { sortOrder: 'asc' }],
                    include: {
                        responses: { include: { submission: { include: { player: true } } } },
                        lineup: { include: { player: true } },
                    },
                },
                submissions: { include: { player: true, responses: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async setState(weekId, status, actorDiscordId) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.seasonWeek.findUnique({ where: { id: weekId } });
            if (!existing)
                throw new AppError('NOT_FOUND', 'Availability week not found.');
            const week = await tx.seasonWeek.update({
                where: { id: weekId },
                data: {
                    status,
                    ...(status === 'OPEN' ? { openedAt: new Date(), lockedAt: null } : {}),
                    ...(status === 'LOCKED' ? { lockedAt: new Date() } : {}),
                },
                include: {
                    games: { orderBy: { scheduledAtUtc: 'asc' } },
                    guildConfig: true,
                    season: true,
                },
            });
            const action = status === 'LOCKED'
                ? 'AVAILABILITY_LOCKED'
                : status === 'OPEN' && existing.status === 'LOCKED'
                    ? 'AVAILABILITY_REOPENED'
                    : status === 'OPEN'
                        ? 'AVAILABILITY_OPENED'
                        : 'AVAILABILITY_STATE_CHANGED';
            await tx.auditLog.create({
                data: {
                    guildConfigId: week.guildConfigId,
                    actorDiscordId,
                    action,
                    targetType: 'SeasonWeek',
                    targetId: week.id,
                    details: { previous: existing.status, next: status },
                },
            });
            return week;
        });
    }
    async saveMessage(weekId, channelId, messageId) {
        return this.prisma.seasonWeek.update({ where: { id: weekId }, data: { channelId, messageId } });
    }
    async submit(input) {
        const [week, player] = await Promise.all([
            this.getWeek(input.weekId),
            getOrCreatePlayer(this.prisma, input.guildId, {
                discordUserId: input.discordUserId,
            }),
        ]);
        if (!week || !player)
            throw new AppError('NOT_FOUND', 'Week or player not found.');
        if (week.guildConfigId !== player.guildConfigId)
            throw new AppError('NOT_ALLOWED', 'That availability week belongs to another server.');
        if (!input.managementOverride && player.teamStatus !== 'ROSTER' && player.teamStatus !== 'TC')
            throw new AppError('NOT_ALLOWED', 'Weekly team availability is available to roster and TC players.');
        if (week.status !== 'OPEN' && !input.managementOverride)
            throw new AppError('INVALID_STATE', 'Availability is currently locked.');
        const activeGames = week.games.filter((game) => game.status !== 'CANCELLED');
        const validGameIds = new Set(activeGames.map((game) => game.id));
        const selected = new Set(input.gameIds);
        if ([...selected].some((gameId) => !validGameIds.has(gameId)))
            throw new AppError('INVALID_INPUT', 'One or more selected games are not active this week.');
        const previous = week.submissions.find((submission) => submission.playerId === player.id);
        const submission = await this.prisma.$transaction(async (tx) => {
            const saved = await tx.weeklyAvailabilitySubmission.upsert({
                where: { weekId_playerId: { weekId: week.id, playerId: player.id } },
                update: { editedByDiscordId: input.actorDiscordId ?? null, submittedAt: new Date() },
                create: {
                    weekId: week.id,
                    playerId: player.id,
                    editedByDiscordId: input.actorDiscordId ?? null,
                },
            });
            for (const game of activeGames) {
                await tx.playerGameAvailability.upsert({
                    where: { submissionId_gameId: { submissionId: saved.id, gameId: game.id } },
                    update: {
                        status: selected.has(game.id) ? 'AVAILABLE' : 'UNAVAILABLE',
                        updatedByDiscordId: input.actorDiscordId ?? input.discordUserId,
                    },
                    create: {
                        submissionId: saved.id,
                        gameId: game.id,
                        status: selected.has(game.id) ? 'AVAILABLE' : 'UNAVAILABLE',
                        updatedByDiscordId: input.actorDiscordId ?? input.discordUserId,
                    },
                });
            }
            const occurredAt = new Date();
            await tx.player.update({
                where: { id: player.id },
                data: { lastRelevantActivityAt: occurredAt },
            });
            await tx.playerActivity.create({
                data: {
                    playerId: player.id,
                    kind: input.managementOverride
                        ? 'AVAILABILITY_MANAGEMENT_EDIT'
                        : 'AVAILABILITY_SUBMITTED',
                    relatedType: 'SeasonWeek',
                    relatedId: week.id,
                    details: { availableGameIds: [...selected] },
                    occurredAt,
                },
            });
            if (input.managementOverride && input.actorDiscordId) {
                await tx.auditLog.create({
                    data: {
                        guildConfigId: week.guildConfigId,
                        actorDiscordId: input.actorDiscordId,
                        action: 'AVAILABILITY_MANUAL_EDIT',
                        targetType: 'WeeklyAvailabilitySubmission',
                        targetId: saved.id,
                        details: {
                            playerId: player.id,
                            previous: previous?.responses.map((response) => ({
                                gameId: response.gameId,
                                status: response.status,
                            })) ?? [],
                            next: activeGames.map((game) => ({
                                gameId: game.id,
                                status: selected.has(game.id) ? 'AVAILABLE' : 'UNAVAILABLE',
                            })),
                        },
                    },
                });
            }
            return saved;
        });
        return this.prisma.weeklyAvailabilitySubmission.findUnique({
            where: { id: submission.id },
            include: { player: true, responses: { include: { game: true } } },
        });
    }
    async missing(weekId, filter = {}) {
        const week = await this.getWeek(weekId);
        if (!week)
            throw new AppError('NOT_FOUND', 'Availability week not found.');
        const activeGameIds = week.games
            .filter((game) => game.status !== 'CANCELLED')
            .map((game) => game.id);
        const players = await this.prisma.player.findMany({
            where: {
                guildConfigId: week.guildConfigId,
                registered: true,
                teamStatus: filter.teamStatus ?? { in: ['ROSTER', 'TC'] },
                ...(filter.positionGroup ? { positionGroup: filter.positionGroup } : {}),
            },
            include: {
                weeklyAvailability: {
                    where: { weekId },
                    include: { responses: true },
                    take: 1,
                },
            },
            orderBy: [{ teamStatus: 'asc' }, { positionGroup: 'asc' }, { eaTag: 'asc' }],
        });
        return players.filter((player) => {
            const answered = new Set(player.weeklyAvailability[0]?.responses.map((response) => response.gameId) ?? []);
            return activeGameIds.some((gameId) => !answered.has(gameId));
        });
    }
    async summary(weekId, filter = {}) {
        const week = await this.getWeek(weekId);
        if (!week)
            throw new AppError('NOT_FOUND', 'Availability week not found.');
        const submissions = week.submissions.filter(({ player }) => (!filter.teamStatus || player.teamStatus === filter.teamStatus) &&
            (!filter.positionGroup || player.positionGroup === filter.positionGroup));
        return { week, submissions, missing: await this.missing(weekId, filter) };
    }
}
//# sourceMappingURL=weekly-availability.service.js.map