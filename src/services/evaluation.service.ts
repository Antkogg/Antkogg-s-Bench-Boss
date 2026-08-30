import type { InternalPlayerStatus, PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export interface EvaluationInput {
  playerId: string;
  evaluatorDiscordId: string;
  overall: number;
  offense: number;
  defense: number;
  hockeyIq: number;
  puckMovement: number;
  communication: number;
  privateNote?: string;
}

export class EvaluationService {
  constructor(private readonly prisma: PrismaClient) {}

  async evaluate(input: EvaluationInput) {
    for (const value of [
      input.overall,
      input.offense,
      input.defense,
      input.hockeyIq,
      input.puckMovement,
      input.communication,
    ]) {
      if (!Number.isInteger(value) || value < 1 || value > 5)
        throw new AppError('INVALID_INPUT', 'Evaluation ratings must be from 1 to 5.');
    }
    return this.prisma.evaluation.create({ data: input });
  }

  addNote(playerId: string, authorDiscordId: string, body: string) {
    if (!body.trim()) throw new AppError('INVALID_INPUT', 'A note cannot be empty.');
    return this.prisma.playerNote.create({
      data: { playerId, authorDiscordId, body: body.trim().slice(0, 2000) },
    });
  }

  async playerView(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        evaluations: { orderBy: { createdAt: 'desc' }, take: 10 },
        notes: { orderBy: { createdAt: 'desc' }, take: 10 },
        attendance: true,
        assignments: { include: { session: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        weeklyAvailability: {
          include: { week: true, responses: { include: { game: true } } },
          orderBy: { submittedAt: 'desc' },
          take: 10,
        },
        activities: { orderBy: { occurredAt: 'desc' }, take: 20 },
      },
    });
    if (!player) throw new AppError('NOT_FOUND', 'Player not found.');
    return player;
  }

  setStatus(playerId: string, status: InternalPlayerStatus) {
    return this.prisma.player.update({ where: { id: playerId }, data: { internalStatus: status } });
  }
}
