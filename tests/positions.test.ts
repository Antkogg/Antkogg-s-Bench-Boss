import { describe, expect, it, vi } from 'vitest';
import type {
  PositionGroup,
  ScoutingPosition,
  SignupPosition,
} from '../src/generated/prisma/enums.js';
import { eligiblePositions, groupForSignupPositions, isEligible } from '../src/domain/positions.js';

describe('position eligibility', () => {
  const cases: Array<[SignupPosition, PositionGroup, readonly ScoutingPosition[]]> = [
    ['LW', 'FORWARD', ['LW', 'C', 'RW']],
    ['C', 'FORWARD', ['LW', 'C', 'RW']],
    ['RW', 'FORWARD', ['LW', 'C', 'RW']],
    ['LD', 'DEFENSE', ['LD', 'RD']],
    ['RD', 'DEFENSE', ['LD', 'RD']],
    ['G', 'GOALIE', ['G']],
  ];

  it.each(cases)('%s maps to %s and its complete eligible set', (signup, group, positions) => {
    // For tests with single positions, wrap in array since groupForSignupPositions takes an array now
    const signupArray = [signup];
    expect(groupForSignupPositions(signupArray)).toBe(group);
    expect(eligiblePositions(group)).toEqual(positions);
  });

  it.each(['FORWARD', 'DEFENSE', 'GOALIE'] as const)(
    'accepts only positions in the %s group',
    (group) => {
      const all: ScoutingPosition[] = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
      for (const position of all)
        expect(isEligible(group, position)).toBe(eligiblePositions(group).includes(position));
    },
  );
});

describe('renderRosterPositionsPanel', () => {
  it('splits position buttons across multiple rows so no action row exceeds 5 components', async () => {
    const { renderRosterPositionsPanel } = await import('../src/commands/management.js');

    const fakeMember = {
      id: '1234567890',
      displayName: 'TestPlayer',
      user: { username: 'TestPlayer' },
    } as any;

    const fakePlayer = {
      id: 'player-1',
      discordUserId: '1234567890',
      displayName: 'TestPlayer',
      signupPositions: [],
    } as any;

    const panel = renderRosterPositionsPanel('role-123', [{ member: fakeMember, player: fakePlayer }], '1234567890');

    expect(panel.components.length).toBe(4); // 2 position button rows + 1 nav row + 1 select row
    for (const row of panel.components) {
      expect(row.components.length).toBeLessThanOrEqual(5);
      expect(row.components.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('correctly parses mentions and names in applyRosterLines', async () => {
    const { applyRosterLines } = await import('../src/commands/management.js');

    const updatePositionsMock = vi.fn().mockResolvedValue({});
    const contextMock = {
      players: {
        updatePositions: updatePositionsMock,
        search: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const fakeGuild = {
      id: 'guild-1',
      members: {
        cache: new Map([
          ['111111111111111111', { id: '111111111111111111', displayName: 'PlayerOne', user: { username: 'p1' } }],
          ['222222222222222222', { id: '222222222222222222', displayName: 'PlayerTwo', user: { username: 'p2' } }],
        ]),
        fetch: vi.fn(),
      },
    } as any;

    const raw = `<@111111111111111111> C\nPlayerTwo: LW`;
    const res = await applyRosterLines(fakeGuild, contextMock, raw);

    expect(res.results.length).toBe(2);
    expect(res.errors.length).toBe(0);
    expect(updatePositionsMock).toHaveBeenCalledWith('guild-1', '111111111111111111', ['C'], 'PlayerOne');
    expect(updatePositionsMock).toHaveBeenCalledWith('guild-1', '222222222222222222', ['LW'], 'PlayerTwo');
  });
});

