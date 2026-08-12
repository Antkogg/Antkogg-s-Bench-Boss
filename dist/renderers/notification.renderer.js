import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';
export function renderSignupConfirmation(session, position, eaTag) {
    return brandedEmbed()
        .setTitle("🏒 YOU'RE CONFIRMED")
        .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n${discordTimestamp(session.startsAt, 'R')}`)
        .addFields({ name: 'POSITION', value: `**${position}**`, inline: true }, { name: 'EA TAG', value: `\`${eaTag}\``, inline: true }, { name: 'NEXT', value: "You're in. We'll remind you before scouting starts." });
}
export function renderWaitlistOffer(session, position, token) {
    return {
        embeds: [
            brandedEmbed()
                .setTitle('🏒 A SPOT OPENED')
                .setDescription(`${discordTimestamp(session.startsAt, 'F')}\n**${position}** is available for 15 minutes.`),
        ],
        components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(customId('offer', token, 'accept'))
                .setLabel('Take Spot')
                .setStyle(ButtonStyle.Success), new ButtonBuilder()
                .setCustomId(customId('offer', token, 'pass'))
                .setLabel('Pass')
                .setStyle(ButtonStyle.Secondary)),
        ],
    };
}
//# sourceMappingURL=notification.renderer.js.map