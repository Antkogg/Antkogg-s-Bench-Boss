export class ConfigService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    get(guildId) {
        return this.prisma.guildConfig.findUnique({ where: { guildId } });
    }
    async ensure(guildId) {
        return this.prisma.guildConfig.upsert({
            where: { guildId },
            update: {},
            create: { guildId },
        });
    }
    async update(input) {
        const { guildId, actorDiscordId, ...values } = input;
        const data = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
        return this.prisma.$transaction(async (tx) => {
            const config = await tx.guildConfig.upsert({
                where: { guildId },
                update: data,
                create: { guildId, ...data },
            });
            await tx.auditLog.create({
                data: {
                    guildConfigId: config.id,
                    actorDiscordId,
                    action: 'CONFIG_UPDATED',
                    targetType: 'GuildConfig',
                    targetId: config.id,
                    details: data,
                },
            });
            return config;
        });
    }
}
//# sourceMappingURL=config.service.js.map