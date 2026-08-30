import type { Prisma } from '../generated/prisma/client.js';

export const sessionInclude = {
  guildConfig: true,
  assignments: { include: { player: true }, orderBy: [{ team: 'asc' }, { position: 'asc' }] },
  availability: { include: { player: true }, orderBy: { createdAt: 'asc' } },
  waitlists: {
    where: { status: { in: ['WAITING', 'OFFERED'] } },
    include: { player: true },
    orderBy: [{ positionGroup: 'asc' }, { queueOrder: 'asc' }],
  },
} satisfies Prisma.ScoutingSessionInclude;

export type ScoutingSessionView = Prisma.ScoutingSessionGetPayload<{
  include: typeof sessionInclude;
}>;
