import { AppError } from '../utils/errors.js';
export class EvaluationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async evaluate(input) {
        for (const value of [
            input.overall,
            input.offense,
            input.defense,
            input.hockeyIq,
            input.puckMovement,
            input.communication,
        ]) {
            if (!Number.isInteger(value) || value < 1 || value > 5)
                throw new AppError('INVALID_INPUT', 'Evaluation ratings must be from 1 to 5.');
        }
        return this.prisma.evaluation.create({ data: input });
    }
    addNote(playerId, authorDiscordId, body) {
        if (!body.trim())
            throw new AppError('INVALID_INPUT', 'A note cannot be empty.');
        return this.prisma.playerNote.create({
            data: { playerId, authorDiscordId, body: body.trim().slice(0, 2000) },
        });
    }
    async playerView(playerId) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
            include: {
                evaluations: { orderBy: { createdAt: 'desc' }, take: 10 },
                notes: { orderBy: { createdAt: 'desc' }, take: 10 },
                attendance: true,
                assignments: { include: { session: true }, orderBy: { createdAt: 'desc' }, take: 20 },
            },
        });
        if (!player)
            throw new AppError('NOT_FOUND', 'Player not found.');
        return player;
    }
    setStatus(playerId, status) {
        return this.prisma.player.update({ where: { id: playerId }, data: { internalStatus: status } });
    }
}
//# sourceMappingURL=evaluation.service.js.map