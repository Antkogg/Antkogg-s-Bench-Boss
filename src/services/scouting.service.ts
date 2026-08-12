import type {
  LineupTeam,
  PositionGroup,
  Prisma,
  PrismaClient,
  ScoutingPosition,
  SessionFormat,
  SessionStatus,
} from '../generated/prisma/client.js';
import { groupForScoutingPosition, isEligible } from '../domain/positions.js';
import { statusAllowsSignup, timeRangesOverlap } from '../domain/scouting.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ScoutingSessionService, type CreateSessionInput } from './scouting-session.service.js';
import type { ScoutingSessionView } from './scouting-view.js';
import { WaitlistService } from './waitlist.service.js';

export type { CreateSessionInput } from './scouting-session.service.js';
export type { ScoutingSessionView } from './scouting-view.js';

export interface SignupInput {
  guildId: string;
  discordUserId: string;
  sessionId: string;
  position: ScoutingPosition;
  eligibilityOverride?: boolean;
  conflictOverride?: boolean;
  actorDiscordId?: string;
}

export class ScoutingService {
  private readonly sessions: ScoutingSessionService;
  private readonly waitlists: WaitlistService;

  constructor(private readonly prisma: PrismaClient) {
    this.sessions = new ScoutingSessionService(prisma);
    this.waitlists = new WaitlistService(prisma);
  }

  async create(input: CreateSessionInput): Promise<ScoutingSessionView> {
    return this.sessions.create(input);
  }

  get(sessionId: string): Promise<ScoutingSessionView | null> {
    return this.sessions.get(sessionId);
  }

  async upcoming(guildId: string, limit = 10): Promise<ScoutingSessionView[]> {
    return this.sessions.upcoming(guildId, limit);
  }

