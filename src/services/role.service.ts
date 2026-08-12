import type { GuildMember } from 'discord.js';
import type { GuildConfig, Player } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';

export class RoleService {
  async sync(member: GuildMember, player: Player, config: GuildConfig): Promise<void> {
    const configuredGroupRoles = [
      config.forwardRoleId,
      config.defenseRoleId,
      config.goalieRoleId,
    ].filter((id): id is string => Boolean(id));
    const desiredGroupRole =
      player.positionGroup === 'FORWARD'
        ? config.forwardRoleId
        : player.positionGroup === 'DEFENSE'
          ? config.defenseRoleId
          : config.goalieRoleId;
    const positionRoles =
      config.positionRoleIds &&
      typeof config.positionRoleIds === 'object' &&
      !Array.isArray(config.positionRoleIds)
        ? (config.positionRoleIds as Record<string, unknown>)
        : {};
    const signupKey = player.signupPosition === 'RW_F' ? 'RW' : player.signupPosition;
    const desiredPositionRole =
      typeof positionRoles[signupKey] === 'string' ? positionRoles[signupKey] : null;
    const configuredPositionRoles = Object.values(positionRoles).filter(
      (id): id is string => typeof id === 'string',
    );
    const desired = [config.registeredRoleId, desiredGroupRole, desiredPositionRole].filter(
      (id): id is string => Boolean(id),
    );
    const remove = configuredGroupRoles.filter(
      (id) => id !== desiredGroupRole && member.roles.cache.has(id),
    );
    try {
      const rolesToRemove = [
        ...remove,
        ...configuredPositionRoles.filter(
          (id) => id !== desiredPositionRole && member.roles.cache.has(id),
        ),
      ];
      if (rolesToRemove.length)
        await member.roles.remove(rolesToRemove, 'Bench Boss registration role synchronization');
      const add = desired.filter((id) => !member.roles.cache.has(id));
      if (add.length) await member.roles.add(add, 'Bench Boss registration role synchronization');
      logger.info({ guildId: member.guild.id, discordUserId: member.id }, 'roles synchronized');
    } catch (error) {
      logger.warn(
        { error, guildId: member.guild.id, discordUserId: member.id },
        'role synchronization failed',
      );
    }
  }
}
