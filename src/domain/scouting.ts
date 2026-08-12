import type {
  LineupTeam,
  PositionGroup,
  ScoutingPosition,
  SessionFormat,
  SessionStatus,
} from '../generated/prisma/enums.js';
import { ALL_SCOUTING_POSITIONS, groupForScoutingPosition } from './positions.js';

export interface LineupSlot {
  team: LineupTeam;
  position: ScoutingPosition;
}

export function lineupSlots(format: SessionFormat): readonly LineupSlot[] {
  const teams: readonly LineupTeam[] = format === 'PRIVATE_6V6' ? ['TEAM_1', 'TEAM_2'] : ['TEAM_1'];
  return teams.flatMap((team) => ALL_SCOUTING_POSITIONS.map((position) => ({ team, position })));
}

export function capacity(format: SessionFormat): number {
  return format === 'PRIVATE_6V6' ? 12 : 6;
}

export function statusAllowsSignup(status: SessionStatus, signupsOpen: boolean): boolean {
  return status === 'OPEN' && signupsOpen;
}

export function timeRangesOverlap(
  leftStart: Date,
  leftDurationMinutes: number,
  rightStart: Date,
  rightDurationMinutes: number,
): boolean {
  const leftEnd = leftStart.getTime() + leftDurationMinutes * 60_000;
  const rightEnd = rightStart.getTime() + rightDurationMinutes * 60_000;
  return leftStart.getTime() < rightEnd && rightStart.getTime() < leftEnd;
}

export function remainingByGroup(
  format: SessionFormat,
  filledPositions: readonly ScoutingPosition[],
): Record<PositionGroup, number> {
  const multiplier = format === 'PRIVATE_6V6' ? 2 : 1;
  const target: Record<PositionGroup, number> = {
    FORWARD: 3 * multiplier,
    DEFENSE: 2 * multiplier,
    GOALIE: multiplier,
  };
  for (const position of filledPositions) target[groupForScoutingPosition(position)] -= 1;
  return target;
}
