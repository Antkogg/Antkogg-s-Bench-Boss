import { AppError } from '../utils/errors.js';
export class TeamService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async setTeamStatus(playerId, status, actorDiscordId) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.player.findUnique({ where: { id: playerId } });
            if (!existing)
                throw new AppError('NOT_FOUND', 'Player not found.');
            const player = await tx.player.update({
                where: { id: playerId },
                data: { teamStatus: status },
            });
            await tx.playerActivity.create({
                data: {
                    playerId,
                    kind: 'TEAM_STATUS_CHANGED',
                    details: { from: existing.teamStatus, to: status },
                },
            });
            await tx.auditLog.create({
                data: {
                    guildConfigId: player.guildConfigId,
                    actorDiscordId,
                    action: 'TEAM_STATUS_CHANGED',
                    targetType: 'Player',
                    targetId: playerId,
                    details: { from: existing.teamStatus, to: status },
                },
            });
            return player;
        });
    }
    async setTcStatus(playerId, status, actorDiscordId) {
        return this.prisma.$transaction(async (tx) => {
            const player = await tx.player.findUnique({ where: { id: playerId } });
            if (!player)
                throw new AppError('NOT_FOUND', 'Player not found.');
            const updated = await tx.player.update({
                where: { id: playerId },
                data: { tcStatus: status },
            });
            await tx.playerActivity.create({
                data: {
                    playerId,
                    kind: 'TC_STATUS_CHANGED',
                    details: { from: player.tcStatus, to: status },
                },
            });
            await tx.auditLog.create({
                data: {
                    guildConfigId: player.guildConfigId,
                    actorDiscordId,
                    action: 'TC_STATUS_CHANGED',
                    targetType: 'Player',
                    targetId: playerId,
                    details: { from: player.tcStatus, to: status },
                },
            });
            return updated;
        });
    }
    tcBoard(guildId) {
        return this.prisma.player.findMany({
            where: { guildConfig: { guildId }, teamStatus: 'TC', registered: true },
            include: {
                attendance: true,
                evaluations: { orderBy: { createdAt: 'desc' }, take: 1 },
                notes: { orderBy: { createdAt: 'desc' }, take: 1 },
                weeklyAvailability: { orderBy: { submittedAt: 'desc' }, take: 4 },
            },
            orderBy: [{ tcStatus: 'asc' }, { lastRelevantActivityAt: 'desc' }],
            take: 25,
        });
    }
    async dashboard(guildId) {
        const currentWeek = await this.prisma.seasonWeek.findFirst({
            where: { guildConfig: { guildId }, status: { in: ['OPEN', 'LOCKED'] } },
            include: {
                submissions: { where: { player: { teamStatus: { in: ['ROSTER', 'TC'] } } } },
            },
            orderBy: { deadline: 'asc' },
        });
        const [roster, tcs, callUpReady, watch, developing] = await Promise.all([
            this.prisma.player.count({
                where: { guildConfig: { guildId }, teamStatus: 'ROSTER', registered: true },
            }),
            this.prisma.player.count({
                where: { guildConfig: { guildId }, teamStatus: 'TC', registered: true },
            }),
            this.prisma.player.count({
                where: {
                    guildConfig: { guildId },
                    teamStatus: 'TC',
                    tcStatus: 'CALL_UP_READY',
                    registered: true,
                },
            }),
            this.prisma.player.count({
                where: {
                    guildConfig: { guildId },
                    teamStatus: 'TC',
                    tcStatus: 'WATCH',
                    registered: true,
                },
            }),
            this.prisma.player.count({
                where: {
                    guildConfig: { guildId },
                    teamStatus: 'TC',
                    tcStatus: 'DEVELOPING',
                    registered: true,
                },
            }),
        ]);
        return { currentWeek, roster, tcs, callUpReady, watch, developing };
    }
}
//# sourceMappingURL=team.service.js.map