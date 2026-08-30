import { describe, expect, it } from 'vitest';
import type { PrismaClient, ScoutingPosition } from '../src/generated/prisma/client.js';
import { ScoutingService } from '../src/services/scouting.service.js';

interface FakeAssignment {
  id: string;
  sessionId: string;
  playerId: string;
  team: 'TEAM_1' | 'TEAM_2';
  position: ScoutingPosition;
  slotIndex: number;
}

interface FakeWaitlist {
  id: string;
  sessionId: string;
  playerId: string;
  positionGroup: 'FORWARD' | 'DEFENSE' | 'GOALIE';
  preferredPosition: ScoutingPosition | null;
  offeredPosition: ScoutingPosition | null;
  queueOrder: number;
  status: string;
  offerToken: string | null;
  offerExpiresAt: Date | null;
}

function fakeDatabase(
  options: {
    status?: string;
    signupsOpen?: boolean;
    existing?: FakeAssignment[];
    conflicting?: boolean;
  } = {},
) {
  const session = {
    id: 's1',
    guildConfigId: 'g1',
    startsAt: new Date('2026-08-20T01:00:00Z'),
    durationMinutes: 60,
    format: 'ONE_SIDE',
    signupMode: 'OPEN_SIGNUP',
    status: options.status ?? 'OPEN',
    signupsOpen: options.signupsOpen ?? true,
    note: null,
    channelId: null,
    messageId: null,
    createdByDiscordId: 'manager',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const config = {
    id: 'g1',
    guildId: 'guild1',
    timezone: 'America/New_York',
    reminderMinutes: [60, 15],
  };
  const players = [
    {
      id: 'p1',
      guildConfigId: 'g1',
      discordUserId: 'u1',
      registered: true,
      positionGroup: 'FORWARD',
      eaTag: 'Forward One',
    },
    {
      id: 'p2',
      guildConfigId: 'g1',
      discordUserId: 'u2',
      registered: true,
      positionGroup: 'FORWARD',
      eaTag: 'Forward Two',
    },
    {
      id: 'gk',
      guildConfigId: 'g1',
      discordUserId: 'ug',
      registered: true,
      positionGroup: 'GOALIE',
      eaTag: 'Goalie',
    },
  ];
  const availabilities: { id: string; sessionId: string; playerId: string; position: ScoutingPosition | null }[] = [];
  const assignments: FakeAssignment[] = [...(options.existing ?? [])];
  const waitlists: FakeWaitlist[] = [];
  const tx = {
    guildConfig: { findUnique: async () => config, upsert: async () => config },
    scoutingSession: { findUnique: async () => session },
    availability: {
      findUnique: async ({ where }: { where: { sessionId_playerId: { playerId: string } } }) =>
        availabilities.find((item) => item.playerId === where.sessionId_playerId.playerId) ?? null,
      create: async ({ data }: any) => {
        const item = { id: `av${availabilities.length + 1}`, ...data };
        availabilities.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = availabilities.find((a) => a.id === where.id)!;
        Object.assign(item, data);
        return item;
      },
      delete: async ({ where }: any) => {
        const idx = availabilities.findIndex((a) => a.id === where.id);
        return availabilities.splice(idx, 1)[0];
      },
    },
    player: {
      findFirst: async ({ where }: { where: { discordUserId?: string } }) =>
        players.find((player) => player.discordUserId === where.discordUserId) ?? null,
      update: async () => players[0],
    },
    playerActivity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
    scoutingAssignment: {
      findUnique: async ({ where }: { where: { sessionId_playerId: { playerId: string } } }) =>
        assignments.find((item) => item.playerId === where.sessionId_playerId?.playerId) ?? null,
      findMany: async ({
        where,
      }: {
        where: { playerId?: string; position?: ScoutingPosition };
      }) => {
        if (where.playerId && options.conflicting)
          return [
            {
              ...assignments[0],
              session: { ...session, id: 'conflict', startsAt: new Date('2026-08-20T01:30:00Z') },
            },
          ];
        return assignments.filter((item) => !where.position || item.position === where.position);
      },
      upsert: async ({ create, update, where }: any) => {
        const existing = assignments.find((item) => item.playerId === where.sessionId_playerId?.playerId || item.id === where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create, id: `a${assignments.length + 1}`, slotIndex: 0 };
        assignments.push(created);
        return created;
      },
      create: async ({ data }: { data: FakeAssignment }) => {
        if (
          assignments.some(
            (item) =>
              item.team === data.team && item.position === data.position && item.slotIndex === 0,
          )
        )
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        const created = { ...data, id: `a${assignments.length + 1}`, slotIndex: 0 };
        assignments.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeAssignment> }) => {
        const item = assignments.find((assignment) => assignment.id === where.id)!;
        Object.assign(item, data);
        return item;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = assignments.findIndex((assignment) => assignment.id === where.id);
        return assignments.splice(index, 1)[0];
      },
    },
    waitlistEntry: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async ({ where }: { where: { sessionId_playerId: { playerId: string } } }) =>
        waitlists.find((entry) => entry.playerId === where.sessionId_playerId.playerId) ?? null,
      findFirst: async () =>
        waitlists
          .filter((entry) => entry.status === 'WAITING')
          .sort((left, right) => left.queueOrder - right.queueOrder)[0] ?? null,
      aggregate: async () => ({
        _max: { queueOrder: Math.max(0, ...waitlists.map((entry) => entry.queueOrder)) },
      }),
      upsert: async ({
        create,
      }: {
        create: Omit<
          FakeWaitlist,
          'id' | 'status' | 'offeredPosition' | 'offerToken' | 'offerExpiresAt'
        >;
      }) => {
        const entry: FakeWaitlist = {
          ...create,
          id: `w${waitlists.length + 1}`,
          status: 'WAITING',
          offeredPosition: null,
          offerToken: null,
          offerExpiresAt: null,
        };
        waitlists.push(entry);
        return entry;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeWaitlist> }) => {
        const entry = waitlists.find((item) => item.id === where.id)!;
        Object.assign(entry, data);
        return entry;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    guildConfig: tx.guildConfig,
    availability: tx.availability,
    player: tx.player,
    playerActivity: tx.playerActivity,
    scoutingAssignment: tx.scoutingAssignment,
    scoutingSession: {
      findUnique: async () => ({
        ...session,
        guildConfig: config,
        assignments: assignments.map((item) => ({
          ...item,
          player: players.find((player) => player.id === item.playerId),
        })),
        availability: availabilities.map((item) => ({
          ...item,
          player: players.find((player) => player.id === item.playerId),
        })),
        waitlists: waitlists.map((entry) => ({
          ...entry,
          player: players.find((player) => player.id === entry.playerId),
        })),
      }),
      update: async ({ data }: { data: { status?: string; signupsOpen?: boolean } }) => {
        Object.assign(session, data);
        return session;
      },
    },
    auditLog: { create: async () => ({}) },
  } as unknown as PrismaClient;
  return { service: new ScoutingService(prisma), assignments, availabilities, waitlists, session };
}

