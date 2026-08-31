import { logger } from '../utils/logger.js';
const DEFAULT_POSITION_ROLES = {
    C: '1534702045494382703',
    LW: '1534702144580489396',
    RW: '1534702400445616138',
    LD: '1534702499842232470',
    RD: '1534702588597899375',
    G: '1534702679853633636',
};
const POSITION_ROLE_NAMES = {
    C: ['Center', 'C'],
    LW: ['Left Wing', 'LW'],
    RW: ['Right Wing', 'RW'],
    LD: ['Left Defense', 'LD'],
    RD: ['Right Defense', 'RD'],
    G: ['Goalie', 'G'],
};
function resolvePositionRoleId(member, posKey, configuredId) {
    if (configuredId && member.guild.roles.cache.has(configuredId)) {
        return configuredId;
    }
    const defaultId = DEFAULT_POSITION_ROLES[posKey];
    if (defaultId && member.guild.roles.cache.has(defaultId)) {
        return defaultId;
    }
    const names = POSITION_ROLE_NAMES[posKey] ?? [];
    const foundRole = member.guild.roles.cache.find((r) => names.some((n) => r.name.trim().toLowerCase() === n.toLowerCase()));
    return foundRole ? foundRole.id : null;
}
export class RoleService {
    async sync(member, player, config) {
        const customPositionRoles = config.positionRoleIds &&
            typeof config.positionRoleIds === 'object' &&
            !Array.isArray(config.positionRoleIds)
            ? config.positionRoleIds
            : {};
        const positionRoles = {
            C: resolvePositionRoleId(member, 'C', typeof customPositionRoles.C === 'string' ? customPositionRoles.C : null),
            LW: resolvePositionRoleId(member, 'LW', typeof customPositionRoles.LW === 'string' ? customPositionRoles.LW : null),
            RW: resolvePositionRoleId(member, 'RW', typeof customPositionRoles.RW === 'string' ? customPositionRoles.RW : null),
            LD: resolvePositionRoleId(member, 'LD', typeof customPositionRoles.LD === 'string' ? customPositionRoles.LD : null),
            RD: resolvePositionRoleId(member, 'RD', typeof customPositionRoles.RD === 'string' ? customPositionRoles.RD : null),
            G: resolvePositionRoleId(member, 'G', typeof customPositionRoles.G === 'string' ? customPositionRoles.G : null),
        };
        const desiredPositionRoles = player.signupPositions
            .map((pos) => positionRoles[pos])
            .filter((id) => Boolean(id));
        const configuredPositionRoles = Object.values(positionRoles).filter((id) => Boolean(id));
        const teamRole = player.teamStatus === 'MANAGEMENT'
            ? null
            : player.teamStatus === 'ROSTER'
                ? config.rosterRoleId
                : player.teamStatus === 'TC'
                    ? config.tcRoleId
                    : player.teamStatus === 'SCOUT'
                        ? (config.scoutRoleId ?? config.registeredRoleId ?? '1534699662135656518')
                        : null;
        const desired = [teamRole, ...desiredPositionRoles].filter((id) => Boolean(id));
        try {
            const configuredTeamRoles = [
                config.rosterRoleId,
                config.tcRoleId,
                config.scoutRoleId,
                config.registeredRoleId,
            ].filter((id) => Boolean(id));
            const rolesToRemove = [
                ...configuredTeamRoles.filter((id) => id !== teamRole && member.roles.cache.has(id)),
                ...configuredPositionRoles.filter((id) => !desiredPositionRoles.includes(id) && member.roles.cache.has(id)),
            ];
            if (rolesToRemove.length)
                await member.roles.remove(rolesToRemove, "Antkogg's LG Assistant role synchronization");
            const add = desired.filter((id) => !member.roles.cache.has(id));
            if (add.length)
                await member.roles.add(add, "Antkogg's LG Assistant role synchronization");
            logger.info({ guildId: member.guild.id, discordUserId: member.id }, 'roles synchronized');
        }
        catch (error) {
            logger.warn({ error, guildId: member.guild.id, discordUserId: member.id }, 'role synchronization failed');
        }
    }
}
//# sourceMappingURL=role.service.js.map