import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { localScheduleToUtc, parseFlexibleDate } from '../src/domain/schedule-time.js';
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

  it('adds an individual game with opponent team name, date, and time', async () => {
    const create = vi.fn(
      async ({
        data,
      }: {
        data: {
          opponentNameSnapshot: string;
          homeAway: string;
          scheduledAtUtc: Date;
        };
      }) => ({ id: 'game-new', ...data }),
    );
    const week = {
      id: 'week-1',
      guildConfigId: 'config-1',
      seasonId: null,
      guildConfig: { guildId: 'guild-1' },
      games: [],
    };
    const tx = {
      opponent: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { name: string } }) => ({
          id: 'opp-1',
          name: data.name,
        })),
      },
      weeklyGame: { create },
      seasonWeek: { findUniqueOrThrow: vi.fn(async () => week) },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      managementProfile: { findFirst: vi.fn(async () => ({ timezone: 'America/Edmonton' })) },
      seasonWeek: { findUnique: vi.fn(async () => week) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    await new ScheduleService(prisma).addGame({
      guildId: 'guild-1',
      weekId: 'week-1',
      opponent: 'Boston University',
      date: '2026-10-04',
      time: '8:30 PM',
      homeAway: 'AWAY',
      actorDiscordId: 'manager-1',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opponentNameSnapshot: 'Boston University',
          homeAway: 'AWAY',
          scheduledAtUtc: new Date('2026-10-05T02:30:00.000Z'),
        }),
      }),
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

  it('sends 3-hour pre-game reminders to confirmed players and deduplicates', async () => {
    const claim = { id: 'claim-1', sentAt: null as Date | null, failedAt: null as Date | null };
    const sendReminder = vi.fn(async () => true);
    const game = {
      id: 'game-1',
      scheduledAtUtc: new Date('2026-09-01T21:00:00Z'),
      opponentNameSnapshot: 'Montreal',
      homeAway: 'HOME',
      lineup: [
        {
          id: 'assign-1',
          confirmed: true,
          position: 'LW',
          player: { discordUserId: 'player-lw' },
        },
      ],
      week: { guildConfig: { managementChannelId: 'channel-1', serverCodeReminderMinutes: 60 } },
    };
    const prisma = {
      gameLineupAssignment: { findMany: vi.fn(async () => []) },
      weeklyGame: {
        findMany: vi.fn(async (args?: { where?: { lineup?: unknown } }) => {
          if (args?.where?.lineup) return [game];
          return [];
        }),
      },
      gameManagementReminder: {
        upsert: vi.fn(async () => claim),
        update: vi.fn(async ({ data }: { data: { sentAt?: Date } }) => {
          claim.sentAt = data.sentAt ?? null;
          return claim;
        }),
      },
    } as unknown as PrismaClient;
    const job = new GameDayReminderJob(prisma, { gameReminder: sendReminder } as never);
    const now = new Date('2026-09-01T18:00:00Z');
    await job.tick(now);
    await job.tick(now);
    expect(sendReminder).toHaveBeenCalledOnce();
    expect(sendReminder).toHaveBeenCalledWith('player-lw', game, 'LW');
  });

  it('allows manager to confirm lineup with the players that are available', async () => {
    const assignments = [
      { id: 'assign-1', position: 'LW', playerId: 'p1', confirmed: false, player: { id: 'p1', eaTag: 'Tag1' } },
      { id: 'assign-2', position: 'C', playerId: 'p2', confirmed: false, player: { id: 'p2', eaTag: 'Tag2' } },
    ];
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const game = { id: 'game-1', week: { guildConfigId: 'config-1' } };
    const tx = {
      gameLineupAssignment: {
        findMany: vi.fn(async () => assignments),
        updateMany,
      },
      weeklyGame: { findUniqueOrThrow: vi.fn(async () => game) },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      weeklyGame: { findFirst: vi.fn(async () => game) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    const scheduleService = new ScheduleService(prisma);
    const result = await scheduleService.confirmLineup('guild-1', 'game-1', 'manager-1');
    expect(result.newlyConfirmed).toHaveLength(2);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { gameId: 'game-1' } }));
  });

  it('parses flexible dates correctly', () => {
    // Fixed base date: Monday, Sep 28, 2026
    const baseNow = DateTime.fromISO('2026-09-28T12:00:00', { zone: 'America/New_York' });
    expect(parseFlexibleDate('Today', 'America/New_York', baseNow)).toBe('2026-09-28');
    expect(parseFlexibleDate('Tomorrow', 'America/New_York', baseNow)).toBe('2026-09-29');
    expect(parseFlexibleDate('Sunday', 'America/New_York', baseNow)).toBe('2026-10-04');
    expect(parseFlexibleDate('Monday', 'America/New_York', baseNow)).toBe('2026-09-28');
    expect(parseFlexibleDate('Tuesday', 'America/New_York', baseNow)).toBe('2026-09-29');
    expect(parseFlexibleDate('10/04', 'America/New_York', baseNow)).toBe('2026-10-04');
    expect(parseFlexibleDate('2026-10-04', 'America/New_York', baseNow)).toBe('2026-10-04');
    expect(parseFlexibleDate('Oct 4th', 'America/New_York', baseNow)).toBe('2026-10-04');
  });

  it('falls back to America/New_York when management timezone is not set', async () => {
    const prisma = {
      managementProfile: { findFirst: vi.fn(async () => null) },
      guildConfig: { findUnique: vi.fn(async () => null) },
    } as unknown as PrismaClient;
    const service = new ScheduleService(prisma);
    const tz = await service.managementTimezone('guild-1', 'manager-1');
    expect(tz).toBe('America/New_York');
  });

  it('auto-creates a week when adding a game if no week exists', async () => {
    const createWeek = vi.fn(async ({ data }: any) => ({
      id: 'auto-week-1',
      guildConfigId: 'config-1',
      seasonId: 'season-1',
      games: [],
      ...data,
    }));
    const createGame = vi.fn(async ({ data }: any) => ({
      id: 'game-1',
      ...data,
    }));
    const tx = {
      season: {
        findFirst: vi.fn(async () => ({ id: 'season-1', number: 1 })),
      },
      seasonWeek: {
        findFirst: vi.fn(async () => null),
        create: createWeek,
        findUniqueOrThrow: vi.fn(async () => ({
          id: 'auto-week-1',
          guildConfigId: 'config-1',
          seasonId: 'season-1',
          games: [{ id: 'game-1', opponentNameSnapshot: 'Leafs', homeAway: 'HOME' }],
        })),
      },
      opponent: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => ({ id: 'opp-1', name: data.name })),
      },
      weeklyGame: {
        create: createGame,
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
    };
    const prisma = {
      managementProfile: { findFirst: vi.fn(async () => null) },
      guildConfig: { findUnique: vi.fn(async () => null) },
      seasonWeek: { findFirst: vi.fn(async () => null) },
      $transaction: async (cb: any) => cb(tx),
    } as unknown as PrismaClient;

    const service = new ScheduleService(prisma);
    const result = await service.addGame({
      guildId: 'guild-1',
      opponent: 'Leafs',
      date: '2026-10-04',
      time: '8:30 PM',
      actorDiscordId: 'manager-1',
    });

    expect(createWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OPEN',
        }),
      }),
    );
    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          opponentNameSnapshot: 'Leafs',
        }),
      }),
    );
    expect(result.id).toBe('auto-week-1');
  });

  it('assigns an entire night lineup to all games of that night in a single operation', async () => {
    const sundayGame1 = {
      id: 'g-sun-1',
      scheduledAtUtc: new Date('2026-10-04T21:00:00-04:00'),
      status: 'SCHEDULED',
    };
    const sundayGame2 = {
      id: 'g-sun-2',
      scheduledAtUtc: new Date('2026-10-04T21:35:00-04:00'),
      status: 'SCHEDULED',
    };
    const week = {
      id: 'week-1',
      label: 'Week 1',
      guildConfig: { id: 'cfg-1', guildId: 'guild-1', timezone: 'America/New_York' },
      games: [sundayGame1, sundayGame2],
    };

    const deleteMany = vi.fn(async () => ({ count: 0 }));
    const create = vi.fn(async () => ({}));
    const findFirstAvail = vi.fn(async () => ({ status: 'AVAILABLE' }));

    const tx = {
      gameLineupAssignment: { deleteMany, create },
      playerGameAvailability: { findFirst: findFirstAvail },
      auditLog: { create: vi.fn(async () => ({})) },
    };

    const prisma = {
      guildConfig: { upsert: vi.fn(async () => ({ id: 'cfg-1', timezone: 'America/New_York' })) },
      seasonWeek: { findUnique: vi.fn(async () => week) },
      $transaction: async (cb: any) => cb(tx),
    } as unknown as PrismaClient;

    const service = new ScheduleService(prisma);
    const result = await service.assignNightLineup({
      guildId: 'guild-1',
      weekId: 'week-1',
      day: 'SUNDAY',
      lineup: {
        LW: 'player-lw',
        C: 'player-c',
        RW: 'player-rw',
        LD: 'player-ld',
        RD: 'player-rd',
        G: 'player-g',
      },
      actorDiscordId: 'manager-1',
    });

    expect(result.gamesUpdated).toBe(2);
    // 2 games * 6 positions = 12 creates
    expect(create).toHaveBeenCalledTimes(12);
  });

  it('retrieves personalized player weekly schedule with grouped games', async () => {
    const sundayGame = {
      id: 'g-1',
      scheduledAtUtc: new Date('2026-10-04T21:00:00-04:00'),
      status: 'SCHEDULED',
      opponentNameSnapshot: 'Leafs',
      homeAway: 'HOME',
      gameServer: 'East 1',
      gameCode: 'ABC',
      lineup: [{ playerId: 'player-1', position: 'LW' }],
    };
    const week = {
      id: 'week-1',
      label: 'Week 1',
      guildConfig: { id: 'cfg-1', guildId: 'guild-1', timezone: 'America/New_York' },
      games: [sundayGame],
    };

    const prisma = {
      guildConfig: {
        findUnique: vi.fn(async () => ({ id: 'cfg-1', timezone: 'America/New_York' })),
        upsert: vi.fn(async () => ({ id: 'cfg-1', timezone: 'America/New_York' })),
      },
      seasonWeek: { findUnique: vi.fn(async () => week) },
      player: {
        findFirst: vi.fn(async () => ({
          id: 'player-1',
          discordUserId: 'user-1',
          gamertagSnapshot: 'PlayerOne',
        })),
      },
    } as unknown as PrismaClient;

    const service = new ScheduleService(prisma);
    const schedule = await service.getPlayerWeeklySchedule('guild-1', 'user-1', 'week-1');

    expect(schedule).not.toBeNull();
    expect(schedule?.totalGames).toBe(1);
    expect(schedule?.assignedGames[0]?.position).toBe('LW');
    expect(schedule?.assignedGames[0]?.day).toBe('SUNDAY');
  });

  it('locks weekly lines and produces DM delivery breakdown for scheduled players', async () => {
    const game1 = {
      id: 'g-1',
      status: 'SCHEDULED',
      lineup: [
        {
          position: 'LW',
          playerId: 'p-1',
          player: { id: 'p-1', discordUserId: 'user-1', gamertagSnapshot: 'User1' },
        },
        {
          position: 'C',
          playerId: 'p-2',
          player: { id: 'p-2', discordUserId: 'user-2', gamertagSnapshot: 'User2' },
        },
      ],
    };
    const week = {
      id: 'week-1',
      label: 'Week 1',
      guildConfig: { id: 'cfg-1', guildId: 'guild-1' },
      games: [game1],
    };

    const updateMany = vi.fn(async () => ({ count: 2 }));
    const updateWeek = vi.fn(async () => ({ id: 'week-1', status: 'LOCKED' }));

    const tx = {
      gameLineupAssignment: { updateMany },
      seasonWeek: { update: updateWeek },
      auditLog: { create: vi.fn(async () => ({})) },
    };

    const prisma = {
      guildConfig: { upsert: vi.fn(async () => ({ id: 'cfg-1', guildId: 'guild-1' })) },
      seasonWeek: { findUnique: vi.fn(async () => week) },
      $transaction: async (cb: any) => cb(tx),
    } as unknown as PrismaClient;

    const service = new ScheduleService(prisma);
    const locked = await service.lockWeeklyLines('guild-1', 'week-1', 'manager-1');

    expect(locked.openSpots).toBe(4); // 6 positions - 2 filled = 4 open
    expect(locked.deliveries).toHaveLength(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confirmed: true }),
      }),
    );
    expect(updateWeek).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'LOCKED' }),
      }),
    );
  });
});

