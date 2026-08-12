import type { PositionGroup, ScoutingPosition, SignupPosition } from '../generated/prisma/enums.js';

export const ALL_SCOUTING_POSITIONS: readonly ScoutingPosition[] = [
  'LW',
  'C',
  'RW',
  'LD',
  'RD',
  'G',
];
export const FORWARD_POSITIONS: readonly ScoutingPosition[] = ['LW', 'C', 'RW'];
export const DEFENSE_POSITIONS: readonly ScoutingPosition[] = ['LD', 'RD'];
export const GOALIE_POSITIONS: readonly ScoutingPosition[] = ['G'];

export function groupForSignupPositions(positions: SignupPosition[]): PositionGroup {
  if (positions.length === 0) return 'FORWARD'; // Fallback
  let group: PositionGroup | null = null;
  for (const pos of positions) {
    let currentGroup: PositionGroup;
    if (pos === 'G') currentGroup = 'GOALIE';
    else if (pos === 'LD' || pos === 'RD') currentGroup = 'DEFENSE';
    else currentGroup = 'FORWARD';

    if (group === null) {
      group = currentGroup;
    } else if (group !== currentGroup) {
      throw new Error('Positions must belong to the same group (Forward, Defense, or Goalie).');
    }
  }
  return group!;
}

export function groupForScoutingPosition(position: ScoutingPosition): PositionGroup {
  if (position === 'G') return 'GOALIE';
  if (position === 'LD' || position === 'RD') return 'DEFENSE';
  return 'FORWARD';
}

export function eligiblePositions(group: PositionGroup): readonly ScoutingPosition[] {
  if (group === 'FORWARD') return FORWARD_POSITIONS;
  if (group === 'DEFENSE') return DEFENSE_POSITIONS;
  return GOALIE_POSITIONS;
}

export function isEligible(group: PositionGroup, position: ScoutingPosition): boolean {
  return eligiblePositions(group).includes(position);
}

export function signupPositionLabel(positions: SignupPosition[]): string {
  return positions.join(' / ');
}
