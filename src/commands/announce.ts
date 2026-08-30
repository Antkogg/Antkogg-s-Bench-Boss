import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';

export async function handleAnnouncement(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  const { config } = await requireManagement(interaction, context);
  const channel = config.teamAnnouncementsChannelId
    ? ((await interaction.client.channels.fetch(
        config.teamAnnouncementsChannelId,
      )) as TextChannel | null)
    : null;
  if (!channel?.isTextBased() || channel.isDMBased())
    throw new AppError(
      'NOT_CONFIGURED',
      'Configure a team announcements channel with `/setup channels`.',
    );
  const target = interaction.options.getString('target', true);
  const roleIds = [
    ...(target === 'ROSTER' || target === 'TEAM' ? [config.rosterRoleId] : []),
    ...(target === 'TC' || target === 'TEAM' ? [config.tcRoleId] : []),
  ].filter((id): id is string => Boolean(id));
  if (target !== 'NONE' && target !== 'EVERYONE' && !roleIds.length)
    throw new AppError('NOT_CONFIGURED', 'The selected announcement roles are not configured.');
  const content = target === 'EVERYONE' ? '@everyone' : roleIds.map((id) => `<@&${id}>`).join(' ');
  await channel.send({
    ...(content ? { content } : {}),
    embeds: [
      brandedEmbed()
        .setTitle(interaction.options.getString('title', true).slice(0, 256))
        .setDescription(interaction.options.getString('message', true).slice(0, 4000)),
    ],
    allowedMentions: { parse: target === 'EVERYONE' ? ['everyone'] : [], roles: roleIds },
  });
  await interaction.reply({
    ephemeral: true,
    embeds: [renderSuccess('Announcement posted', `Sent to <#${channel.id}>.`)],
  });
}
