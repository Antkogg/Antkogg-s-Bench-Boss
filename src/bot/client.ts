import { Client, GatewayIntentBits, Options, Partials } from 'discord.js';
import type { AppEnv } from '../config/env.js';
import { getPrisma } from '../database/client.js';
import { AttendanceService } from '../services/attendance.service.js';
import { AvailabilityService } from '../services/availability.service.js';
import { BoardService } from '../services/board.service.js';
import { ConfigService } from '../services/config.service.js';
import { EvaluationService } from '../services/evaluation.service.js';
import { NotificationService } from '../services/notification.service.js';
import { PlayerService } from '../services/player.service.js';
import { RoleService } from '../services/role.service.js';
import { ScoutingPostService } from '../services/scouting-post.service.js';
import { ScoutingService } from '../services/scouting.service.js';
import { ScoutingReminderJob } from '../jobs/scouting-reminders.js';
import { WeeklyAvailabilityReminderJob } from '../jobs/weekly-availability-reminders.js';
import { GameDayReminderJob } from '../jobs/game-day-reminders.js';
import { WeeklyAvailabilityService } from '../services/weekly-availability.service.js';
import { TeamService } from '../services/team.service.js';
import { RulesService } from '../services/rules.service.js';
import { ScheduleService } from '../services/schedule.service.js';
import type { BotContext } from '../commands/context.js';
import { logger } from '../utils/logger.js';
import { routeInteraction } from './interaction-router.js';

export interface LgAssistantApp {
  client: Client;
  context: BotContext;
  reminders: ScoutingReminderJob;
  availabilityReminders: WeeklyAvailabilityReminderJob;
  gameDayReminders: GameDayReminderJob;
}

export function createLgAssistantApp(env: AppEnv): LgAssistantApp {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: {
        maxSize: 500,
        keepOverLimit: (member) =>
          member.id === member.client.user?.id || member.id === member.guild.ownerId,
      },
      MessageManager: 25,
      ReactionManager: 0,
      ReactionUserManager: 0,
      UserManager: 500,
      VoiceStateManager: 0,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 300, lifetime: 600 },
    },
    partials: [Partials.Channel],
  });
  const prisma = getPrisma(env.DATABASE_URL);
  const scouting = new ScoutingService(prisma);
  const notifications = new NotificationService(client);
  const weeklyAvailability = new WeeklyAvailabilityService(prisma);
  const context: BotContext = {
    client,
    prisma,
    config: new ConfigService(prisma),
    players: new PlayerService(prisma),
    roles: new RoleService(),
    scouting,
    posts: new ScoutingPostService(client, scouting),
    notifications,
    attendance: new AttendanceService(prisma),
    evaluations: new EvaluationService(prisma),
    availability: new AvailabilityService(prisma),
    weeklyAvailability,
    team: new TeamService(prisma),
    rules: new RulesService(prisma),
    schedule: new ScheduleService(prisma),
    board: new BoardService(prisma),
  };
  const reminders = new ScoutingReminderJob(prisma, scouting, notifications);
  const availabilityReminders = new WeeklyAvailabilityReminderJob(
    prisma,
    weeklyAvailability,
    notifications,
  );
  const gameDayReminders = new GameDayReminderJob(prisma, notifications);
  client.on('interactionCreate', (interaction) => void routeInteraction(interaction, context));
  client.once('ready', (readyClient) => {
    logger.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      "Antkogg's LG Assistant is ready",
    );
    reminders.start();
    availabilityReminders.start();
    gameDayReminders.start();
  });
  client.on('error', (error) => logger.error({ error }, 'Discord client error'));
  client.on('shardError', (error, shardId) =>
    logger.error({ error, shardId }, 'Discord shard connection error'),
  );
  client.on('shardDisconnect', (event, shardId) =>
    logger.warn({ code: event.code, shardId }, 'Discord shard disconnected; reconnect pending'),
  );
  client.on('shardReconnecting', (shardId) =>
    logger.warn({ shardId }, 'Discord shard reconnecting'),
  );
  client.on('shardResume', (shardId, replayedEvents) =>
    logger.info({ shardId, replayedEvents }, 'Discord shard resumed'),
  );
  return { client, context, reminders, availabilityReminders, gameDayReminders };
}
