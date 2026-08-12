import { AppError } from '../utils/errors.js';
export class AttendanceService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async record(sessionId, playerId, status, actorDiscordId) {
        const assignment = await this.prisma.scoutingAssignment.findUnique({
            where: { sessionId_playerId: { sessionId, playerId } },
            include: { session: true },
        });
        if (!assignment)
            throw new AppError('NOT_FOUND', 'That player was not in this lineup.');
        return this.prisma.attendance.upsert({
            where: { sessionId_playerId: { sessionId, playerId } },
            update: { status, recordedBy: actorDiscordId },
            create: { sessionId, playerId, status, recordedBy: actorDiscordId },
        });
    }
}
//# sourceMappingURL=attendance.service.js.map