export class BoardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async summary(guildId) {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
        const [sessions, playerCount, evaluatedPlayers, shortlisted] = await Promise.all([
            this.prisma.scoutingSession.findMany({
                where: {
                    guildConfig: { guildId },
                    startsAt: { gte: now, lte: tomorrow },
                    status: { in: ['OPEN', 'LOCKED', 'IN_PROGRESS'] },
                },
                include: { assignments: true },
                orderBy: { startsAt: 'asc' },
            }),
            this.prisma.player.count({ where: { guildConfig: { guildId }, registered: true } }),
            this.prisma.player.count({ where: { guildConfig: { guildId }, evaluations: { some: {} } } }),
            this.prisma.player.count({
                where: { guildConfig: { guildId }, internalStatus: { in: ['SHORTLIST', 'PRIORITY'] } },
            }),
        ]);
        return { sessions, playerCount, evaluatedPlayers, shortlisted };
    }
}
//# sourceMappingURL=board.service.js.map