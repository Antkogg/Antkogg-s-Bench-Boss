import { logger } from '../utils/logger.js';
export class ScoutingReminderJob {
    prisma;
    scouting;
    notifications;
    timer;
    running = false;
    constructor(prisma, scouting, notifications) {
        this.prisma = prisma;
        this.scouting = scouting;
        this.notifications = notifications;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => void this.runOnce(), 60_000);
        void this.runOnce();
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    async runOnce() {
        if (this.running) {
            logger.warn('skipping reminder sweep because the previous sweep is still running');
            return;
        }
        this.running = true;
        try {
            await this.tick();
        }
        catch (error) {
            logger.error({ error }, 'reminder sweep failed');
        }
        finally {
            this.running = false;
        }
    }
    async tick(now = new Date()) {
        const nextOfferIds = await this.scouting.expireWaitlistOffers(now);
        for (const id of nextOfferIds) {
            const offer = await this.prisma.waitlistEntry.findUnique({
                where: { id },
                include: { player: true },
            });
            const session = offer ? await this.scouting.get(offer.sessionId) : null;
            if (offer?.offerToken && offer.offeredPosition && session) {
                await this.notifications.waitlistOffer(offer.player.discordUserId, session, offer.offeredPosition, offer.offerToken);
            }
        }
        const sessions = await this.prisma.scoutingSession.findMany({
            where: { status: { in: ['OPEN', 'LOCKED'] }, startsAt: { gt: now } },
            include: { guildConfig: true, assignments: { include: { player: true } } },
        });
        for (const session of sessions) {
            for (const minutes of session.guildConfig.reminderMinutes) {
                const scheduledFor = new Date(session.startsAt.getTime() - minutes * 60_000);
                // Persisted claims make this a catch-up sweep: after a restart, every due
                // reminder for a still-upcoming session is delivered exactly once.
                if (scheduledFor > now)
                    continue;
                for (const assignment of session.assignments) {
                    const claim = await this.prisma.reminderDispatch.upsert({
                        where: {
                            sessionId_playerId_notificationType_scheduledFor: {
                                sessionId: session.id,
                                playerId: assignment.playerId,
                                notificationType: 'GAME_REMINDER',
                                scheduledFor,
                            },
                        },
                        create: {
                            sessionId: session.id,
                            playerId: assignment.playerId,
                            notificationType: 'GAME_REMINDER',
                            scheduledFor,
                        },
                        update: {},
                    });
                    if (claim.sentAt)
                        continue;
                    const view = await this.scouting.get(session.id);
                    if (!view)
                        continue;
                    const sent = await this.notifications.reminder(assignment.player.discordUserId, view, assignment.position);
                    await this.prisma.reminderDispatch.update({
                        where: { id: claim.id },
                        data: sent ? { sentAt: new Date(), failedAt: null } : { failedAt: new Date() },
                    });
                }
            }
        }
        logger.debug({ checked: sessions.length }, 'reminder sweep completed');
    }
}
//# sourceMappingURL=scouting-reminders.js.map