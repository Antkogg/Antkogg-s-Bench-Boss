import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { handleBuilds, handleDisconnect } from '../src/commands/rules.js';
import type { BotContext } from '../src/commands/context.js';
import { WeeklyAvailabilityReminderJob } from '../src/jobs/weekly-availability-reminders.js';
import { RulesService } from '../src/services/rules.service.js';
import { TeamService } from '../src/services/team.service.js';
import { WeeklyAvailabilityService } from '../src/services/weekly-availability.service.js';

function availabilityFixture(status: 'OPEN' | 'LOCKED' = 'OPEN') {
  const audit = vi.fn<(input: unknown) => Promise<object>>(async () => ({}));
  const week = {
    id: 'week-1',
    guildConfigId: 'config-1',
    status,
    games: [
      { id: 'game-1', status: 'SCHEDULED' },
      { id: 'game-2', status: 'SCHEDULED' },
    ],
    submissions: [],
  };
  const player = {
    id: 'player-1',
    guildConfigId: 'config-1',
    teamStatus: 'ROSTER',
  };
  const tx = {
    weeklyAvailabilitySubmission: {
      upsert: vi.fn(async () => ({ id: 'submission-1' })),
    },
    playerGameAvailability: { upsert: vi.fn(async () => ({})) },
    player: { update: vi.fn(async () => player) },
    playerActivity: { create: vi.fn(async () => ({})) },
    auditLog: { create: audit },
  };
  const findMany = vi.fn<(input: unknown) => Promise<never[]>>(async () => []);
  const prisma = {
    seasonWeek: { findUnique: vi.fn(async () => week) },
    player: { findFirst: vi.fn(async () => player), findMany },
    weeklyAvailabilitySubmission: {
      findUnique: vi.fn(async () => ({ id: 'submission-1', responses: [] })),
    },
    auditLog: { create: audit },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  return { service: new WeeklyAvailabilityService(prisma), tx, audit, findMany };
}

describe('weekly availability policy', () => {
  it('rejects player edits after locking but permits and audits a management override', async () => {
    const fixture = availabilityFixture('LOCKED');
    await expect(
      fixture.service.submit({
        guildId: 'guild-1',
        discordUserId: 'discord-1',
        weekId: 'week-1',
        gameIds: ['game-1'],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await fixture.service.submit({
      guildId: 'guild-1',
      discordUserId: 'discord-1',
      weekId: 'week-1',
      gameIds: [],
      actorDiscordId: 'manager-1',
      managementOverride: true,
    });
    expect(fixture.tx.playerGameAvailability.upsert).toHaveBeenCalledTimes(2);
    const auditCall = fixture.audit.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe('AVAILABILITY_MANUAL_EDIT');
  });

  it('uses roster/TC and position filters when finding missing players', async () => {
    const fixture = availabilityFixture();
    await fixture.service.missing('week-1', { teamStatus: 'TC', positionGroup: 'GOALIE' });
    const missingCall = fixture.findMany.mock.calls[0]?.[0] as {
      where: {
        teamStatus: string;
        positionGroup: string;
        weeklyAvailability?: unknown;
      };
    };
    expect(missingCall.where).toMatchObject({
      teamStatus: 'TC',
      positionGroup: 'GOALIE',
    });
  });

  it('persists reminder claims and does not send the same due reminder twice', async () => {
    const now = new Date('2026-09-01T12:00:00Z');
    const claim = { id: 'claim-1', sentAt: null as Date | null, failedAt: null as Date | null };
    const send = vi.fn(async () => true);
    const prisma = {
      seasonWeek: {
        findMany: vi.fn(async () => [
          {
            id: 'week-1',
            label: 'Week 1',
            deadline: new Date('2026-09-01T12:30:00Z'),
            guildConfig: {
              availabilityReminderMinutes: [60],
              tcReminderPolicy: 'DISABLED',
            },
          },
        ]),
      },
      weeklyAvailabilityReminder: {
        upsert: vi.fn(async () => claim),
        update: vi.fn(async ({ data }: { data: { sentAt?: Date } }) => {
          claim.sentAt = data.sentAt ?? null;
          return claim;
        }),
      },
    } as unknown as PrismaClient;
    const availability = {
      missing: vi.fn(async () => [
        { id: 'player-1', discordUserId: 'discord-1', teamStatus: 'ROSTER' },
      ]),
    } as unknown as WeeklyAvailabilityService;
    const job = new WeeklyAvailabilityReminderJob(prisma, availability, {
      availabilityReminder: send,
    } as never);
    await job.tick(now);
    await job.tick(now);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('team and TC history', () => {
  it('records previous and next TC status without replacing scouting history', async () => {
    const activities: unknown[] = [];
    const audits: unknown[] = [];
    const player = {
      id: 'player-1',
      guildConfigId: 'config-1',
      teamStatus: 'TC',
      tcStatus: 'DEVELOPING',
    };
    const tx = {
      player: {
        findUnique: vi.fn(async () => player),
        update: vi.fn(async () => ({ ...player, tcStatus: 'CALL_UP_READY' })),
      },
      playerActivity: {
        create: vi.fn(async (entry: unknown) => {
          activities.push(entry);
          return {};
        }),
      },
      auditLog: {
        create: vi.fn(async (entry: unknown) => {
          audits.push(entry);
          return {};
        }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    await new TeamService(prisma).setTcStatus('player-1', 'CALL_UP_READY', 'manager-1');
    const activity = activities[0] as { data: { details: { from: string; to: string } } };
    expect(activity.data.details).toEqual({ from: 'DEVELOPING', to: 'CALL_UP_READY' });
    expect(audits).toHaveLength(1);
  });
});

describe('official rules library', () => {
  it('versions ingested official text, deactivates older versions, and preserves source metadata', async () => {
    const deactivate = vi.fn(async () => ({ count: 1 }));
    const versionUpsert = vi.fn<(input: unknown) => Promise<{ id: string; versionLabel: string }>>(
      async () => ({ id: 'version-2', versionLabel: 'S55' }),
    );
    const tx = {
      ruleDocument: {
        upsert: vi.fn(async () => ({
          id: 'document-1',
          guildConfigId: 'config-1',
          title: 'Article I',
        })),
      },
      ruleDocumentVersion: { updateMany: deactivate, upsert: versionUpsert },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      guildConfig: { upsert: vi.fn(async () => ({ id: 'config-1' })) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    const result = await new RulesService(prisma).ingest({
      guildId: 'guild-1',
      key: 'article-i',
      title: 'Article I',
      kind: 'CONSTITUTION',
      sourceUrl: 'https://www.leaguegaming.com/rules/article-i.pdf',
      versionLabel: 'S55',
      text: '1 Eligibility\nPlayers must satisfy official eligibility requirements.',
      actorDiscordId: 'manager-1',
    });
    expect(deactivate).toHaveBeenCalledOnce();
    const versionCall = versionUpsert.mock.calls[0]?.[0] as {
      create: { sourceUrl: string; sections: { create: unknown[] } };
    };
    expect(versionCall.create.sourceUrl).toBe('https://www.leaguegaming.com/rules/article-i.pdf');
    expect(versionCall.create.sections.create).toHaveLength(1);
    expect(result.sectionCount).toBe(1);
  });

  it('returns no result when active official sections do not match', async () => {
    const findMany = vi.fn<(input: unknown) => Promise<never[]>>(async () => []);
    const prisma = { ruleSection: { findMany } } as unknown as PrismaClient;
    await expect(new RulesService(prisma).search('guild-1', 'waivers')).resolves.toEqual([]);
    const searchCall = findMany.mock.calls[0]?.[0] as {
      where: { version: { active: boolean } };
    };
    expect(searchCall.where.version.active).toBe(true);
  });

  it.each([
    ['builds', handleBuilds, 'build/trait rules'],
    ['disconnect', handleDisconnect, 'disconnect procedure'],
  ] as const)('shows a clear unavailable state for %s', async (_name, handler, phrase) => {
    const reply = vi.fn<(input: unknown) => Promise<object>>(async () => ({}));
    const interaction = { guildId: 'guild-1', reply } as unknown as ChatInputCommandInteraction;
    const context = {
      rules: {
        ensureCatalog: vi.fn(async () => []),
        getConfigured: vi.fn(async () => null),
      },
    } as unknown as BotContext;
    await handler(interaction, context);
    const payload = reply.mock.calls[0]?.[0] as {
      embeds: Array<{ toJSON(): { description?: string } }>;
    };
    expect(payload.embeds[0]?.toJSON().description?.toLowerCase()).toContain(phrase);
  });
});
