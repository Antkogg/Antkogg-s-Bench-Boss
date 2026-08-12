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
export function groupForSignupPosition(position) {
    if (position === 'G')
        return 'GOALIE';
    if (position === 'LD' || position === 'RD')
        return 'DEFENSE';
    return 'FORWARD';
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
export function signupPositionLabel(position) {
    return position === 'RW_F' ? 'RW/F' : position;
}
//# sourceMappingURL=positions.js.map