  async signup(
    input: SignupInput,
  ): Promise<{ session: ScoutingSessionView; previousPosition?: ScoutingPosition }> {
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const session = await tx.scoutingSession.findUnique({ where: { id: input.sessionId } });
          if (!session || session.guildConfigId !== (await this.guildConfigId(tx, input.guildId))) {
            throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
          }
          this.assertOpen(session.status, session.signupsOpen);
          const player = await tx.player.findFirst({
            where: {
              guildConfigId: session.guildConfigId,
              discordUserId: input.discordUserId,
              registered: true,
            },
          });
          if (!player)
            throw new AppError('NOT_REGISTERED', 'Register in `/profile` before joining scouting.');
          if (!isEligible(player.positionGroup, input.position) && !input.eligibilityOverride) {
            throw new AppError(
              'INELIGIBLE_POSITION',
              `Your LG position is not eligible for ${input.position}.`,
            );
          }
          const existing = await tx.scoutingAssignment.findUnique({
            where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
          });
          if (existing) {
            if (existing.position === input.position)
              throw new AppError(
                'ALREADY_SIGNED_UP',
                `You're already confirmed at ${input.position}.`,
              );
            return { kind: 'switch' as const, previousPosition: existing.position };
          }
          if (!input.conflictOverride && (await this.hasConflict(tx, player.id, session))) {
            throw new AppError(
              'SCHEDULE_CONFLICT',
              "You're already confirmed for another game that overlaps this one.",
            );
          }
          const team = await this.availableTeam(tx, session.id, session.format, input.position);
          if (!team)
            throw new AppError(
              'POSITION_TAKEN',
              `That ${input.position} spot was just taken. Try another position.`,
            );
          await tx.scoutingAssignment.create({
            data: {
              sessionId: session.id,
              playerId: player.id,
              team,
              position: input.position,
              eligibilityOverride: input.eligibilityOverride ?? false,
              conflictOverride: input.conflictOverride ?? false,
              assignedByDiscordId: input.actorDiscordId ?? null,
            },
          });
          await tx.waitlistEntry.updateMany({
            where: { sessionId: session.id, playerId: player.id },
            data: { status: 'PROMOTED' },
          });
          return { kind: 'created' as const };
        },
        { isolationLevel: 'Serializable' },
      );

      if (result.kind === 'switch') {
        const session = await this.require(input.sessionId);
        return { session, previousPosition: result.previousPosition };
      }
      const session = await this.require(input.sessionId);
      logger.info(
        {
          sessionId: input.sessionId,
          discordUserId: input.discordUserId,
          position: input.position,
        },
        'scouting signup completed',
      );
      if (
        input.actorDiscordId &&
        (input.eligibilityOverride === true || input.conflictOverride === true)
      ) {
        await this.prisma.auditLog.create({
          data: {
            guildConfigId: session.guildConfigId,
            actorDiscordId: input.actorDiscordId,
            action: 'LINEUP_OVERRIDE',
            targetType: 'ScoutingSession',
            targetId: session.id,
            details: {
              playerDiscordId: input.discordUserId,
              position: input.position,
              eligibilityOverride: input.eligibilityOverride === true,
              conflictOverride: input.conflictOverride === true,
            },
          },
        });
      }
      return { session };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppError(
          'POSITION_TAKEN',
          `That ${input.position} spot was just taken. Try another position.`,
        );
      }
      throw error;
    }
  }

  async switchPosition(input: SignupInput): Promise<ScoutingSessionView> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const session = await tx.scoutingSession.findUnique({ where: { id: input.sessionId } });
          if (!session) throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
          this.assertOpen(session.status, session.signupsOpen);
          const player = await tx.player.findFirst({
            where: {
              guildConfigId: session.guildConfigId,
              discordUserId: input.discordUserId,
              registered: true,
            },
          });
          if (!player) throw new AppError('NOT_REGISTERED', 'Register before joining scouting.');
          if (!isEligible(player.positionGroup, input.position) && !input.eligibilityOverride) {
            throw new AppError(
              'INELIGIBLE_POSITION',
              `Your LG position is not eligible for ${input.position}.`,
            );
          }
          const current = await tx.scoutingAssignment.findUnique({
            where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
          });
          if (!current) throw new AppError('NOT_FOUND', "You're no longer in that lineup.");
          const team = await this.availableTeam(
            tx,
            session.id,
            session.format,
            input.position,
            current.id,
          );
          if (!team)
            throw new AppError('POSITION_TAKEN', `That ${input.position} spot was just taken.`);
          await tx.scoutingAssignment.update({
            where: { id: current.id },
            data: {
              position: input.position,
              team,
              eligibilityOverride: input.eligibilityOverride ?? false,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      const session = await this.require(input.sessionId);
      logger.info(
        {
          sessionId: input.sessionId,
          discordUserId: input.discordUserId,
          position: input.position,
        },
        'scouting position switched',
      );
      return session;
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new AppError('POSITION_TAKEN', `That ${input.position} spot was just taken.`);
      throw error;
    }
  }

  async leave(
    guildId: string,
    discordUserId: string,
    sessionId: string,
    managementOverride = false,
  ): Promise<{ session: ScoutingSessionView; offeredWaitlistId?: string }> {
    const offeredWaitlistId = await this.prisma.$transaction(async (tx) => {
      const session = await tx.scoutingSession.findUnique({ where: { id: sessionId } });
      if (!session || session.guildConfigId !== (await this.guildConfigId(tx, guildId))) {
        throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
      }
      if (!managementOverride) this.assertOpen(session.status, session.signupsOpen);
      const player = await tx.player.findFirst({
        where: { guildConfigId: session.guildConfigId, discordUserId },
      });
      if (!player) throw new AppError('NOT_REGISTERED', 'You are not registered.');
      const assignment = await tx.scoutingAssignment.findUnique({
        where: { sessionId_playerId: { sessionId, playerId: player.id } },
      });
      if (!assignment) throw new AppError('NOT_FOUND', "You don't have a spot in that game.");
      await tx.scoutingAssignment.delete({ where: { id: assignment.id } });
      return this.waitlists.offerNext(
        tx,
        sessionId,
        groupForScoutingPosition(assignment.position),
        assignment.position,
      );
    });
    const session = await this.require(sessionId);
    logger.info({ sessionId, discordUserId, managementOverride }, 'player left scouting lineup');
    return offeredWaitlistId ? { session, offeredWaitlistId } : { session };
  }

  async joinWaitlist(
    guildId: string,
    discordUserId: string,
    sessionId: string,
    group: PositionGroup,
    preferredPosition?: ScoutingPosition,
  ) {
    return this.waitlists.join(guildId, discordUserId, sessionId, group, preferredPosition);
  }

  async acceptWaitlistOffer(token: string, discordUserId: string): Promise<ScoutingSessionView> {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { offerToken: token },
      include: { player: true, session: true },
    });
    if (
      !entry ||
      entry.status !== 'OFFERED' ||
      !entry.offeredPosition ||
      !entry.offerExpiresAt ||
      entry.offerExpiresAt <= new Date()
    ) {
      throw new AppError('STALE_INTERACTION', 'That spot offer has expired.');
    }
    if (entry.player.discordUserId !== discordUserId)
      throw new AppError('NOT_ALLOWED', 'That offer belongs to another player.');
    await this.signup({
      guildId: (
        await this.prisma.guildConfig.findUniqueOrThrow({
          where: { id: entry.session.guildConfigId },
        })
      ).guildId,
      discordUserId,
      sessionId: entry.sessionId,
      position: entry.offeredPosition,
    });
    return this.require(entry.sessionId);
  }

  async passWaitlistOffer(token: string, discordUserId: string): Promise<string | undefined> {
    return this.waitlists.pass(token, discordUserId);
  }

  async expireWaitlistOffers(now = new Date()): Promise<string[]> {
    return this.waitlists.expire(now);
  }

  async setStatus(
    sessionId: string,
    status: SessionStatus,
    actorDiscordId: string,
  ): Promise<ScoutingSessionView> {
    return this.sessions.setStatus(sessionId, status, actorDiscordId);
  }

  async setSignups(
    sessionId: string,
    open: boolean,
    actorDiscordId: string,
  ): Promise<ScoutingSessionView> {
    return this.sessions.setSignups(sessionId, open, actorDiscordId);
  }

  async saveMessage(sessionId: string, channelId: string, messageId: string): Promise<void> {
    return this.sessions.saveMessage(sessionId, channelId, messageId);
  }

  private async require(sessionId: string): Promise<ScoutingSessionView> {
    return this.sessions.require(sessionId);
  }

  private assertOpen(status: SessionStatus, signupsOpen: boolean): void {
    if (status === 'LOCKED') throw new AppError('SESSION_LOCKED', 'This lineup is locked.');
    if (!statusAllowsSignup(status, signupsOpen)) {
      throw new AppError(
        status === 'OPEN' ? 'SIGNUPS_CLOSED' : 'SESSION_ENDED',
        status === 'OPEN'
          ? 'Signups are closed.'
          : 'This scouting session is no longer accepting changes.',
      );
    }
  }

  private async guildConfigId(
    tx: Prisma.TransactionClient,
    guildId: string,
  ): Promise<string | undefined> {
    return (await tx.guildConfig.findUnique({ where: { guildId }, select: { id: true } }))?.id;
  }

  private async availableTeam(
    tx: Prisma.TransactionClient,
    sessionId: string,
    format: SessionFormat,
    position: ScoutingPosition,
    excludeAssignmentId?: string,
  ): Promise<LineupTeam | null> {
    const teams: readonly LineupTeam[] =
      format === 'PRIVATE_6V6' ? ['TEAM_1', 'TEAM_2'] : ['TEAM_1'];
    const occupied = await tx.scoutingAssignment.findMany({
      where: {
        sessionId,
        position,
        slotIndex: 0,
        ...(excludeAssignmentId ? { NOT: { id: excludeAssignmentId } } : {}),
      },
      select: { team: true },
    });
    const taken = new Set(occupied.map((slot) => slot.team));
    return teams.find((team) => !taken.has(team)) ?? null;
  }

  private async hasConflict(
    tx: Prisma.TransactionClient,
    playerId: string,
    target: { id: string; startsAt: Date; durationMinutes: number },
  ): Promise<boolean> {
    const assignments = await tx.scoutingAssignment.findMany({
      where: {
        playerId,
        sessionId: { not: target.id },
        session: { status: { in: ['OPEN', 'LOCKED', 'IN_PROGRESS'] } },
      },
      include: { session: true },
    });
    return assignments.some(({ session }) =>
      timeRangesOverlap(
        target.startsAt,
        target.durationMinutes,
        session.startsAt,
        session.durationMinutes,
      ),
    );
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
