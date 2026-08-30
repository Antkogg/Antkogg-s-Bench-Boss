import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { GuildConfig } from '../generated/prisma/client.js';

export type AccessLevel = 'PLAYER' | 'MANAGEMENT' | 'ADMIN';

type ManagementConfig = Pick<
  GuildConfig,
  'managementRoleId' | 'ownerRoleId' | 'gmRoleId' | 'agmRoleId'
>;

export function accessLevel(
  member: GuildMember,
  configOrLegacyRole?: ManagementConfig | string | null,
): AccessLevel {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'ADMIN';
  const roleIds =
    typeof configOrLegacyRole === 'object' && configOrLegacyRole
      ? [
          configOrLegacyRole.ownerRoleId,
          configOrLegacyRole.gmRoleId,
          configOrLegacyRole.agmRoleId,
          configOrLegacyRole.managementRoleId,
        ]
      : [configOrLegacyRole];
  if (roleIds.some((roleId) => roleId && member.roles.cache.has(roleId))) return 'MANAGEMENT';
  return 'PLAYER';
}

export function hasManagementAccess(level: AccessLevel): boolean {
  return level === 'MANAGEMENT' || level === 'ADMIN';
}
