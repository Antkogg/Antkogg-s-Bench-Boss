import { randomUUID } from 'node:crypto';
import type {
  PositionGroup,
  Prisma,
  PrismaClient,
  ScoutingPosition,
} from '../generated/prisma/client.js';
import { statusAllowsSignup } from '../domain/scouting.js';
import { AppError } from '../utils/errors.js';
import { getOrCreatePlayer } from './player.service.js';

export class WaitlistService {
  constructor(private readonly prisma: PrismaClient) {}

  async join(
    guildId: string,
    discordUserId: string,
    sessionId: string,
    group: PositionGroup,
    preferredPosition?: ScoutingPosition | undefined,
    discordDisplayName?: string | undefined,
    discordAvatarUrl?: string | null | undefined,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await tx.scoutingSession.findUnique({ where: { id: sessionId } });
        const config = await tx.guildConfig.findUnique({
          where: { guildId },
          select: { id: true },
        });
        if (!session || session.guildConfigId !== config?.id)
          throw new AppError('NOT_FOUND', 'Session not found.');
        if (!statusAllowsSignup(session.status, session.signupsOpen))
          throw new AppError('SIGNUPS_CLOSED', 'Waitlist signups are closed.');
        const player = await getOrCreatePlayer(tx, guildId, {
          discordUserId,
          discordDisplayName,
          discordAvatarUrl,
        });
        const isEligibleGroup = (player?.signupPositions ?? []).length === 6 || player?.positionGroup === group;
        if (!isEligibleGroup)
          throw new AppError(
            'INELIGIBLE_POSITION',
            `You cannot join the ${group.toLowerCase()} waitlist.`,
          );
        if (
          await tx.scoutingAssignment.findUnique({
            where: { sessionId_playerId: { sessionId, playerId: player.id } },
          })
        )
          throw new AppError('ALREADY_SIGNED_UP', "You're already confirmed for this game.");
        const existing = await tx.waitlistEntry.findUnique({
          where: { sessionId_playerId: { sessionId, playerId: player.id } },
        });
        if (existing && ['WAITING', 'OFFERED'].includes(existing.status))
          throw new AppError('WAITLIST_EXISTS', "You're already on this waitlist.");
        const last = await tx.waitlistEntry.aggregate({
          where: { sessionId, positionGroup: group },
          _max: { queueOrder: true },
        });
        return tx.waitlistEntry.upsert({
          where: { sessionId_playerId: { sessionId, playerId: player.id } },
          update: {
            positionGroup: group,
            preferredPosition: preferredPosition ?? null,
            queueOrder: (last._max.queueOrder ?? 0) + 1,
            status: 'WAITING',
            offerToken: null,
            offerExpiresAt: null,
          },
          create: {
            sessionId,
            playerId: player.id,
            positionGroup: group,
            preferredPosition: preferredPosition ?? null,
            queueOrder: (last._max.queueOrder ?? 0) + 1,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async pass(token: string, discordUserId: string): Promise<string | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { offerToken: token },
        include: { player: true },
      });
      if (!entry || entry.status !== 'OFFERED')
        throw new AppError('STALE_INTERACTION', 'That spot offer is no longer active.');
      if (entry.player.discordUserId !== discordUserId)
        throw new AppError('NOT_ALLOWED', 'That offer belongs to another player.');
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'DECLINED' } });
      if (!entry.offeredPosition) return undefined;
      return this.offerNext(tx, entry.sessionId, entry.positionGroup, entry.offeredPosition);
    });
  }

  async expire(now = new Date()): Promise<string[]> {
    const expired = await this.prisma.waitlistEntry.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lte: now } },
    });
    const nextIds: string[] = [];
    for (const entry of expired) {
      const nextId = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.waitlistEntry.updateMany({
          where: { id: entry.id, status: 'OFFERED' },
          data: { status: 'EXPIRED' },
        });
        if (!updated.count || !entry.offeredPosition) return undefined;
        return this.offerNext(tx, entry.sessionId, entry.positionGroup, entry.offeredPosition);
      });
      if (nextId) nextIds.push(nextId);
    }
    return nextIds;
  }

  async offerNext(
    tx: Prisma.TransactionClient,
    sessionId: string,
    group: PositionGroup,
    position: ScoutingPosition,
  ): Promise<string | undefined> {
    const next = await tx.waitlistEntry.findFirst({
      where: { sessionId, positionGroup: group, status: 'WAITING' },
      orderBy: { queueOrder: 'asc' },
    });
    if (!next) return undefined;
    const token = randomUUID().replaceAll('-', '');
    await tx.waitlistEntry.update({
      where: { id: next.id },
      data: {
        status: 'OFFERED',
        offeredPosition: position,
        offerToken: token,
        offerExpiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return next.id;
  }
}
