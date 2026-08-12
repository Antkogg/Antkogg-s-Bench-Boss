import { describe, expect, it } from 'vitest';
import type {
  PositionGroup,
  ScoutingPosition,
  SignupPosition,
} from '../src/generated/prisma/enums.js';
import { eligiblePositions, groupForSignupPosition, isEligible } from '../src/domain/positions.js';

describe('position eligibility', () => {
  const cases: Array<[SignupPosition, PositionGroup, readonly ScoutingPosition[]]> = [
    ['LW', 'FORWARD', ['LW', 'C', 'RW']],
    ['C', 'FORWARD', ['LW', 'C', 'RW']],
    ['RW_F', 'FORWARD', ['LW', 'C', 'RW']],
    ['LD', 'DEFENSE', ['LD', 'RD']],
    ['RD', 'DEFENSE', ['LD', 'RD']],
    ['G', 'GOALIE', ['G']],
  ];

  it.each(cases)('%s maps to %s and its complete eligible set', (signup, group, positions) => {
    expect(groupForSignupPosition(signup)).toBe(group);
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
