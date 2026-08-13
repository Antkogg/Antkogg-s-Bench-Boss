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
    const desired = [config.registeredRoleId, desiredGroupRole].filter(
      (id): id is string => Boolean(id),
    );
    const remove = configuredGroupRoles.filter(
      (id) => id !== desiredGroupRole && member.roles.cache.has(id),
    );
    try {
      const rolesToRemove = [...remove];
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
