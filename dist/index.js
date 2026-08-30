import 'dotenv/config';
import { createLgAssistantApp } from './bot/client.js';
import { loadEnv } from './config/env.js';
import { disconnectPrisma } from './database/client.js';
import { logger } from './utils/logger.js';
try {
    const env = loadEnv();
    const app = createLgAssistantApp(env);
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger.info({ signal }, 'shutting down');
        app.reminders.stop();
        app.availabilityReminders.stop();
        app.gameDayReminders.stop();
        const results = await Promise.allSettled([
            Promise.resolve(app.client.destroy()),
            disconnectPrisma(),
        ]);
        for (const result of results) {
            if (result.status === 'rejected')
                logger.error({ error: result.reason }, 'graceful shutdown operation failed');
        }
        logger.info('shutdown complete');
        process.exit(results.some((result) => result.status === 'rejected') ? 1 : 0);
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    await app.client.login(env.DISCORD_TOKEN);
}
catch (error) {
    logger.fatal({ error }, "Antkogg's LG Assistant failed to start");
    process.exitCode = 1;
}
//# sourceMappingURL=index.js.map