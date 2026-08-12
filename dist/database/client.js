import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
let client;
export function getPrisma(databaseUrl = process.env.DATABASE_URL) {
    if (!databaseUrl)
        throw new Error('DATABASE_URL is required before creating the database client.');
    client ??= new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl, max: 5 }),
    });
    return client;
}
export async function disconnectPrisma() {
    await client?.$disconnect();
    client = undefined;
}
//# sourceMappingURL=client.js.map