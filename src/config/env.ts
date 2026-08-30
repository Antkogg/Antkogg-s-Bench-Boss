import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID must be a Discord snowflake'),
  DISCORD_GUILD_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^\d+$/, 'DISCORD_GUILD_ID must be a Discord snowflake').optional(),
  ),
  DATABASE_URL: z
    .url()
    .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a PostgreSQL URL',
    }),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(
      `Antkogg's LG Assistant cannot start because configuration is invalid:\n${lines.join('\n')}`,
    );
  }
  return result.data;
}
