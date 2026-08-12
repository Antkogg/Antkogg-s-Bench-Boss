import type { PrismaClient, SessionFormat } from '../generated/prisma/client.js';

export interface SetupInput {
  guildId: string;
  actorDiscordId: string;
  timezone?: string;
  managementRoleId?: string | null;
  registeredRoleId?: string | null;
  forwardRoleId?: string | null;
  defenseRoleId?: string | null;
  goalieRoleId?: string | null;
  scoutingChannelId?: string | null;
  managementChannelId?: string | null;
  defaultFormat?: SessionFormat;
  defaultDurationMinutes?: number;
  reminderMinutes?: number[];
  positionRoleIds?: Record<string, string> | null;
}

export class ConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  get(guildId: string) {
    return this.prisma.guildConfig.findUnique({ where: { guildId } });
  }

  async ensure(guildId: string) {
    return this.prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });
  }

  async update(input: SetupInput) {
    const { guildId, actorDiscordId, ...values } = input;
    const data = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    const config = await this.prisma.guildConfig.upsert({
      where: { guildId },
      update: data,
      create: { guildId, ...data },
    });
    await this.prisma.auditLog.create({
      data: {
        guildConfigId: config.id,
        actorDiscordId,
        action: 'CONFIG_UPDATED',
        targetType: 'GuildConfig',
        targetId: config.id,
        details: data,
      },
    });
    return config;
  }
}
