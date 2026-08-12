import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export type AccessLevel = 'PLAYER' | 'MANAGEMENT' | 'ADMIN';

export function accessLevel(member: GuildMember, managementRoleId?: string | null): AccessLevel {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'ADMIN';
  if (managementRoleId && member.roles.cache.has(managementRoleId)) return 'MANAGEMENT';
  return 'PLAYER';
}

export function hasManagementAccess(level: AccessLevel): boolean {
  return level === 'MANAGEMENT' || level === 'ADMIN';
}
