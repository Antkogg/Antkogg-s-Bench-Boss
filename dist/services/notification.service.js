import { ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { logger } from '../utils/logger.js';
import { renderSignupConfirmation } from '../renderers/notification.renderer.js';
import { renderWaitlistOffer } from '../renderers/notification.renderer.js';
import { brandedEmbed, discordTimestamp } from '../renderers/design.js';
import { customId } from '../utils/custom-id.js';
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
    async availabilityReminder(userId, week, policy = 'required') {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('WEEKLY AVAILABILITY REMINDER')
                    .setDescription(`${policy === 'required' ? 'Your response is required' : 'Your response is encouraged'} for **${week.label}** and has not been submitted.\nDeadline: ${discordTimestamp(week.deadline, 'F')} (${discordTimestamp(week.deadline, 'R')})`),
            ],
            components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(customId('weekly-availability', week.id, 'submit'))
                    .setLabel('Submit Availability')
                    .setStyle(ButtonStyle.Primary)),
            ],
        }, 'weekly availability reminder');
    }
    async availabilityEdited(userId, label) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('AVAILABILITY UPDATED')
                    .setDescription(`Management updated your availability for **${label}**. Use the weekly post to review it.`),
            ],
        }, 'availability management edit');
    }
    async lineupConfirmed(userId, game, position) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('LINEUP CONFIRMED')
                    .setDescription(`You are confirmed at **${position}** ${game.homeAway === 'AWAY' ? '@' : 'vs'} **${game.opponentNameSnapshot ?? 'TBD'}**.\n${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})\n\nUse \`/game\` for the current server and code.`),
            ],
            components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(customId('player-game', game.id))
                    .setLabel('View Game')
                    .setStyle(ButtonStyle.Primary)),
            ],
        }, 'regular-season lineup confirmation');
    }
    async lineupRemoved(userId, game, position) {
        if (!game)
            return false;
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('LINEUP UPDATED')
                    .setDescription(`You are no longer confirmed at **${position}** for **${game.opponentNameSnapshot ?? 'this game'}** on ${discordTimestamp(game.scheduledAtUtc, 'F')}.`),
            ],
        }, 'regular-season lineup removal');
    }
    async gameInfoReady(userId, game, position) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('GAME DETAILS READY')
                    .setDescription(`**${position}** • ${game.opponentNameSnapshot ?? 'Scheduled game'}\n${discordTimestamp(game.scheduledAtUtc, 'F')}\n\n**Server:** ${game.gameServer ?? 'Not set'}\n**Code:** ${game.gameCode ?? 'Not set'}`),
            ],
        }, 'regular-season game details');
    }
    async regularGameStatus(userId, game) {
        return this.send(userId, {
            embeds: [
                brandedEmbed()
                    .setTitle('GAME STATUS UPDATED')
                    .setDescription(`**${game.opponentNameSnapshot ?? 'Scheduled game'}** is now **${game.status}**.\n${discordTimestamp(game.scheduledAtUtc, 'F')} (${discordTimestamp(game.scheduledAtUtc, 'R')})`),
            ],
        }, 'regular-season game status');
    }
    async serverCodeMissing(channelId, game) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel?.isSendable())
                return null;
            const message = await channel.send({
                embeds: [
                    brandedEmbed()
                        .setTitle('SERVER / CODE NEEDED')
                        .setDescription(`**${game.opponentNameSnapshot ?? 'Upcoming game'}** starts ${discordTimestamp(game.scheduledAtUtc, 'R')}. Add the server and code for the confirmed lineup.`),
                ],
                components: [
                    new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(customId('game-action', game.id, 'set-code'))
                        .setLabel('Set Server / Code')
                        .setStyle(ButtonStyle.Primary)),
                ],
            });
            return message.id;
        }
        catch (error) {
            logger.warn({ error, channelId, gameId: game.id }, 'management game reminder failed');
            return null;
        }
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