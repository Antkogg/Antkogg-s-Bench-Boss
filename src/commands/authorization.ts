import type { GuildMember, Interaction } from 'discord.js';
import type { BotContext } from './context.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { AppError } from '../utils/errors.js';

export async function requireManagement(
  interaction: Interaction,
  context: BotContext,
): Promise<{ member: GuildMember; config: Awaited<ReturnType<BotContext['config']['ensure']>> }> {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this management command inside the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!hasManagementAccess(accessLevel(member, config)))
    throw new AppError(
      'NOT_ALLOWED',
      "This action is private to Antkogg's LG Assistant management.",
    );
  return { member, config };
}
