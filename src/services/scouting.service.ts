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
import { getOrCreatePlayer } from './player.service.js';

export type { CreateSessionInput } from './scouting-session.service.js';
export type { ScoutingSessionView } from './scouting-view.js';

export interface SignupInput {
  guildId: string;
  discordUserId: string;
  discordDisplayName?: string | undefined;
  discordAvatarUrl?: string | null | undefined;
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

  async signup(input: SignupInput): Promise<{
    session: ScoutingSessionView;
    action: 'added' | 'removed' | 'switched';
    position: ScoutingPosition;
    previousPosition?: ScoutingPosition | undefined;
  }> {
    const session = await this.prisma.scoutingSession.findUnique({ where: { id: input.sessionId } });
    if (!session || session.guildConfigId !== (await this.guildConfigId(this.prisma, input.guildId))) {
      throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
    }
    this.assertOpen(session.status, session.signupsOpen);

    const player = await getOrCreatePlayer(this.prisma, input.guildId, {
      discordUserId: input.discordUserId,
      discordDisplayName: input.discordDisplayName,
      discordAvatarUrl: input.discordAvatarUrl,
    });

    const existing = await this.prisma.availability.findUnique({
      where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
    });

    if (existing) {
      if (existing.position === input.position) {
        await this.prisma.availability.delete({ where: { id: existing.id } });
        const updated = await this.require(input.sessionId);
        return { session: updated, action: 'removed', position: input.position };
      }
      await this.prisma.availability.update({
        where: { id: existing.id },
        data: { position: input.position },
      });
      const updated = await this.require(input.sessionId);
      return {
        session: updated,
        action: 'switched',
        position: input.position,
        previousPosition: existing.position ?? undefined,
      };
    }

    await this.prisma.availability.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        position: input.position,
      },
    });

    await this.prisma.player.update({
      where: { id: player.id },
      data: { lastRelevantActivityAt: new Date() },
    });

    await this.prisma.playerActivity.create({
      data: {
        playerId: player.id,
        kind: 'SCOUTING_SIGNUP_POOL',
        relatedType: 'ScoutingSession',
        relatedId: session.id,
        details: { position: input.position },
      },
    });

    const updated = await this.require(input.sessionId);
    return { session: updated, action: 'added', position: input.position };
  }

  async assignLineupPlayer(input: {
    guildId: string;
    sessionId: string;
    discordUserId: string;
    discordDisplayName?: string | undefined;
    position: ScoutingPosition;
    team?: LineupTeam | undefined;
    eligibilityOverride?: boolean | undefined;
    conflictOverride?: boolean | undefined;
    actorDiscordId: string;
  }): Promise<ScoutingSessionView> {
    const session = await this.prisma.scoutingSession.findUnique({ where: { id: input.sessionId } });
    if (!session || session.guildConfigId !== (await this.guildConfigId(this.prisma, input.guildId))) {
      throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
    }
    const player = await getOrCreatePlayer(this.prisma, input.guildId, {
      discordUserId: input.discordUserId,
      discordDisplayName: input.discordDisplayName,
    });

    if (!input.conflictOverride && (await this.hasConflict(this.prisma, player.id, session))) {
      throw new AppError(
        'SCHEDULE_CONFLICT',
        "That player is already confirmed for another game that overlaps this one.",
      );
    }

    const team = input.team ?? (await this.availableTeam(this.prisma, session.id, session.format, input.position)) ?? 'TEAM_1';

    await this.prisma.scoutingAssignment.upsert({
      where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
      update: {
        team,
        position: input.position,
        eligibilityOverride: input.eligibilityOverride ?? false,
        conflictOverride: input.conflictOverride ?? false,
        assignedByDiscordId: input.actorDiscordId,
      },
      create: {
        sessionId: session.id,
        playerId: player.id,
        team,
        position: input.position,
        eligibilityOverride: input.eligibilityOverride ?? false,
        conflictOverride: input.conflictOverride ?? false,
        assignedByDiscordId: input.actorDiscordId,
      },
    });

    await this.prisma.player.update({
      where: { id: player.id },
      data: { lastRelevantActivityAt: new Date() },
    });

    await this.prisma.playerActivity.create({
      data: {
        playerId: player.id,
        kind: 'LINEUP_ASSIGNED_BY_MANAGEMENT',
        relatedType: 'ScoutingSession',
        relatedId: session.id,
        details: { position: input.position, team },
      },
    });

    return this.require(input.sessionId);
  }

  async switchPosition(input: SignupInput): Promise<ScoutingSessionView> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const session = await tx.scoutingSession.findUnique({ where: { id: input.sessionId } });
          if (!session) throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
          this.assertOpen(session.status, session.signupsOpen);
          const player = await getOrCreatePlayer(tx, input.guildId, {
            discordUserId: input.discordUserId,
            discordDisplayName: input.discordDisplayName,
            discordAvatarUrl: input.discordAvatarUrl,
          });
          const eligible =
            (player?.signupPositions ?? []).includes(input.position as any) ||
            (player ? isEligible(player.positionGroup, input.position) : false);
          if (!eligible && !input.eligibilityOverride) {
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
          await tx.player.update({
            where: { id: player.id },
            data: { lastRelevantActivityAt: new Date() },
          });
          await tx.playerActivity.create({
            data: {
              playerId: player.id,
              kind: 'SCOUTING_POSITION_SWITCHED',
              relatedType: 'ScoutingSession',
              relatedId: session.id,
              details: { from: current.position, to: input.position },
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
      await tx.player.update({
        where: { id: player.id },
        data: { lastRelevantActivityAt: new Date() },
      });
      await tx.playerActivity.create({
        data: {
          playerId: player.id,
          kind: managementOverride ? 'LINEUP_REMOVAL' : 'SCOUTING_WITHDRAWAL',
          relatedType: 'ScoutingSession',
          relatedId: sessionId,
        },
      });
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
    preferredPosition?: ScoutingPosition | undefined,
    discordDisplayName?: string | undefined,
    discordAvatarUrl?: string | null | undefined,
  ) {
    return this.waitlists.join(
      guildId,
      discordUserId,
      sessionId,
      group,
      preferredPosition,
      discordDisplayName,
      discordAvatarUrl,
    );
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
