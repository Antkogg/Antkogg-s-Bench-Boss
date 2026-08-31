import { groupForScoutingPosition, isEligible } from '../domain/positions.js';
import { statusAllowsSignup, timeRangesOverlap } from '../domain/scouting.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ScoutingSessionService } from './scouting-session.service.js';
import { WaitlistService } from './waitlist.service.js';
import { getOrCreatePlayer } from './player.service.js';
export class ScoutingService {
    prisma;
    sessions;
    waitlists;
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new ScoutingSessionService(prisma);
        this.waitlists = new WaitlistService(prisma);
    }
    async create(input) {
        return this.sessions.create(input);
    }
    get(sessionId) {
        return this.sessions.get(sessionId);
    }
    async upcoming(guildId, limit = 10) {
        return this.sessions.upcoming(guildId, limit);
    }
    async signup(input) {
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
    async assignLineupPlayer(input) {
        const session = await this.prisma.scoutingSession.findUnique({ where: { id: input.sessionId } });
        if (!session || session.guildConfigId !== (await this.guildConfigId(this.prisma, input.guildId))) {
            throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
        }
        const player = await getOrCreatePlayer(this.prisma, input.guildId, {
            discordUserId: input.discordUserId,
            discordDisplayName: input.discordDisplayName,
        });
        if (!input.conflictOverride && (await this.hasConflict(this.prisma, player.id, session))) {
            throw new AppError('SCHEDULE_CONFLICT', "That player is already confirmed for another game that overlaps this one.");
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
    async switchPosition(input) {
        try {
            await this.prisma.$transaction(async (tx) => {
                const session = await tx.scoutingSession.findUnique({ where: { id: input.sessionId } });
                if (!session)
                    throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
                this.assertOpen(session.status, session.signupsOpen);
                const player = await getOrCreatePlayer(tx, input.guildId, {
                    discordUserId: input.discordUserId,
                    discordDisplayName: input.discordDisplayName,
                    discordAvatarUrl: input.discordAvatarUrl,
                });
                const eligible = (player?.signupPositions ?? []).includes(input.position) ||
                    (player ? isEligible(player.positionGroup, input.position) : false);
                if (!eligible && !input.eligibilityOverride) {
                    throw new AppError('INELIGIBLE_POSITION', `Your LG position is not eligible for ${input.position}.`);
                }
                const current = await tx.scoutingAssignment.findUnique({
                    where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
                });
                if (!current)
                    throw new AppError('NOT_FOUND', "You're no longer in that lineup.");
                const team = await this.availableTeam(tx, session.id, session.format, input.position, current.id);
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
            }, { isolationLevel: 'Serializable' });
            const session = await this.require(input.sessionId);
            logger.info({
                sessionId: input.sessionId,
                discordUserId: input.discordUserId,
                position: input.position,
            }, 'scouting position switched');
            return session;
        }
        catch (error) {
            if (this.isUniqueConflict(error))
                throw new AppError('POSITION_TAKEN', `That ${input.position} spot was just taken.`);
            throw error;
        }
    }
    async leave(guildId, discordUserId, sessionId, managementOverride = false) {
        const offeredWaitlistId = await this.prisma.$transaction(async (tx) => {
            const session = await tx.scoutingSession.findUnique({ where: { id: sessionId } });
            if (!session || session.guildConfigId !== (await this.guildConfigId(tx, guildId))) {
                throw new AppError('NOT_FOUND', 'That scouting session no longer exists.');
            }
            if (!managementOverride)
                this.assertOpen(session.status, session.signupsOpen);
            const player = await tx.player.findFirst({
                where: { guildConfigId: session.guildConfigId, discordUserId },
            });
            if (!player)
                throw new AppError('NOT_REGISTERED', 'You are not registered.');
            const assignment = await tx.scoutingAssignment.findUnique({
                where: { sessionId_playerId: { sessionId, playerId: player.id } },
            });
            if (!assignment)
                throw new AppError('NOT_FOUND', "You don't have a spot in that game.");
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
            return this.waitlists.offerNext(tx, sessionId, groupForScoutingPosition(assignment.position), assignment.position);
        });
        const session = await this.require(sessionId);
        logger.info({ sessionId, discordUserId, managementOverride }, 'player left scouting lineup');
        return offeredWaitlistId ? { session, offeredWaitlistId } : { session };
    }
    async joinWaitlist(guildId, discordUserId, sessionId, group, preferredPosition, discordDisplayName, discordAvatarUrl) {
        return this.waitlists.join(guildId, discordUserId, sessionId, group, preferredPosition, discordDisplayName, discordAvatarUrl);
    }
    async acceptWaitlistOffer(token, discordUserId) {
        const entry = await this.prisma.waitlistEntry.findUnique({
            where: { offerToken: token },
            include: { player: true, session: true },
        });
        if (!entry ||
            entry.status !== 'OFFERED' ||
            !entry.offeredPosition ||
            !entry.offerExpiresAt ||
            entry.offerExpiresAt <= new Date()) {
            throw new AppError('STALE_INTERACTION', 'That spot offer has expired.');
        }
        if (entry.player.discordUserId !== discordUserId)
            throw new AppError('NOT_ALLOWED', 'That offer belongs to another player.');
        await this.signup({
            guildId: (await this.prisma.guildConfig.findUniqueOrThrow({
                where: { id: entry.session.guildConfigId },
            })).guildId,
            discordUserId,
            sessionId: entry.sessionId,
            position: entry.offeredPosition,
        });
        return this.require(entry.sessionId);
    }
    async passWaitlistOffer(token, discordUserId) {
        return this.waitlists.pass(token, discordUserId);
    }
    async expireWaitlistOffers(now = new Date()) {
        return this.waitlists.expire(now);
    }
    async setStatus(sessionId, status, actorDiscordId) {
        return this.sessions.setStatus(sessionId, status, actorDiscordId);
    }
    async setSignups(sessionId, open, actorDiscordId) {
        return this.sessions.setSignups(sessionId, open, actorDiscordId);
    }
    async saveMessage(sessionId, channelId, messageId) {
        return this.sessions.saveMessage(sessionId, channelId, messageId);
    }
    async require(sessionId) {
        return this.sessions.require(sessionId);
    }
    assertOpen(status, signupsOpen) {
        if (status === 'LOCKED')
            throw new AppError('SESSION_LOCKED', 'This lineup is locked.');
        if (!statusAllowsSignup(status, signupsOpen)) {
            throw new AppError(status === 'OPEN' ? 'SIGNUPS_CLOSED' : 'SESSION_ENDED', status === 'OPEN'
                ? 'Signups are closed.'
                : 'This scouting session is no longer accepting changes.');
        }
    }
    async guildConfigId(tx, guildId) {
        return (await tx.guildConfig.findUnique({ where: { guildId }, select: { id: true } }))?.id;
    }
    async availableTeam(tx, sessionId, format, position, excludeAssignmentId) {
        const teams = format === 'PRIVATE_6V6' ? ['TEAM_1', 'TEAM_2'] : ['TEAM_1'];
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
    async hasConflict(tx, playerId, target) {
        const assignments = await tx.scoutingAssignment.findMany({
            where: {
                playerId,
                sessionId: { not: target.id },
                session: { status: { in: ['OPEN', 'LOCKED', 'IN_PROGRESS'] } },
            },
            include: { session: true },
        });
        return assignments.some(({ session }) => timeRangesOverlap(target.startsAt, target.durationMinutes, session.startsAt, session.durationMinutes));
    }
    isUniqueConflict(error) {
        return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
    }
}
//# sourceMappingURL=scouting.service.js.map