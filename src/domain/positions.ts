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

export function groupForSignupPosition(position: SignupPosition): PositionGroup {
  if (position === 'G') return 'GOALIE';
  if (position === 'LD' || position === 'RD') return 'DEFENSE';
  return 'FORWARD';
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

export function signupPositionLabel(position: SignupPosition): string {
  return position === 'RW_F' ? 'RW/F' : position;
}
