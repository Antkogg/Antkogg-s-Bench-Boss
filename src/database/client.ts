import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

let client: PrismaClient | undefined;
let pool: pg.Pool | undefined;

export function getPrisma(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required before creating the database client.');
  if (!client) {
    pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
    client = new PrismaClient({
      adapter: new PrismaPg(pool),
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  await pool?.end();
  client = undefined;
  pool = undefined;
}
