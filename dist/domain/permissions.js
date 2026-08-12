import { PermissionFlagsBits } from 'discord.js';
export function accessLevel(member, managementRoleId) {
    if (member.permissions.has(PermissionFlagsBits.Administrator))
        return 'ADMIN';
    if (managementRoleId && member.roles.cache.has(managementRoleId))
        return 'MANAGEMENT';
    return 'PLAYER';
}
export function hasManagementAccess(level) {
    return level === 'MANAGEMENT' || level === 'ADMIN';
}
//# sourceMappingURL=permissions.js.map