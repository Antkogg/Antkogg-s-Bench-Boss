import 'dotenv/config';
import { createBenchBossApp } from './bot/client.js';
import { loadEnv } from './config/env.js';
import { disconnectPrisma } from './database/client.js';
import { logger } from './utils/logger.js';

try {
  const env = loadEnv();
  const app = createBenchBossApp(env);
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    app.reminders.stop();
    await app.client.destroy();
    await disconnectPrisma();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  await app.client.login(env.DISCORD_TOKEN);
} catch (error) {
  logger.fatal({ error }, 'Bench Boss failed to start');
  process.exitCode = 1;
}
