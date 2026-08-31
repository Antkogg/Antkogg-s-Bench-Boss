import type { GuildMember, TextChannel } from 'discord.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { renderWelcomeEmbed } from '../renderers/welcome.renderer.js';
import { logger } from '../utils/logger.js';

export class WelcomeService {
  constructor(private readonly prisma: PrismaClient) {}

  async handleMemberAdd(member: GuildMember): Promise<void> {
    try {
      const config = await this.prisma.guildConfig.findUnique({
        where: { guildId: member.guild.id },
      });
      const channelId = config?.welcomeChannelId ?? '1533692233268728068';
      const channel = await member.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        logger.warn(
          { guildId: member.guild.id, channelId },
          'Welcome channel not found or not text-based',
        );
        return;
      }

      const activeConfig =
        config ??
        (await this.prisma.guildConfig.upsert({
          where: { guildId: member.guild.id },
          update: {},
          create: { guildId: member.guild.id },
        }));

      if (activeConfig.welcomeMode === 'SCOUTING') {
        const scoutingRoleId = activeConfig.scoutRoleId ?? activeConfig.registeredRoleId ?? '1534699662135656518';
        if (scoutingRoleId && !member.roles.cache.has(scoutingRoleId)) {
          await member.roles.add(scoutingRoleId, 'Automatic S55 Scouting role on server join').catch((err) => {
            logger.warn(
              { err, guildId: member.guild.id, memberId: member.id, scoutingRoleId },
              'Failed to assign Scouting role on join',
            );
          });
        }
      }

      const welcomeData = renderWelcomeEmbed(member, activeConfig);
      await (channel as TextChannel).send(welcomeData);
      logger.info(
        { guildId: member.guild.id, memberId: member.id, channelId },
        'Sent welcome message to new member',
      );
    } catch (error) {
      logger.error(
        { error, guildId: member.guild.id, memberId: member.id },
        'Failed to send welcome message',
      );
    }
  }
}
