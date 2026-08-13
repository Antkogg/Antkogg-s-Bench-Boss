import type { GuildMember } from 'discord.js';
import type { GuildConfig, Player } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';

export class RoleService {
  async sync(member: GuildMember, player: Player, config: GuildConfig): Promise<void> {
    const positionRoles =
      config.positionRoleIds &&
      typeof config.positionRoleIds === 'object' &&
      !Array.isArray(config.positionRoleIds)
        ? (config.positionRoleIds as Record<string, unknown>)
        : {};
    const desiredPositionRoles = player.signupPositions
      .map((pos) => (typeof positionRoles[pos] === 'string' ? positionRoles[pos] : null))
      .filter((id): id is string => Boolean(id));
    const configuredPositionRoles = Object.values(positionRoles).filter(
      (id): id is string => typeof id === 'string',
    );
    const desired = [config.registeredRoleId, ...desiredPositionRoles].filter(
      (id): id is string => Boolean(id),
    );
    try {
      const rolesToRemove = [
        ...configuredPositionRoles.filter(
          (id) => !desiredPositionRoles.includes(id) && member.roles.cache.has(id),
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
