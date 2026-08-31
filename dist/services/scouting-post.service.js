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
            throw new AppError('NOT_CONFIGURED', 'No scouting channel configured. Run `/setup channels scouting:#channel-name` first.');
        let channel;
        try {
            channel = await this.client.channels.fetch(channelId);
        }
        catch (error) {
            logger.warn({ error, channelId, sessionId: session.id }, 'failed to fetch scouting channel');
            throw new AppError('NOT_CONFIGURED', 'Could not access the configured scouting channel. Run `/setup channels scouting:#channel-name` and check bot permissions.');
        }
        if (!channel?.isTextBased() || channel.isDMBased())
            throw new AppError('NOT_CONFIGURED', 'The configured scouting channel is unavailable or not a text channel.');
        const textChannel = channel;
        if (session.status === 'CANCELLED') {
            if (session.messageId) {
                try {
                    const message = await textChannel.messages.fetch(session.messageId);
                    await message.delete();
                }
                catch (error) {
                    logger.warn({ error, sessionId: session.id }, 'failed to delete cancelled session message');
                }
            }
            return;
        }
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
        try {
            const message = await textChannel.send(renderScoutingSession(session));
            await this.scouting.saveMessage(session.id, channelId, message.id);
        }
        catch (error) {
            logger.error({ error, channelId, sessionId: session.id }, 'failed to send scouting post');
            throw new AppError('NOT_ALLOWED', 'The bot does not have permission to send messages in the scouting channel. Grant "Send Messages" & "Embed Links" permissions to the bot.');
        }
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