describe('scouting service signup', () => {
  it('adds player to the signup pool for a position', async () => {
    const { service, availabilities } = fakeDatabase();
    const result = await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'C',
    });
    expect(result.action).toBe('added');
    expect(result.position).toBe('C');
    expect(availabilities).toHaveLength(1);
    expect(availabilities[0]?.position).toBe('C');
  });

  it('switches pool position when signing up for a different position', async () => {
    const { service, availabilities } = fakeDatabase();
    await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'C',
    });
    const result = await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'RW',
    });
    expect(result.action).toBe('switched');
    expect(result.position).toBe('RW');
    expect(availabilities[0]?.position).toBe('RW');
  });

  it('toggles player off when clicking the same position again', async () => {
    const { service, availabilities } = fakeDatabase();
    await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'C',
    });
    const result = await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'C',
    });
    expect(result.action).toBe('removed');
    expect(availabilities).toHaveLength(0);
  });

  it.each([
    [{ status: 'LOCKED' }, 'SESSION_LOCKED'],
    [{ status: 'IN_PROGRESS' }, 'SESSION_ENDED'],
    [{ status: 'OPEN', signupsOpen: false }, 'SIGNUPS_CLOSED'],
  ] as const)('rejects unavailable session state', async (options, code) => {
    const { service } = fakeDatabase(options);
    await expect(
      service.signup({ guildId: 'guild1', discordUserId: 'u1', sessionId: 's1', position: 'C' }),
    ).rejects.toMatchObject({ code });
  });

  it('allows management to confirm a player into starting lineup', async () => {
    const { service, assignments } = fakeDatabase();
    await service.assignLineupPlayer({
      guildId: 'guild1',
      sessionId: 's1',
      discordUserId: 'u1',
      position: 'C',
      actorDiscordId: 'manager',
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.position).toBe('C');
  });

  it('rejects schedule conflicts during management lineup assignment unless overridden', async () => {
    const conflict = fakeDatabase({ conflicting: true });
    await expect(
      conflict.service.assignLineupPlayer({
        guildId: 'guild1',
        sessionId: 's1',
        discordUserId: 'u1',
        position: 'C',
        actorDiscordId: 'manager',
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_CONFLICT' });

    const override = fakeDatabase({ conflicting: true });
    await expect(
      override.service.assignLineupPlayer({
        guildId: 'guild1',
        sessionId: 's1',
        discordUserId: 'u1',
        position: 'C',
        conflictOverride: true,
        actorDiscordId: 'manager',
      }),
    ).resolves.toBeDefined();
  });

  it('leaving releases the confirmed assignment', async () => {
    const { service, assignments } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    await service.leave('guild1', 'u1', 's1');
    expect(assignments).toHaveLength(0);
  });

  it('starts a partial lineup without requiring full capacity', async () => {
    const { service, session } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    await service.setStatus('s1', 'IN_PROGRESS', 'manager');
    expect(session.status).toBe('IN_PROGRESS');
  });
});
