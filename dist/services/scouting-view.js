export const sessionInclude = {
    guildConfig: true,
    assignments: { include: { player: true }, orderBy: [{ team: 'asc' }, { position: 'asc' }] },
    waitlists: {
        where: { status: { in: ['WAITING', 'OFFERED'] } },
        include: { player: true },
        orderBy: [{ positionGroup: 'asc' }, { queueOrder: 'asc' }],
    },
};
//# sourceMappingURL=scouting-view.js.map