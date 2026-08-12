import type { ChatInputCommandInteraction } from 'discord.js';
import { renderPlayerProfile, renderUnregisteredProfile } from '../renderers/player.renderer.js';
import { AppError } from '../utils/errors.js';
import type { BotContext } from './context.js';

export async function handleProfile(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError(
      'NOT_ALLOWED',
      'Profiles are server-specific. Use this command in the server.',
    );
  try {
    const profile = await context.players.profile(interaction.guildId, interaction.user.id);
    await interaction.reply({ ephemeral: true, ...renderPlayerProfile(profile) });
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_REGISTERED') {
      await interaction.reply({ ephemeral: true, ...renderUnregisteredProfile() });
      return;
    }
    throw error;
  }
}
