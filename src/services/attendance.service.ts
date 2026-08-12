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
    return this.prisma.attendance.upsert({
      where: { sessionId_playerId: { sessionId, playerId } },
      update: { status, recordedBy: actorDiscordId },
      create: { sessionId, playerId, status, recordedBy: actorDiscordId },
    });
  }
}
