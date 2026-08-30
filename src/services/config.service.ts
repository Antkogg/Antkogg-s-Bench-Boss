import type { PrismaClient, SessionFormat, TcReminderPolicy } from '../generated/prisma/client.js';

export interface SetupInput {
  guildId: string;
  actorDiscordId: string;
  timezone?: string;
  managementRoleId?: string | null;
  ownerRoleId?: string | null;
  gmRoleId?: string | null;
  agmRoleId?: string | null;
  rosterRoleId?: string | null;
  tcRoleId?: string | null;
  scoutRoleId?: string | null;
  registeredRoleId?: string | null;
  forwardRoleId?: string | null;
  defenseRoleId?: string | null;
  goalieRoleId?: string | null;
  scoutingChannelId?: string | null;
  scoutingAnnouncementsChannelId?: string | null;
  teamAvailabilityChannelId?: string | null;
  teamAnnouncementsChannelId?: string | null;
  managementChannelId?: string | null;
  rulesChannelId?: string | null;
  teamName?: string;
  seasonLabel?: string;
  defaultFormat?: SessionFormat;
  defaultDurationMinutes?: number;
  reminderMinutes?: number[];
  availabilityReminderMinutes?: number[];
  tcReminderPolicy?: TcReminderPolicy;
  positionRoleIds?: Record<string, string> | null;
  serverCodeReminderMinutes?: number;
  notifyConfirmedGameInfo?: boolean;
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
    return this.prisma.$transaction(async (tx) => {
      const config = await tx.guildConfig.upsert({
        where: { guildId },
        update: data,
        create: { guildId, ...data },
      });
      await tx.auditLog.create({
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
    });
  }
}
