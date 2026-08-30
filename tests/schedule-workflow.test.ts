import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { localScheduleToUtc } from '../src/domain/schedule-time.js';
import { discordTimestamp } from '../src/renderers/design.js';
import { GameDayReminderJob } from '../src/jobs/game-day-reminders.js';
import { ScheduleService } from '../src/services/schedule.service.js';
import { WeeklyAvailabilityService } from '../src/services/weekly-availability.service.js';

describe('regular-season scheduling workflow', () => {
  it('stores local manager times as correct UTC through Mountain DST', () => {
    const winter = localScheduleToUtc('2026-01-11', '8:30 PM', 'America/Edmonton');
    const summer = localScheduleToUtc('2026-07-12', '8:30 PM', 'America/Edmonton');
    expect(winter.toISOString()).toBe('2026-01-12T03:30:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-13T02:30:00.000Z');
    expect(discordTimestamp(summer, 'F')).toBe('<t:1783909800:F>');
  });

  it('treats a game added after submission as NO RESPONSE', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 'player-1',
        weeklyAvailability: [{ responses: [{ gameId: 'game-1', status: 'AVAILABLE' }] }],
      },
    ]);
    const service = new WeeklyAvailabilityService({
      seasonWeek: {
        findUnique: vi.fn(async () => ({
          id: 'week-1',
          guildConfigId: 'config-1',
          games: [
            { id: 'game-1', status: 'SCHEDULED' },
            { id: 'game-2', status: 'SCHEDULED' },
          ],
        })),
      },
      player: { findMany },
    } as unknown as PrismaClient);
    await expect(service.missing('week-1')).resolves.toHaveLength(1);
  });

  it('edits opponent/time in place so responses remain attached to the game ID', async () => {
    const original = new Date('2026-09-07T02:30:00Z');
    const update = vi.fn(
      async ({
        data,
      }: {
        data: { scheduledAtUtc: Date; opponentNameSnapshot: string | null; homeAway: string };
      }) => ({ id: 'game-1', ...data }),
    );
    const week = {
      id: 'week-1',
      guildConfigId: 'config-1',
      seasonId: null,
      guildConfig: { guildId: 'guild-1' },
      games: [
        {
          id: 'game-1',
          label: 'Sunday Game 1',
          scheduledAtUtc: original,
          opponentNameSnapshot: null,
          homeAway: null,
        },
      ],
    };
    const tx = {
      weeklyGame: { update },
      seasonWeek: { findUniqueOrThrow: vi.fn(async () => week) },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      managementProfile: { findFirst: vi.fn(async () => ({ timezone: 'America/Edmonton' })) },
      seasonWeek: { findUnique: vi.fn(async () => week) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    await new ScheduleService(prisma).updateDay(
      'guild-1',
      'week-1',
      'SUNDAY',
      [{ opponent: null, homeAway: 'HOME', time: '9:00 PM' }],
      'manager-1',
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'game-1' } }));
    expect(update.mock.calls[0]?.[0].data.scheduledAtUtc.toISOString()).toBe(
      '2026-09-07T03:00:00.000Z',
    );
  });

  it('persists and deduplicates the one-hour missing-code reminder', async () => {
    const claim = { id: 'reminder-1', sentAt: null as Date | null, failedAt: null as Date | null };
    const send = vi.fn(async () => 'message-1');
    const prisma = {
      gameLineupAssignment: { findMany: vi.fn(async () => []) },
      weeklyGame: {
        findMany: vi.fn(async () => [
          {
            id: 'game-1',
            scheduledAtUtc: new Date('2026-09-01T13:00:00Z'),
            opponentNameSnapshot: 'Toronto',
            week: {
              guildConfig: { managementChannelId: 'channel-1', serverCodeReminderMinutes: 60 },
            },
          },
        ]),
      },
      gameManagementReminder: {
        upsert: vi.fn(async () => claim),
        update: vi.fn(async ({ data }: { data: { sentAt?: Date } }) => {
          claim.sentAt = data.sentAt ?? null;
          return claim;
        }),
      },
    } as unknown as PrismaClient;
    const job = new GameDayReminderJob(prisma, { serverCodeMissing: send } as never);
    const now = new Date('2026-09-01T12:00:00Z');
    await job.tick(now);
    await job.tick(now);
    expect(send).toHaveBeenCalledOnce();
  });
});
