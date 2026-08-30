import type {
  InternalPlayerStatus,
  Prisma,
  PrismaClient,
  SignupPosition,
} from '../generated/prisma/client.js';
import { groupForSignupPositions } from '../domain/positions.js';
import { AppError } from '../utils/errors.js';
import { cleanDisplayValue, normalizeIdentity } from '../utils/normalize.js';

export interface UserIdentityInput {
  discordUserId: string;
  discordDisplayName?: string | undefined;
  discordAvatarUrl?: string | null | undefined;
}

export async function getOrCreatePlayer(
  prisma: PrismaClient | Prisma.TransactionClient,
  guildId: string,
  user: UserIdentityInput,
) {
  let configId = 'g1';
  if ('guildConfig' in prisma && prisma.guildConfig && typeof prisma.guildConfig.upsert === 'function') {
    const config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });
    configId = config.id;
  } else if ('guildConfig' in prisma && prisma.guildConfig && typeof prisma.guildConfig.findUnique === 'function') {
    const config = await (prisma.guildConfig as { findUnique: (args: unknown) => Promise<{ id: string } | null> }).findUnique({ where: { guildId } });
    if (config?.id) configId = config.id;
  }

  let player = 'player' in prisma && prisma.player && typeof prisma.player.findFirst === 'function'
    ? await prisma.player.findFirst({
        where: {
          guildConfigId: configId,
          discordUserId: user.discordUserId,
        },
      })
    : null;

  if (!player && 'player' in prisma && prisma.player && typeof prisma.player.create === 'function') {
    const displayName = cleanDisplayValue(user.discordDisplayName ?? user.discordUserId, 80) || user.discordUserId;
    player = await (prisma.player as { create: (args: unknown) => Promise<any> }).create({
      data: {
        guildConfigId: configId,
        discordUserId: user.discordUserId,
        discordDisplayName: displayName,
        discordAvatarUrl: user.discordAvatarUrl ?? null,
        lgUsername: displayName,
        lgUsernameNormalized: normalizeIdentity(displayName),
        eaTag: displayName,
        eaTagNormalized: normalizeIdentity(displayName),
        signupPositions: ['LW', 'C', 'RW', 'LD', 'RD', 'G'],
        positionGroup: 'FORWARD',
        registered: true,
      },
    });
  } else if (player && user.discordDisplayName && player.discordDisplayName !== user.discordDisplayName && 'player' in prisma && prisma.player && typeof prisma.player.update === 'function') {
    player = await prisma.player.update({
      where: { id: player.id },
      data: {
        discordDisplayName: cleanDisplayValue(user.discordDisplayName, 80),
        discordAvatarUrl: user.discordAvatarUrl ?? player.discordAvatarUrl,
      },
    });
  }
  if (!player) {
    throw new AppError('NOT_FOUND', 'Could not retrieve or create player profile.');
  }
  return player;
}

export interface RegisterPlayerInput {
  guildId: string;
  discordUserId: string;
  discordDisplayName: string;
  discordAvatarUrl?: string | null;
  lgUsername: string;
  eaTag: string;
  signupPositions: SignupPosition[];
}

export class PlayerService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: RegisterPlayerInput) {
    const eaTag = cleanDisplayValue(input.eaTag, 32);
    const lgUsername = cleanDisplayValue(input.lgUsername, 32);
    if (!eaTag || !lgUsername)
      throw new AppError('INVALID_INPUT', 'EA Tag and LG username are required.');

    const config = await this.prisma.guildConfig.upsert({
      where: { guildId: input.guildId },
      update: {},
      create: { guildId: input.guildId },
    });
    const existingTag = await this.prisma.player.findFirst({
      where: {
        guildConfigId: config.id,
        eaTagNormalized: normalizeIdentity(eaTag),
        NOT: { discordUserId: input.discordUserId },
      },
    });
    if (existingTag) {
      throw new AppError(
        'INVALID_INPUT',
        'That EA Tag is already registered. Ask management for help.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const player = await tx.player.upsert({
          where: {
            guildConfigId_discordUserId: {
              guildConfigId: config.id,
              discordUserId: input.discordUserId,
            },
          },
          update: {
            discordDisplayName: cleanDisplayValue(input.discordDisplayName, 80),
            discordAvatarUrl: input.discordAvatarUrl ?? null,
            lgUsername,
            lgUsernameNormalized: normalizeIdentity(lgUsername),
            eaTag,
            eaTagNormalized: normalizeIdentity(eaTag),
            signupPositions: input.signupPositions,
            positionGroup: groupForSignupPositions(input.signupPositions),
            registered: true,
            lastRelevantActivityAt: new Date(),
          },
          create: {
            guildConfigId: config.id,
            discordUserId: input.discordUserId,
            discordDisplayName: cleanDisplayValue(input.discordDisplayName, 80),
            discordAvatarUrl: input.discordAvatarUrl ?? null,
            lgUsername,
            lgUsernameNormalized: normalizeIdentity(lgUsername),
            eaTag,
            eaTagNormalized: normalizeIdentity(eaTag),
            signupPositions: input.signupPositions,
            positionGroup: groupForSignupPositions(input.signupPositions),
          },
        });
        await tx.playerActivity.create({
          data: { playerId: player.id, kind: 'PROFILE_REGISTERED_OR_UPDATED' },
        });
        return player;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(
          'INVALID_INPUT',
          'That EA Tag was just registered by another account. Ask management for help.',
        );
      throw error;
    }
  }

  async byDiscordId(
    guildId: string,
    discordUserId: string,
    discordDisplayName?: string | undefined,
    discordAvatarUrl?: string | null | undefined,
  ) {
    return getOrCreatePlayer(this.prisma, guildId, {
      discordUserId,
      discordDisplayName,
      discordAvatarUrl,
    });
  }

  async profile(
    guildId: string,
    discordUserId: string,
    discordDisplayName?: string | undefined,
    discordAvatarUrl?: string | null | undefined,
  ) {
    const player = await getOrCreatePlayer(this.prisma, guildId, {
      discordUserId,
      discordDisplayName,
      discordAvatarUrl,
    });
    const result = await this.prisma.player.findUnique({
      where: { id: player.id },
      include: {
        assignments: {
          where: { session: { startsAt: { gte: new Date() }, status: { in: ['OPEN', 'LOCKED'] } } },
          orderBy: { session: { startsAt: 'asc' } },
          take: 3,
          include: { session: true },
        },
      },
    });
    if (!result) throw new AppError('NOT_FOUND', 'Profile not found.');
    return result;
  }

  search(guildId: string, query: string) {
    const normalized = normalizeIdentity(query);
    return this.prisma.player.findMany({
      where: {
        guildConfig: { guildId },
        OR: [
          { eaTagNormalized: { contains: normalized } },
          { lgUsernameNormalized: { contains: normalized } },
          { discordUserId: query },
        ],
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async setInternalStatus(playerId: string, status: InternalPlayerStatus, actorDiscordId: string) {
    const player = await this.prisma.player.update({
      where: { id: playerId },
      data: { internalStatus: status },
    });
    await this.prisma.auditLog.create({
      data: {
        guildConfigId: player.guildConfigId,
        actorDiscordId,
        action: 'PLAYER_STATUS_CHANGED',
        targetType: 'Player',
        targetId: player.id,
        details: { status },
      },
    });
    return player;
  }
}
