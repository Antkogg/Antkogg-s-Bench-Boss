import { groupForSignupPosition } from '../domain/positions.js';
import { AppError } from '../utils/errors.js';
import { cleanDisplayValue, normalizeIdentity } from '../utils/normalize.js';
export class PlayerService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async register(input) {
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
            throw new AppError('INVALID_INPUT', 'That EA Tag is already registered. Ask management for help.');
        }
        try {
            return await this.prisma.player.upsert({
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
                    signupPosition: input.signupPosition,
                    positionGroup: groupForSignupPosition(input.signupPosition),
                    registered: true,
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
                    signupPosition: input.signupPosition,
                    positionGroup: groupForSignupPosition(input.signupPosition),
                },
            });
        }
        catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
                throw new AppError('INVALID_INPUT', 'That EA Tag was just registered by another account. Ask management for help.');
            throw error;
        }
    }
    async byDiscordId(guildId, discordUserId) {
        const player = await this.prisma.player.findFirst({
            where: { guildConfig: { guildId }, discordUserId, registered: true },
        });
        if (!player)
            throw new AppError('NOT_REGISTERED', 'Register first using the **Register** button in `/profile`.');
        return player;
    }
    async profile(guildId, discordUserId) {
        const player = await this.prisma.player.findFirst({
            where: { guildConfig: { guildId }, discordUserId, registered: true },
            include: {
                assignments: {
                    where: { session: { startsAt: { gte: new Date() }, status: { in: ['OPEN', 'LOCKED'] } } },
                    orderBy: { session: { startsAt: 'asc' } },
                    take: 3,
                    include: { session: true },
                },
            },
        });
        if (!player)
            throw new AppError('NOT_REGISTERED', 'You are not registered yet.');
        return player;
    }
    search(guildId, query) {
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
    async setInternalStatus(playerId, status, actorDiscordId) {
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
//# sourceMappingURL=player.service.js.map