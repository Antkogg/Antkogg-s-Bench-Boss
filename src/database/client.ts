import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

let client: PrismaClient | undefined;

export function getPrisma(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required before creating the database client.');
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
