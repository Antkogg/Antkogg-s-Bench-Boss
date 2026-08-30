import { logger } from '../utils/logger.js';
export class GameDayReminderJob {
    prisma;
    notifications;
    timer;
    running = false;
    constructor(prisma, notifications) {
        this.prisma = prisma;
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
            logger.error({ error }, 'game-day reminder sweep failed');
        }
        finally {
            this.running = false;
        }
    }
    async tick(now = new Date()) {
        const pendingAssignments = await this.prisma.gameLineupAssignment.findMany({
            where: {
                confirmed: true,
                game: {
                    status: { in: ['SCHEDULED', 'POSTPONED'] },
                    scheduledAtUtc: { gt: now },
                },
                OR: [{ confirmationNotifiedAt: null }, { gameInfoNotifiedAt: null }],
            },
            include: {
                player: true,
                game: { include: { week: { include: { guildConfig: true } } } },
            },
        });
        for (const assignment of pendingAssignments) {
            if (!assignment.confirmationNotifiedAt) {
                const sent = await this.notifications.lineupConfirmed(assignment.player.discordUserId, assignment.game, assignment.position);
                if (sent)
                    await this.prisma.gameLineupAssignment.update({
                        where: { id: assignment.id },
                        data: { confirmationNotifiedAt: new Date() },
                    });
            }
            if (!assignment.gameInfoNotifiedAt &&
                assignment.game.week.guildConfig.notifyConfirmedGameInfo &&
                assignment.game.gameServer &&
                assignment.game.gameCode) {
                const sent = await this.notifications.gameInfoReady(assignment.player.discordUserId, assignment.game, assignment.position);
                if (sent)
                    await this.prisma.gameLineupAssignment.update({
                        where: { id: assignment.id },
                        data: { gameInfoNotifiedAt: new Date() },
                    });
            }
        }
        const games = await this.prisma.weeklyGame.findMany({
            where: {
                status: { in: ['SCHEDULED', 'POSTPONED'] },
                scheduledAtUtc: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60_000) },
                OR: [{ gameServer: null }, { gameCode: null }],
            },
            include: { week: { include: { guildConfig: true } } },
        });
        for (const game of games) {
            const config = game.week.guildConfig;
            if (!config.managementChannelId)
                continue;
            const scheduledFor = new Date(game.scheduledAtUtc.getTime() - config.serverCodeReminderMinutes * 60_000);
            if (scheduledFor > now)
                continue;
            const claim = await this.prisma.gameManagementReminder.upsert({
                where: { gameId_scheduledFor: { gameId: game.id, scheduledFor } },
                create: { gameId: game.id, scheduledFor },
                update: {},
            });
            if (claim.sentAt)
                continue;
            const messageId = await this.notifications.serverCodeMissing(config.managementChannelId, game);
            await this.prisma.gameManagementReminder.update({
                where: { id: claim.id },
                data: messageId
                    ? { sentAt: new Date(), failedAt: null, messageId }
                    : { failedAt: new Date() },
            });
        }
    }
}
//# sourceMappingURL=game-day-reminders.js.map