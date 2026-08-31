import { AppError } from '../utils/errors.js';
import { getOrCreatePlayer } from './player.service.js';
export class AvailabilityService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async set(guildId, discordUserId, sessionIds, discordDisplayName, discordAvatarUrl) {
        const player = await getOrCreatePlayer(this.prisma, guildId, {
            discordUserId,
            discordDisplayName,
            discordAvatarUrl,
        });
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