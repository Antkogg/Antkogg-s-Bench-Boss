import { EmbedBuilder } from 'discord.js';
import { BRAND } from '../config/constants.js';
export function brandedEmbed(color = BRAND.colors.primary) {
    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${BRAND.shortName}  •  ${BRAND.descriptor}` })
        .setFooter({ text: "ANTKOGG'S BENCH BOSS" });
}
export function renderSuccess(title, description) {
    return brandedEmbed(BRAND.colors.success).setTitle(`✓ ${title}`).setDescription(description);
}
export function renderWarning(title, description) {
    return brandedEmbed(BRAND.colors.warning).setTitle(`⚠ ${title}`).setDescription(description);
}
export function renderError(description) {
    return brandedEmbed(BRAND.colors.danger)
        .setTitle('Couldn’t complete that')
        .setDescription(description);
}
export function discordTimestamp(date, style = 'F') {
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
//# sourceMappingURL=design.js.map