import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient, SeasonWeek, WeeklyGame } from '../src/generated/prisma/client.js';
import { commandDefinitions } from '../src/commands/definitions.js';
import { renderWeeklyAvailability } from '../src/renderers/weekly-availability.renderer.js';
import { chunkRuleText, OFFICIAL_RULE_CATALOG } from '../src/services/rules.service.js';
import { WeeklyAvailabilityService } from '../src/services/weekly-availability.service.js';

describe("Antkogg's LG Assistant expansion", () => {
  it('registers the complete player, team, TC, rules, and announcement command surface', () => {
    const names = commandDefinitions.map((command) => command.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'profile',
        'scouting',
        'availability',
        'timezone',
        'week',
        'schedule',
        'game',
        'team',
        'tc',
        'rules',
        'rule',
        'builds',
        'disconnect',
        'announce',
      ]),
    );
  });

  it('chunks imported official text into named, searchable sections', () => {
    const chunks = chunkRuleText(
      `1 General Rules\nOfficial opening text.\n1.1 Eligibility\nPlayers must be eligible.\n1.2 Scheduling\nGames use league time.`,
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[1]).toMatchObject({ sectionKey: '1.1', title: 'Eligibility' });
    expect(chunks[1]?.searchText).toContain('players must be eligible');
    expect(
      OFFICIAL_RULE_CATALOG.filter((document) => document.kind === 'CONSTITUTION'),
    ).toHaveLength(4);
  });

  it('only shows weekly submission controls while availability is open', () => {
    const week = {
      id: 'week-1',
      label: 'Week 1',
      deadline: new Date('2026-09-01T01:00:00Z'),
      status: 'OPEN',
      games: [
        {
          id: 'game-1',
          label: 'Game 1',
          opponentNameSnapshot: 'Toronto',
          scheduledAtUtc: new Date('2026-09-02T01:00:00Z'),
          status: 'SCHEDULED',
        },
      ],
    } as unknown as SeasonWeek & { games: WeeklyGame[] };
    expect(renderWeeklyAvailability(week).components).toHaveLength(1);
    expect(renderWeeklyAvailability({ ...week, status: 'LOCKED' }).components).toHaveLength(0);
  });

  it('deduplicates game selections inside one atomic availability submission', async () => {
    const availabilityUpsert = vi.fn<
      (input: {
        create: { submissionId: string; gameId: string; status: string };
      }) => Promise<object>
    >(async () => ({}));
    const tx = {
      weeklyAvailabilitySubmission: {
        upsert: vi.fn(async () => ({ id: 'submission-1' })),
      },
      playerGameAvailability: { upsert: availabilityUpsert },
      player: { update: vi.fn(async () => ({})) },
      playerActivity: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      seasonWeek: {
        findUnique: vi.fn(async () => ({
          id: 'week-1',
          guildConfigId: 'config-1',
          status: 'OPEN',
          games: [
            { id: 'game-1', status: 'SCHEDULED' },
            { id: 'game-2', status: 'SCHEDULED' },
          ],
          submissions: [],
        })),
      },
      player: {
        findFirst: vi.fn(async () => ({
          id: 'player-1',
          guildConfigId: 'config-1',
          teamStatus: 'ROSTER',
        })),
      },
      weeklyAvailabilitySubmission: {
        findUnique: vi.fn(async () => ({ id: 'submission-1' })),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;
    const service = new WeeklyAvailabilityService(prisma);
    await service.submit({
      guildId: 'guild-1',
      discordUserId: 'discord-1',
      weekId: 'week-1',
      gameIds: ['game-1', 'game-1', 'game-2'],
    });
    expect(availabilityUpsert).toHaveBeenCalledTimes(2);
    expect(availabilityUpsert.mock.calls.map((call) => call[0].create)).toEqual([
      expect.objectContaining({
        submissionId: 'submission-1',
        gameId: 'game-1',
        status: 'AVAILABLE',
      }),
      expect.objectContaining({
        submissionId: 'submission-1',
        gameId: 'game-2',
        status: 'AVAILABLE',
      }),
    ]);
  });
});
