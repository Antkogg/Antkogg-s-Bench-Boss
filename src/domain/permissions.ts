import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { GuildConfig } from '../generated/prisma/client.js';

export type AccessLevel = 'PLAYER' | 'MANAGEMENT' | 'ADMIN';

type ManagementConfig = Pick<
  GuildConfig,
  'managementRoleId' | 'ownerRoleId' | 'gmRoleId' | 'agmRoleId'
>;

import { DEFAULT_MANAGEMENT_ROLE_ID } from '../config/constants.js';

export function accessLevel(
  member: GuildMember,
  configOrLegacyRole?: ManagementConfig | string | null,
): AccessLevel {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'ADMIN';
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return 'ADMIN';
  if (member.roles.cache.has(DEFAULT_MANAGEMENT_ROLE_ID)) return 'MANAGEMENT';
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

  // Fallback: check role names if specific role IDs are not configured
  const hasMgmtRoleByName =
    typeof member.roles?.cache?.some === 'function' &&
    member.roles.cache.some((role) =>
      Boolean(
        role?.name &&
          (/\b(owner|gm|agm|coach|management|manager|admin)\b/i.test(role.name) ||
            role.name.toLowerCase().includes('management') ||
            role.name.toLowerCase().includes('general manager')),
      ),
    );
  if (hasMgmtRoleByName) return 'MANAGEMENT';

  return 'PLAYER';
}

export function hasManagementAccess(level: AccessLevel): boolean {
  return level === 'MANAGEMENT' || level === 'ADMIN';
}
