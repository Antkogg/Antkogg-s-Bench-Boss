import { renderScoutingSession } from '../renderers/scouting.renderer.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
export class ScoutingPostService {
    client;
    scouting;
    refreshes = new Map();
    constructor(client, scouting) {
        this.client = client;
        this.scouting = scouting;
    }
    async publish(session, forceNew = false) {
        const channelId = session.channelId ?? session.guildConfig.scoutingChannelId;
        if (!channelId)
            throw new AppError('NOT_CONFIGURED', 'Configure a scouting channel with `/setup`.');
        const channel = await this.client.channels.fetch(channelId);
        if (!channel?.isTextBased() || channel.isDMBased())
            throw new AppError('NOT_CONFIGURED', 'The configured scouting channel is unavailable.');
        const textChannel = channel;
        if (!forceNew && session.messageId) {
            try {
                const message = await textChannel.messages.fetch(session.messageId);
                await message.edit(renderScoutingSession(session));
                return;
            }
            catch (error) {
                logger.warn({ error, sessionId: session.id, messageId: session.messageId }, 'canonical post missing; regenerating');
            }
        }
        const message = await textChannel.send(renderScoutingSession(session));
        await this.scouting.saveMessage(session.id, channelId, message.id);
    }
    queueRefresh(sessionId) {
        const existing = this.refreshes.get(sessionId);
        if (existing)
            return existing;
        const refresh = new Promise((resolve) => {
            setTimeout(() => {
                void this.runRefresh(sessionId).finally(resolve);
            }, 250);
        });
        this.refreshes.set(sessionId, refresh);
        return refresh;
    }
    async runRefresh(sessionId) {
        try {
            const session = await this.scouting.get(sessionId);
            if (session)
                await this.publish(session);
        }
        catch (error) {
            logger.error({ error, sessionId }, 'scouting post refresh failed');
        }
        finally {
            this.refreshes.delete(sessionId);
        }
    }
}
//# sourceMappingURL=scouting-post.service.js.map