import 'dotenv/config';
import { defineConfig } from './tooling/node_modules/prisma/config.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // A non-routable fallback lets `prisma generate` run before local secrets exist.
  // Migrations and runtime startup still validate DATABASE_URL explicitly.
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
  },
});
