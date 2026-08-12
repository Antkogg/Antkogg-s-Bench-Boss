import { logger } from '../utils/logger.js';
export class RoleService {
    async sync(member, player, config) {
        const configuredGroupRoles = [
            config.forwardRoleId,
            config.defenseRoleId,
            config.goalieRoleId,
        ].filter((id) => Boolean(id));
        const desiredGroupRole = player.positionGroup === 'FORWARD'
            ? config.forwardRoleId
            : player.positionGroup === 'DEFENSE'
                ? config.defenseRoleId
                : config.goalieRoleId;
        const positionRoles = config.positionRoleIds &&
            typeof config.positionRoleIds === 'object' &&
            !Array.isArray(config.positionRoleIds)
            ? config.positionRoleIds
            : {};
        const desiredPositionRoles = player.signupPositions
            .map((pos) => (typeof positionRoles[pos] === 'string' ? positionRoles[pos] : null))
            .filter((id) => Boolean(id));
        const configuredPositionRoles = Object.values(positionRoles).filter((id) => typeof id === 'string');
        const desired = [config.registeredRoleId, desiredGroupRole, ...desiredPositionRoles].filter((id) => Boolean(id));
        const remove = configuredGroupRoles.filter((id) => id !== desiredGroupRole && member.roles.cache.has(id));
        try {
            const rolesToRemove = [
                ...remove,
                ...configuredPositionRoles.filter((id) => !desiredPositionRoles.includes(id) && member.roles.cache.has(id)),
            ];
            if (rolesToRemove.length)
                await member.roles.remove(rolesToRemove, 'Bench Boss registration role synchronization');
            const add = desired.filter((id) => !member.roles.cache.has(id));
            if (add.length)
                await member.roles.add(add, 'Bench Boss registration role synchronization');
            logger.info({ guildId: member.guild.id, discordUserId: member.id }, 'roles synchronized');
        }
        catch (error) {
            logger.warn({ error, guildId: member.guild.id, discordUserId: member.id }, 'role synchronization failed');
        }
    }
}
//# sourceMappingURL=role.service.js.map