import type { Client } from 'discord.js';
import { renderScoutingSession } from '../renderers/scouting.renderer.js';
import type { ScoutingService, ScoutingSessionView } from './scouting.service.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class ScoutingPostService {
  private readonly refreshes = new Map<string, Promise<void>>();

  constructor(
    private readonly client: Client,
    private readonly scouting: ScoutingService,
  ) {}

  async publish(session: ScoutingSessionView, forceNew = false): Promise<void> {
    const channelId = session.channelId ?? session.guildConfig.scoutingChannelId;
    if (!channelId)
      throw new AppError('NOT_CONFIGURED', 'Configure a scouting channel with `/setup`.');
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased())
      throw new AppError('NOT_CONFIGURED', 'The configured scouting channel is unavailable.');
    const textChannel = channel;
    if (session.status === 'CANCELLED') {
      if (session.messageId) {
        try {
          const message = await textChannel.messages.fetch(session.messageId);
          await message.delete();
        } catch (error) {
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
      } catch (error) {
        logger.warn(
          { error, sessionId: session.id, messageId: session.messageId },
          'canonical post missing; regenerating',
        );
      }
    }
    const message = await textChannel.send(renderScoutingSession(session));
    await this.scouting.saveMessage(session.id, channelId, message.id);
  }

  queueRefresh(sessionId: string): Promise<void> {
    const existing = this.refreshes.get(sessionId);
    if (existing) return existing;
    const refresh = new Promise<void>((resolve) => {
      setTimeout(() => {
        void this.runRefresh(sessionId).finally(resolve);
      }, 250);
    });
    this.refreshes.set(sessionId, refresh);
    return refresh;
  }

  private async runRefresh(sessionId: string): Promise<void> {
    try {
      const session = await this.scouting.get(sessionId);
      if (session) await this.publish(session);
    } catch (error) {
      logger.error({ error, sessionId }, 'scouting post refresh failed');
    } finally {
      this.refreshes.delete(sessionId);
    }
  }
}
