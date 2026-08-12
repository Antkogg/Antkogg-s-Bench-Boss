import { AppError } from '../utils/errors.js';
export class AvailabilityService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async set(guildId, discordUserId, sessionIds) {
        const player = await this.prisma.player.findFirst({
            where: { guildConfig: { guildId }, discordUserId, registered: true },
        });
        if (!player)
            throw new AppError('NOT_REGISTERED', 'Register before sharing availability.');
        const validSessions = await this.prisma.scoutingSession.findMany({
            where: {
                id: { in: [...sessionIds] },
                guildConfigId: player.guildConfigId,
                signupMode: 'AVAILABILITY',
                status: 'OPEN',
            },
            select: { id: true },
        });
        if (validSessions.length !== new Set(sessionIds).size)
            throw new AppError('INVALID_INPUT', 'One or more selected times are no longer available.');
        await this.prisma.$transaction([
            this.prisma.availability.deleteMany({
                where: { playerId: player.id, session: { startsAt: { gte: new Date() } } },
            }),
            ...validSessions.map((session) => this.prisma.availability.create({ data: { playerId: player.id, sessionId: session.id } })),
        ]);
    }
}
//# sourceMappingURL=availability.service.js.map