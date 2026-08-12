import { Client, GatewayIntentBits, Options, Partials } from 'discord.js';
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
import { logger } from '../utils/logger.js';
import { routeInteraction } from './interaction-router.js';
export function createBenchBossApp(env) {
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
                keepOverLimit: (member) => member.id === member.client.user?.id || member.id === member.guild.ownerId,
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
    const context = {
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
        board: new BoardService(prisma),
    };
    const reminders = new ScoutingReminderJob(prisma, scouting, notifications);
    client.on('interactionCreate', (interaction) => void routeInteraction(interaction, context));
    client.once('ready', (readyClient) => {
        logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, 'Bench Boss is ready');
        reminders.start();
    });
    client.on('error', (error) => logger.error({ error }, 'Discord client error'));
    return { client, context, reminders };
}
//# sourceMappingURL=client.js.map