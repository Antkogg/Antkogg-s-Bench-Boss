import { PermissionFlagsBits } from 'discord.js';
export function accessLevel(member, configOrLegacyRole) {
    if (member.permissions.has(PermissionFlagsBits.Administrator))
        return 'ADMIN';
    const roleIds = typeof configOrLegacyRole === 'object' && configOrLegacyRole
        ? [
            configOrLegacyRole.ownerRoleId,
            configOrLegacyRole.gmRoleId,
            configOrLegacyRole.agmRoleId,
            configOrLegacyRole.managementRoleId,
        ]
        : [configOrLegacyRole];
    if (roleIds.some((roleId) => roleId && member.roles.cache.has(roleId)))
        return 'MANAGEMENT';
    return 'PLAYER';
}
export function hasManagementAccess(level) {
    return level === 'MANAGEMENT' || level === 'ADMIN';
}
//# sourceMappingURL=permissions.js.map