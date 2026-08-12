import { ALL_SCOUTING_POSITIONS, groupForScoutingPosition } from './positions.js';
export function lineupSlots(format) {
    const teams = format === 'PRIVATE_6V6' ? ['TEAM_1', 'TEAM_2'] : ['TEAM_1'];
    return teams.flatMap((team) => ALL_SCOUTING_POSITIONS.map((position) => ({ team, position })));
}
export function capacity(format) {
    return format === 'PRIVATE_6V6' ? 12 : 6;
}
export function statusAllowsSignup(status, signupsOpen) {
    return status === 'OPEN' && signupsOpen;
}
export function timeRangesOverlap(leftStart, leftDurationMinutes, rightStart, rightDurationMinutes) {
    const leftEnd = leftStart.getTime() + leftDurationMinutes * 60_000;
    const rightEnd = rightStart.getTime() + rightDurationMinutes * 60_000;
    return leftStart.getTime() < rightEnd && rightStart.getTime() < leftEnd;
}
export function remainingByGroup(format, filledPositions) {
    const multiplier = format === 'PRIVATE_6V6' ? 2 : 1;
    const target = {
        FORWARD: 3 * multiplier,
        DEFENSE: 2 * multiplier,
        GOALIE: multiplier,
    };
    for (const position of filledPositions)
        target[groupForScoutingPosition(position)] -= 1;
    return target;
}
//# sourceMappingURL=scouting.js.map