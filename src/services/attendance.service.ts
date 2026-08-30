import type { AttendanceStatus, PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export class AttendanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(
    sessionId: string,
    playerId: string,
    status: AttendanceStatus,
    actorDiscordId: string,
  ) {
    const assignment = await this.prisma.scoutingAssignment.findUnique({
      where: { sessionId_playerId: { sessionId, playerId } },
      include: { session: true },
    });
    if (!assignment) throw new AppError('NOT_FOUND', 'That player was not in this lineup.');
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.upsert({
        where: { sessionId_playerId: { sessionId, playerId } },
        update: { status, recordedBy: actorDiscordId },
        create: { sessionId, playerId, status, recordedBy: actorDiscordId },
      });
      await tx.player.update({
        where: { id: playerId },
        data: { lastRelevantActivityAt: new Date() },
      });
      await tx.playerActivity.create({
        data: {
          playerId,
          kind: status === 'NO_SHOW' ? 'NO_SHOW_RECORDED' : 'SCOUTING_ATTENDANCE_RECORDED',
          relatedType: 'ScoutingSession',
          relatedId: sessionId,
          details: { status },
        },
      });
      return attendance;
    });
  }
}
