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
    const teamRole =
      player.teamStatus === 'MANAGEMENT'
        ? null
        : player.teamStatus === 'ROSTER'
          ? config.rosterRoleId
          : player.teamStatus === 'TC'
            ? config.tcRoleId
            : player.teamStatus === 'SCOUT'
              ? (config.scoutRoleId ?? config.registeredRoleId)
              : null;
    const desired = [teamRole, ...desiredPositionRoles].filter((id): id is string => Boolean(id));
    try {
      const configuredTeamRoles = [
        config.rosterRoleId,
        config.tcRoleId,
        config.scoutRoleId,
        config.registeredRoleId,
      ].filter((id): id is string => Boolean(id));
      const rolesToRemove = [
        ...configuredTeamRoles.filter((id) => id !== teamRole && member.roles.cache.has(id)),
        ...configuredPositionRoles.filter(
          (id) => !desiredPositionRoles.includes(id) && member.roles.cache.has(id),
        ),
      ];
      if (rolesToRemove.length)
        await member.roles.remove(rolesToRemove, "Antkogg's LG Assistant role synchronization");
      const add = desired.filter((id) => !member.roles.cache.has(id));
      if (add.length) await member.roles.add(add, "Antkogg's LG Assistant role synchronization");
      logger.info({ guildId: member.guild.id, discordUserId: member.id }, 'roles synchronized');
    } catch (error) {
      logger.warn(
        { error, guildId: member.guild.id, discordUserId: member.id },
        'role synchronization failed',
      );
    }
  }
}
