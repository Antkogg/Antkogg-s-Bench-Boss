import { AppError } from '../utils/errors.js';
import { sessionInclude } from './scouting-view.js';
export class ScoutingSessionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(input) {
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
        await this.audit(config.id, input.createdByDiscordId, 'SCOUTING_CREATED', 'ScoutingSession', session.id, { startsAt: input.startsAt.toISOString(), format: input.format });
        return this.require(session.id);
    }
    get(sessionId) {
        return this.prisma.scoutingSession.findUnique({
            where: { id: sessionId },
            include: sessionInclude,
        });
    }
    async require(sessionId) {
        const session = await this.get(sessionId);
        if (!session)
            throw new AppError('NOT_FOUND', 'Scouting session not found.');
        return session;
    }
    upcoming(guildId, limit = 10) {
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
    async setStatus(sessionId, status, actorDiscordId) {
        const current = await this.prisma.scoutingSession.findUnique({ where: { id: sessionId } });
        if (!current)
            throw new AppError('NOT_FOUND', 'Session not found.');
        await this.prisma.scoutingSession.update({
            where: { id: sessionId },
            data: { status, signupsOpen: status === 'OPEN' ? current.signupsOpen : false },
        });
        await this.audit(current.guildConfigId, actorDiscordId, `SCOUTING_${status}`, 'ScoutingSession', sessionId);
        return this.require(sessionId);
    }
    async setSignups(sessionId, open, actorDiscordId) {
        const session = await this.prisma.scoutingSession.findUnique({ where: { id: sessionId } });
        if (!session)
            throw new AppError('NOT_FOUND', 'Session not found.');
        if (session.status !== 'OPEN')
            throw new AppError('SESSION_ENDED', 'Signups can only change while the session is open.');
        await this.prisma.scoutingSession.update({
            where: { id: sessionId },
            data: { signupsOpen: open },
        });
        await this.audit(session.guildConfigId, actorDiscordId, open ? 'SIGNUPS_OPENED' : 'SIGNUPS_CLOSED', 'ScoutingSession', sessionId);
        return this.require(sessionId);
    }
    async saveMessage(sessionId, channelId, messageId) {
        await this.prisma.scoutingSession.update({
            where: { id: sessionId },
            data: { channelId, messageId },
        });
    }
    async audit(guildConfigId, actorDiscordId, action, targetType, targetId, details) {
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
//# sourceMappingURL=scouting-session.service.js.map