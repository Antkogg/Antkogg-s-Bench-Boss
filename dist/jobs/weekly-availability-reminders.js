import { logger } from '../utils/logger.js';
export class WeeklyAvailabilityReminderJob {
    prisma;
    availability;
    notifications;
    timer;
    running = false;
    constructor(prisma, availability, notifications) {
        this.prisma = prisma;
        this.availability = availability;
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
        if (this.running)
            return;
        this.running = true;
        try {
            await this.tick();
        }
        catch (error) {
            logger.error({ error }, 'weekly availability reminder sweep failed');
        }
        finally {
            this.running = false;
        }
    }
    async tick(now = new Date()) {
        const weeks = await this.prisma.seasonWeek.findMany({
            where: { status: 'OPEN', deadline: { gt: now } },
            include: { guildConfig: true },
        });
        for (const week of weeks) {
            for (const minutes of week.guildConfig.availabilityReminderMinutes) {
                const scheduledFor = new Date(week.deadline.getTime() - minutes * 60_000);
                if (scheduledFor > now)
                    continue;
                const roster = await this.availability.missing(week.id, { teamStatus: 'ROSTER' });
                const tcs = week.guildConfig.tcReminderPolicy === 'DISABLED'
                    ? []
                    : await this.availability.missing(week.id, { teamStatus: 'TC' });
                for (const player of [...roster, ...tcs]) {
                    const claim = await this.prisma.weeklyAvailabilityReminder.upsert({
                        where: {
                            weekId_playerId_kind_scheduledFor: {
                                weekId: week.id,
                                playerId: player.id,
                                kind: 'DEADLINE',
                                scheduledFor,
                            },
                        },
                        create: { weekId: week.id, playerId: player.id, kind: 'DEADLINE', scheduledFor },
                        update: {},
                    });
                    if (claim.sentAt)
                        continue;
                    const sent = await this.notifications.availabilityReminder(player.discordUserId, week, player.teamStatus === 'ROSTER' || week.guildConfig.tcReminderPolicy === 'REQUIRED'
                        ? 'required'
                        : 'encouraged');
                    await this.prisma.weeklyAvailabilityReminder.update({
                        where: { id: claim.id },
                        data: sent ? { sentAt: new Date(), failedAt: null } : { failedAt: new Date() },
                    });
                }
            }
        }
    }
}
//# sourceMappingURL=weekly-availability-reminders.js.map