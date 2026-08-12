export const ALL_SCOUTING_POSITIONS = [
    'LW',
    'C',
    'RW',
    'LD',
    'RD',
    'G',
];
export const FORWARD_POSITIONS = ['LW', 'C', 'RW'];
export const DEFENSE_POSITIONS = ['LD', 'RD'];
export const GOALIE_POSITIONS = ['G'];
export function groupForSignupPositions(positions) {
    if (positions.length === 0)
        return 'FORWARD'; // Fallback
    let group = null;
    for (const pos of positions) {
        let currentGroup;
        if (pos === 'G')
            currentGroup = 'GOALIE';
        else if (pos === 'LD' || pos === 'RD')
            currentGroup = 'DEFENSE';
        else
            currentGroup = 'FORWARD';
        if (group === null) {
            group = currentGroup;
        }
        else if (group !== currentGroup) {
            throw new Error('Positions must belong to the same group (Forward, Defense, or Goalie).');
        }
    }
    return group;
}
export function groupForScoutingPosition(position) {
    if (position === 'G')
        return 'GOALIE';
    if (position === 'LD' || position === 'RD')
        return 'DEFENSE';
    return 'FORWARD';
}
export function eligiblePositions(group) {
    if (group === 'FORWARD')
        return FORWARD_POSITIONS;
    if (group === 'DEFENSE')
        return DEFENSE_POSITIONS;
    return GOALIE_POSITIONS;
}
export function isEligible(group, position) {
    return eligiblePositions(group).includes(position);
}
export function signupPositionLabel(positions) {
    return positions.join(' / ');
}
//# sourceMappingURL=positions.js.map