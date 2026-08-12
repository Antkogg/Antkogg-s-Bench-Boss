import { logger } from '../utils/logger.js';
import { renderSignupConfirmation } from '../renderers/notification.renderer.js';
import { renderWaitlistOffer } from '../renderers/notification.renderer.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';
export class NotificationService {
    client;
    constructor(client) {
        this.client = client;
    }
    async signup(userId, session, position, eaTag) {
        return this.send(userId, { embeds: [renderSignupConfirmation(session, position, eaTag)] }, 'signup confirmation');
    }
    async positionChanged(userId, session, from, to) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('POSITION UPDATED')
                    .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n**${from} → ${to}**\nYour lineup spot has been updated.`),
            ],
        }, 'position changed');
    }
    async removed(userId, session, reason) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('LINEUP UPDATE')
                    .setDescription(`${discordTimestamp(session.startsAt, 'F')}\nYou were removed from this lineup.${reason ? `\n\n${reason}` : ''}`),
            ],
        }, 'removed');
    }
    async reminder(userId, session, position) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('🏒 SCOUTING REMINDER')
                    .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n${discordTimestamp(session.startsAt, 'R')}\n\nPosition: **${position}**`),
            ],
        }, 'reminder');
    }
    async status(userId, session, title, message) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle(title)
                    .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n${message}`),
            ],
        }, 'status notification');
    }
    async waitlistOffer(userId, session, position, token) {
        return this.send(userId, renderWaitlistOffer(session, position, token), 'waitlist offer');
    }
    async send(userOrId, options, event) {
        const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;
        try {
            const user = typeof userOrId === 'string' ? await this.client.users.fetch(userOrId) : userOrId;
            await user.send(options);
            logger.info({ userId, event }, 'notification sent');
            return true;
        }
        catch (error) {
            logger.warn({ error, userId, event }, 'notification failed');
            return false;
        }
    }
}
//# sourceMappingURL=notification.service.js.map