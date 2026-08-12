import { describe, expect, it } from 'vitest';
import {
  capacity,
  lineupSlots,
  remainingByGroup,
  statusAllowsSignup,
  timeRangesOverlap,
} from '../src/domain/scouting.js';

describe('scouting domain', () => {
  it('creates six unique one-side slots and twelve private slots', () => {
    expect(lineupSlots('ONE_SIDE')).toHaveLength(6);
    expect(
      new Set(lineupSlots('ONE_SIDE').map((slot) => `${slot.team}:${slot.position}`)).size,
    ).toBe(6);
    expect(lineupSlots('PRIVATE_6V6')).toHaveLength(12);
    expect(capacity('ONE_SIDE')).toBe(6);
    expect(capacity('PRIVATE_6V6')).toBe(12);
  });

  it('allows partial lineups and reports remaining groups', () => {
    expect(remainingByGroup('ONE_SIDE', ['LW', 'C', 'LD', 'G'])).toEqual({
      FORWARD: 1,
      DEFENSE: 1,
      GOALIE: 0,
    });
  });

  it('only allows signup to open sessions with open signups', () => {
    expect(statusAllowsSignup('OPEN', true)).toBe(true);
    for (const status of ['LOCKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const)
      expect(statusAllowsSignup(status, true)).toBe(false);
    expect(statusAllowsSignup('OPEN', false)).toBe(false);
  });

  it('detects overlapping ranges but permits touching boundaries', () => {
    const nine = new Date('2026-08-20T01:00:00Z');
    const nineThirty = new Date('2026-08-20T01:30:00Z');
    const ten = new Date('2026-08-20T02:00:00Z');
    expect(timeRangesOverlap(nine, 60, nineThirty, 60)).toBe(true);
    expect(timeRangesOverlap(nine, 60, ten, 60)).toBe(false);
  });
});
