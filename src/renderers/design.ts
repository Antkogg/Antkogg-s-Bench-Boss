import { EmbedBuilder } from 'discord.js';
import { BRAND } from '../config/constants.js';

export function brandedEmbed(color: number = BRAND.colors.primary): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${BRAND.shortName}  •  ${BRAND.descriptor}` })
    .setFooter({ text: "ANTKOGG'S BENCH BOSS" });
}

export function renderSuccess(title: string, description: string): EmbedBuilder {
  return brandedEmbed(BRAND.colors.success).setTitle(`✓ ${title}`).setDescription(description);
}

export function renderWarning(title: string, description: string): EmbedBuilder {
  return brandedEmbed(BRAND.colors.warning).setTitle(`⚠ ${title}`).setDescription(description);
}

export function renderError(description: string): EmbedBuilder {
  return brandedEmbed(BRAND.colors.danger)
    .setTitle('Couldn’t complete that')
    .setDescription(description);
}

export function discordTimestamp(date: Date, style: 'D' | 'F' | 'R' | 't' = 'F'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
