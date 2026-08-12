import type { PrismaClient } from '../generated/prisma/client.js';
import type { NotificationService } from '../services/notification.service.js';
import type { ScoutingService } from '../services/scouting.service.js';
import { logger } from '../utils/logger.js';

export class ScoutingReminderJob {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly scouting: ScoutingService,
    private readonly notifications: NotificationService,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 60_000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    const nextOfferIds = await this.scouting.expireWaitlistOffers(now);
    for (const id of nextOfferIds) {
      const offer = await this.prisma.waitlistEntry.findUnique({
        where: { id },
        include: { player: true },
      });
      const session = offer ? await this.scouting.get(offer.sessionId) : null;
      if (offer?.offerToken && offer.offeredPosition && session) {
        await this.notifications.waitlistOffer(
          offer.player.discordUserId,
          session,
          offer.offeredPosition,
          offer.offerToken,
        );
      }
    }
    const windowEnd = new Date(now.getTime() + 61_000);
    const sessions = await this.prisma.scoutingSession.findMany({
      where: { status: { in: ['OPEN', 'LOCKED'] }, startsAt: { gt: now } },
      include: { guildConfig: true, assignments: { include: { player: true } } },
    });
    for (const session of sessions) {
      for (const minutes of session.guildConfig.reminderMinutes) {
        const scheduledFor = new Date(session.startsAt.getTime() - minutes * 60_000);
        if (scheduledFor < now || scheduledFor >= windowEnd) continue;
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
          if (claim.sentAt || claim.failedAt) continue;
          const view = await this.scouting.get(session.id);
          if (!view) continue;
          const sent = await this.notifications.reminder(
            assignment.player.discordUserId,
            view,
            assignment.position,
          );
          await this.prisma.reminderDispatch.update({
            where: { id: claim.id },
            data: sent ? { sentAt: new Date() } : { failedAt: new Date() },
          });
        }
      }
    }
    logger.debug({ checked: sessions.length }, 'reminder sweep completed');
  }
}
