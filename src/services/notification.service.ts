import type { Client, MessageCreateOptions, User } from 'discord.js';
import type { ScoutingPosition } from '../generated/prisma/enums.js';
import type { ScoutingSessionView } from './scouting.service.js';
import { logger } from '../utils/logger.js';
import { renderSignupConfirmation } from '../renderers/notification.renderer.js';
import { renderWaitlistOffer } from '../renderers/notification.renderer.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';

export class NotificationService {
  constructor(private readonly client: Client) {}

  async signup(
    userId: string,
    session: ScoutingSessionView,
    position: ScoutingPosition,
    eaTag: string,
  ): Promise<boolean> {
    return this.send(
      userId,
      { embeds: [renderSignupConfirmation(session, position, eaTag)] },
      'signup confirmation',
    );
  }

  async positionChanged(
    userId: string,
    session: ScoutingSessionView,
    from: ScoutingPosition,
    to: ScoutingPosition,
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('POSITION UPDATED')
            .setDescription(
              `${discordTimestamp(session.startsAt, 'F')}\n**${from} → ${to}**\nYour lineup spot has been updated.`,
            ),
        ],
      },
      'position changed',
    );
  }

  async removed(userId: string, session: ScoutingSessionView, reason?: string): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('LINEUP UPDATE')
            .setDescription(
              `${discordTimestamp(session.startsAt, 'F')}\nYou were removed from this lineup.${reason ? `\n\n${reason}` : ''}`,
            ),
        ],
      },
      'removed',
    );
  }

  async reminder(
    userId: string,
    session: ScoutingSessionView,
    position: ScoutingPosition,
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('🏒 SCOUTING REMINDER')
            .setDescription(
              `${discordTimestamp(session.startsAt, 'F')}\n${discordTimestamp(session.startsAt, 'R')}\n\nPosition: **${position}**`,
            ),
        ],
      },
      'reminder',
    );
  }

  async status(
    userId: string,
    session: ScoutingSessionView,
    title: string,
    message: string,
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle(title)
            .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n${message}`),
        ],
      },
      'status notification',
    );
  }

  async waitlistOffer(
    userId: string,
    session: ScoutingSessionView,
    position: ScoutingPosition,
    token: string,
  ): Promise<boolean> {
    return this.send(userId, renderWaitlistOffer(session, position, token), 'waitlist offer');
  }

  private async send(
    userOrId: User | string,
    options: MessageCreateOptions,
    event: string,
  ): Promise<boolean> {
    const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;
    try {
      const user =
        typeof userOrId === 'string' ? await this.client.users.fetch(userOrId) : userOrId;
      await user.send(options);
      logger.info({ userId, event }, 'notification sent');
      return true;
    } catch (error) {
      logger.warn({ error, userId, event }, 'notification failed');
      return false;
    }
  }
}
