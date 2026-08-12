import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { normalizeIdentity } from '../src/utils/normalize.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is disabled in production.');
}
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required to seed development data.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const guild = await prisma.guildConfig.upsert({
  where: { guildId: 'development-guild' },
  update: {},
  create: { guildId: 'development-guild', timezone: 'America/New_York' },
});
await prisma.scoutingSession.deleteMany({ where: { guildConfigId: guild.id } });
await prisma.evaluation.deleteMany({ where: { player: { guildConfigId: guild.id } } });

const fakePlayers = [
  ['forward-a', 'Forward A', 'xX Forward A Xx', 'C', 'FORWARD'],
  ['forward-b', 'Forward B', 'Wheel Snipe B', 'LW', 'FORWARD'],
  ['forward-c', 'Forward C', 'Chel Forward C', 'RW_F', 'FORWARD'],
  ['defense-a', 'Defense A', 'Puck Mover A', 'LD', 'DEFENSE'],
  ['defense-b', 'Defense B', 'Blue Line B', 'RD', 'DEFENSE'],
  ['goalie-a', 'Goalie A', 'Brick Wall A', 'G', 'GOALIE'],
  ['extra-forward', 'Extra Forward', 'Waitlist Hero', 'C', 'FORWARD'],
] as const;

const players = [];
for (const [discordUserId, lgUsername, eaTag, signupPosition, positionGroup] of fakePlayers) {
  players.push(
    await prisma.player.upsert({
      where: { guildConfigId_discordUserId: { guildConfigId: guild.id, discordUserId } },
      update: { eaTag, eaTagNormalized: normalizeIdentity(eaTag) },
      create: {
        guildConfigId: guild.id,
        discordUserId,
        discordDisplayName: lgUsername,
        lgUsername,
        lgUsernameNormalized: normalizeIdentity(lgUsername),
        eaTag,
        eaTagNormalized: normalizeIdentity(eaTag),
        signupPosition,
        positionGroup,
      },
    }),
  );
}

const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
const session = await prisma.scoutingSession.create({
  data: {
    guildConfigId: guild.id,
    startsAt,
    durationMinutes: 60,
    format: 'ONE_SIDE',
    createdByDiscordId: 'development-manager',
    note: 'Development embed review session',
  },
});
for (const [index, position] of ['LW', 'C', 'RW', 'LD', 'G'].entries()) {
  await prisma.scoutingAssignment.create({
    data: {
      sessionId: session.id,
      playerId: players[index]!.id,
      position: position as 'LW' | 'C' | 'RW' | 'LD' | 'G',
    },
  });
}
await prisma.waitlistEntry.create({
  data: {
    sessionId: session.id,
    playerId: players[6]!.id,
    positionGroup: 'FORWARD',
    preferredPosition: 'RW',
    queueOrder: 1,
  },
});
await prisma.evaluation.create({
  data: {
    playerId: players[0]!.id,
    evaluatorDiscordId: 'development-manager',
    overall: 4,
    offense: 4,
    defense: 4,
    hockeyIq: 5,
    puckMovement: 4,
    communication: 5,
    privateNote: 'Development-only sample evaluation.',
  },
});

const privateSession = await prisma.scoutingSession.create({
  data: {
    guildConfigId: guild.id,
    startsAt: new Date(startsAt.getTime() + 90 * 60_000),
    durationMinutes: 60,
    format: 'PRIVATE_6V6',
    createdByDiscordId: 'development-manager',
    note: 'Development private 6v6 review',
  },
});
await prisma.scoutingAssignment.createMany({
  data: [
    { sessionId: privateSession.id, playerId: players[0]!.id, team: 'TEAM_1', position: 'C' },
    { sessionId: privateSession.id, playerId: players[1]!.id, team: 'TEAM_2', position: 'LW' },
    { sessionId: privateSession.id, playerId: players[3]!.id, team: 'TEAM_1', position: 'LD' },
    { sessionId: privateSession.id, playerId: players[4]!.id, team: 'TEAM_2', position: 'RD' },
    { sessionId: privateSession.id, playerId: players[5]!.id, team: 'TEAM_1', position: 'G' },
  ],
});

await prisma.$disconnect();
console.log(`Seeded ${players.length} players and 2 scouting sessions for development-guild.`);
