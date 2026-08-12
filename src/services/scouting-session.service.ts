import type {
  Prisma,
  PrismaClient,
  SessionFormat,
  SessionStatus,
  SignupMode,
} from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { sessionInclude, type ScoutingSessionView } from './scouting-view.js';

export interface CreateSessionInput {
  guildId: string;
  startsAt: Date;
  durationMinutes: number;
  format: SessionFormat;
  signupMode: SignupMode;
  note?: string;
  createdByDiscordId: string;
}

export class ScoutingSessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSessionInput): Promise<ScoutingSessionView> {
    const config = await this.prisma.guildConfig.findUnique({ where: { guildId: input.guildId } });
    if (!config)
      throw new AppError('NOT_CONFIGURED', 'Run `/setup` before creating scouting sessions.');
    const session = await this.prisma.scoutingSession.create({
      data: {
        guildConfigId: config.id,
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
        format: input.format,
        signupMode: input.signupMode,
        note: input.note ?? null,
        createdByDiscordId: input.createdByDiscordId,
      },
    });
    await this.audit(
      config.id,
      input.createdByDiscordId,
      'SCOUTING_CREATED',
      'ScoutingSession',
      session.id,
      { startsAt: input.startsAt.toISOString(), format: input.format },
    );
    return this.require(session.id);
  }

  get(sessionId: string): Promise<ScoutingSessionView | null> {
    return this.prisma.scoutingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
  }

  async require(sessionId: string): Promise<ScoutingSessionView> {
    const session = await this.get(sessionId);
    if (!session) throw new AppError('NOT_FOUND', 'Scouting session not found.');
    return session;
  }

  upcoming(guildId: string, limit = 10): Promise<ScoutingSessionView[]> {
    return this.prisma.scoutingSession.findMany({
      where: {
        guildConfig: { guildId },
        startsAt: { gte: new Date(Date.now() - 3_600_000) },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
      include: sessionInclude,
    });
  }

  async setStatus(
    sessionId: string,
    status: SessionStatus,
    actorDiscordId: string,
  ): Promise<ScoutingSessionView> {
    const current = await this.prisma.scoutingSession.findUnique({ where: { id: sessionId } });
    if (!current) throw new AppError('NOT_FOUND', 'Session not found.');
    await this.prisma.scoutingSession.update({
      where: { id: sessionId },
      data: { status, signupsOpen: status === 'OPEN' ? current.signupsOpen : false },
    });
    await this.audit(
      current.guildConfigId,
      actorDiscordId,
      `SCOUTING_${status}`,
      'ScoutingSession',
      sessionId,
    );
    return this.require(sessionId);
  }

  async setSignups(
    sessionId: string,
    open: boolean,
    actorDiscordId: string,
  ): Promise<ScoutingSessionView> {
    const session = await this.prisma.scoutingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('NOT_FOUND', 'Session not found.');
    if (session.status !== 'OPEN')
      throw new AppError('SESSION_ENDED', 'Signups can only change while the session is open.');
    await this.prisma.scoutingSession.update({
      where: { id: sessionId },
      data: { signupsOpen: open },
    });
    await this.audit(
      session.guildConfigId,
      actorDiscordId,
      open ? 'SIGNUPS_OPENED' : 'SIGNUPS_CLOSED',
      'ScoutingSession',
      sessionId,
    );
    return this.require(sessionId);
  }

  async saveMessage(sessionId: string, channelId: string, messageId: string): Promise<void> {
    await this.prisma.scoutingSession.update({
      where: { id: sessionId },
      data: { channelId, messageId },
    });
  }

  private async audit(
    guildConfigId: string,
    actorDiscordId: string,
    action: string,
    targetType: string,
    targetId: string,
    details?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        guildConfigId,
        actorDiscordId,
        action,
        targetType,
        targetId,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}
