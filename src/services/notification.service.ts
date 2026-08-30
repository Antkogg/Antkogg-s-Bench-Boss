import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type MessageCreateOptions,
  type User,
} from 'discord.js';
import type { ScoutingPosition } from '../generated/prisma/enums.js';
import type { ScoutingSessionView } from './scouting.service.js';
import { logger } from '../utils/logger.js';
import { renderSignupConfirmation } from '../renderers/notification.renderer.js';
import { renderWaitlistOffer } from '../renderers/notification.renderer.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';

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

  async availabilityReminder(
    userId: string,
    week: { id: string; label: string; deadline: Date },
    policy: 'required' | 'encouraged' = 'required',
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('WEEKLY AVAILABILITY REMINDER')
            .setDescription(
              `${policy === 'required' ? 'Your response is required' : 'Your response is encouraged'} for **${week.label}** and has not been submitted.\nDeadline: ${discordTimestamp(week.deadline, 'F')} (${discordTimestamp(week.deadline, 'R')})`,
            ),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(customId('weekly-availability', week.id, 'submit'))
              .setLabel('Submit Availability')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      },
      'weekly availability reminder',
    );
  }

  async availabilityEdited(userId: string, label: string): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('AVAILABILITY UPDATED')
            .setDescription(
              `Management updated your availability for **${label}**. Use the weekly post to review it.`,
            ),
        ],
      },
      'availability management edit',
    );
  }

  async lineupConfirmed(
    userId: string,
    game: {
      id: string;
      scheduledAtUtc: Date;
      opponentNameSnapshot: string | null;
      homeAway: string | null;
    },
    position: ScoutingPosition,
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('LINEUP CONFIRMED')
            .setDescription(
              `You are confirmed at **${position}** ${game.homeAway === 'AWAY' ? '@' : 'vs'} **${game.opponentNameSnapshot ?? 'TBD'}**.\n${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n\nUse \`/game\` for the current server and code.`,
            ),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(customId('player-game', game.id))
              .setLabel('View Game')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      },
      'regular-season lineup confirmation',
    );
  }

  async lineupRemoved(
    userId: string,
    game: { scheduledAtUtc: Date; opponentNameSnapshot: string | null } | null,
    position: ScoutingPosition,
  ): Promise<boolean> {
    if (!game) return false;
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('LINEUP UPDATED')
            .setDescription(
              `You are no longer confirmed at **${position}** for **${game.opponentNameSnapshot ?? 'this game'}** on ${discordTimestamp(game.scheduledAtUtc, 'F')}.`,
            ),
        ],
      },
      'regular-season lineup removal',
    );
  }

  async gameInfoReady(
    userId: string,
    game: {
      scheduledAtUtc: Date;
      opponentNameSnapshot: string | null;
      gameServer: string | null;
      gameCode: string | null;
    },
    position: ScoutingPosition,
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('GAME DETAILS READY')
            .setDescription(
              `**${position}** • ${game.opponentNameSnapshot ?? 'Scheduled game'}\n${discordTimestamp(game.scheduledAtUtc, 'F')}\n\n**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`,
            ),
        ],
      },
      'regular-season game details',
    );
  }

  async regularGameStatus(
    userId: string,
    game: { scheduledAtUtc: Date; opponentNameSnapshot: string | null; status: string },
  ): Promise<boolean> {
    return this.send(
      userId,
      {
        embeds: [
          brandedEmbed()
            .setTitle('GAME STATUS UPDATED')
            .setDescription(
              `**${game.opponentNameSnapshot ?? 'Scheduled game'}** is now **${game.status}**.\n${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})`,
            ),
        ],
      },
      'regular-season game status',
    );
  }

  async serverCodeMissing(
    channelId: string,
    game: { id: string; scheduledAtUtc: Date; opponentNameSnapshot: string | null },
  ): Promise<string | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isSendable()) return null;
      const message = await channel.send({
        embeds: [
          brandedEmbed()
            .setTitle('SERVER / CODE NEEDED')
            .setDescription(
              `**${game.opponentNameSnapshot ?? 'Upcoming game'}** starts ${discordTimestamp(game.scheduledAtUtc, 'R')}. Add the server and code for the confirmed lineup.`,
            ),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(customId('game-action', game.id, 'set-code'))
              .setLabel('Set Server / Code')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      });
      return message.id;
    } catch (error) {
      logger.warn({ error, channelId, gameId: game.id }, 'management game reminder failed');
      return null;
    }
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
