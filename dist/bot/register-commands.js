import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandDefinitions } from '../commands/definitions.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
const env = loadEnv();
const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);
await rest.put(route, { body: commandDefinitions });
logger.info({ commandCount: commandDefinitions.length, scope: env.DISCORD_GUILD_ID ? 'guild' : 'global' }, 'commands registered');
//# sourceMappingURL=register-commands.js.map