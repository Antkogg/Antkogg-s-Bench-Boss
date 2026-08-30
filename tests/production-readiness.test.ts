import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ScoutingReminderJob } from '../src/jobs/scouting-reminders.js';
import { GameDayReminderJob } from '../src/jobs/game-day-reminders.js';
import type { ScoutingService, ScoutingSessionView } from '../src/services/scouting.service.js';

describe('production restart recovery', () => {
  it('catches up an overdue persisted scouting reminder and retries a prior delivery failure', async () => {
    const now = new Date('2026-09-01T12:05:00Z');
    const claim = {
      id: 'claim-1',
      sentAt: null as Date | null,
      failedAt: new Date('2026-09-01T12:01:00Z') as Date | null,
    };
    const update = vi.fn(
      async ({
        data,
      }: {
        where: { id: string };
        data: { sentAt?: Date; failedAt?: Date | null };
      }) => {
        claim.sentAt = data.sentAt ?? claim.sentAt;
        claim.failedAt = data.failedAt === undefined ? claim.failedAt : data.failedAt;
        return claim;
      },
    );
    const prisma = {
      scoutingSession: {
        findMany: vi.fn(async () => [
          {
            id: 'session-1',
            startsAt: new Date('2026-09-01T13:00:00Z'),
            guildConfig: { reminderMinutes: [60] },
            assignments: [
              {
                playerId: 'player-1',
                position: 'LW',
                player: { discordUserId: 'discord-1' },
              },
            ],
          },
        ]),
      },
      reminderDispatch: {
        upsert: vi.fn(async () => claim),
        update,
      },
    } as unknown as PrismaClient;
    const view = {
      id: 'session-1',
      startsAt: new Date('2026-09-01T13:00:00Z'),
    } as ScoutingSessionView;
    const scouting = {
      expireWaitlistOffers: vi.fn(async () => []),
      get: vi.fn(async () => view),
    } as unknown as ScoutingService;
    const reminder = vi.fn(async () => true);
    const job = new ScoutingReminderJob(prisma, scouting, { reminder } as never);

    await job.tick(now);

    expect(reminder).toHaveBeenCalledOnce();
    const reminderUpdate = update.mock.calls[0]?.[0];
    expect(reminderUpdate?.where).toEqual({ id: 'claim-1' });
    expect(reminderUpdate?.data.sentAt).toBeInstanceOf(Date);
    expect(reminderUpdate?.data.failedAt).toBeNull();
  });

  it('retries persisted regular-season lineup notifications after restart', async () => {
    const assignment = {
      id: 'assignment-1',
      position: 'LW',
      confirmationNotifiedAt: null,
      gameInfoNotifiedAt: null,
      player: { discordUserId: 'discord-1' },
      game: {
        id: 'game-1',
        scheduledAtUtc: new Date('2026-09-01T13:00:00Z'),
        opponentNameSnapshot: 'Michigan',
        homeAway: 'HOME',
        gameServer: null,
        gameCode: null,
        week: { guildConfig: { notifyConfirmedGameInfo: true } },
      },
    };
    const update = vi.fn<
      (input: { where: { id: string }; data: { confirmationNotifiedAt: Date } }) => Promise<object>
    >(async () => ({}));
    const prisma = {
      gameLineupAssignment: {
        findMany: vi.fn(async () => [assignment]),
        update,
      },
      weeklyGame: { findMany: vi.fn(async () => []) },
    } as unknown as PrismaClient;
    const lineupConfirmed = vi.fn(async () => true);
    const job = new GameDayReminderJob(prisma, { lineupConfirmed } as never);

    await job.tick(new Date('2026-09-01T12:00:00Z'));

    expect(lineupConfirmed).toHaveBeenCalledOnce();
    const lineupUpdate = update.mock.calls[0]?.[0];
    expect(lineupUpdate?.where).toEqual({ id: 'assignment-1' });
    expect(lineupUpdate?.data.confirmationNotifiedAt).toBeInstanceOf(Date);
  });
});
