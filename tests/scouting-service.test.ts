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
  const assignments: FakeAssignment[] = [...(options.existing ?? [])];
  const waitlists: FakeWaitlist[] = [];
  const tx = {
    guildConfig: { findUnique: async () => config },
    scoutingSession: { findUnique: async () => session },
    player: {
      findFirst: async ({ where }: { where: { discordUserId?: string } }) =>
        players.find((player) => player.discordUserId === where.discordUserId) ?? null,
      update: async () => players[0],
    },
    playerActivity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
    scoutingAssignment: {
      findUnique: async ({ where }: { where: { sessionId_playerId: { playerId: string } } }) =>
        assignments.find((item) => item.playerId === where.sessionId_playerId.playerId) ?? null,
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
    scoutingSession: {
      findUnique: async () => ({
        ...session,
        guildConfig: config,
        assignments: assignments.map((item) => ({
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
  return { service: new ScoutingService(prisma), assignments, waitlists, session };
}

describe('scouting service signup', () => {
  it('atomically claims an eligible open position', async () => {
    const { service, assignments } = fakeDatabase();
    const result = await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'C',
    });
    expect(result.previousPosition).toBeUndefined();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.position).toBe('C');
  });

  it("rejects a goalie's skater signup server-side", async () => {
    const { service } = fakeDatabase();
    await expect(
      service.signup({ guildId: 'guild1', discordUserId: 'ug', sessionId: 's1', position: 'C' }),
    ).rejects.toMatchObject({ code: 'INELIGIBLE_POSITION' });
  });

  it('returns a switch prompt rather than duplicating an existing signup', async () => {
    const { service, assignments } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    const result = await service.signup({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'RW',
    });
    expect(result.previousPosition).toBe('C');
    expect(assignments).toHaveLength(1);
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

  it('rejects schedule conflicts but permits an audited management override', async () => {
    const conflict = fakeDatabase({ conflicting: true });
    await expect(
      conflict.service.signup({
        guildId: 'guild1',
        discordUserId: 'u1',
        sessionId: 's1',
        position: 'C',
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_CONFLICT' });
    const override = fakeDatabase({ conflicting: true });
    await expect(
      override.service.signup({
        guildId: 'guild1',
        discordUserId: 'u1',
        sessionId: 's1',
        position: 'C',
        conflictOverride: true,
        actorDiscordId: 'manager',
      }),
    ).resolves.toBeDefined();
  });

  it('allows exactly one winner when two players race for the final slot', async () => {
    const { service, assignments } = fakeDatabase();
    const outcomes = await Promise.allSettled([
      service.signup({ guildId: 'guild1', discordUserId: 'u1', sessionId: 's1', position: 'C' }),
      service.signup({ guildId: 'guild1', discordUserId: 'u2', sessionId: 's1', position: 'C' }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(assignments.filter((item) => item.position === 'C')).toHaveLength(1);
  });

  it('switches position transactionally without creating a second assignment', async () => {
    const { service, assignments } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    await service.switchPosition({
      guildId: 'guild1',
      discordUserId: 'u1',
      sessionId: 's1',
      position: 'RW',
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.position).toBe('RW');
  });

  it('leaving releases the assignment', async () => {
    const { service, assignments } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    await service.leave('guild1', 'u1', 's1');
    expect(assignments).toHaveLength(0);
  });

  it('uses one position-group queue and promotes its first compatible player', async () => {
    const { service, waitlists } = fakeDatabase({
      existing: [
        { id: 'a1', sessionId: 's1', playerId: 'p1', team: 'TEAM_1', position: 'C', slotIndex: 0 },
      ],
    });
    await service.joinWaitlist('guild1', 'u2', 's1', 'FORWARD', 'RW');
    const result = await service.leave('guild1', 'u1', 's1');
    expect(result.offeredWaitlistId).toBe(waitlists[0]?.id);
    expect(waitlists[0]).toMatchObject({ status: 'OFFERED', offeredPosition: 'C' });
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
