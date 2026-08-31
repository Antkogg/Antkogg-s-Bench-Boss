import { renderPlayerProfile, renderUnregisteredProfile } from '../renderers/player.renderer.js';
import { AppError } from '../utils/errors.js';
export async function handleProfile(interaction, context) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Profiles are server-specific. Use this command in the server.');
    try {
        const profile = await context.players.profile(interaction.guildId, interaction.user.id, interaction.user.displayName ?? interaction.user.username, interaction.user.displayAvatarURL());
        await interaction.reply({ ephemeral: true, ...renderPlayerProfile(profile) });
    }
    catch (error) {
        if (error instanceof AppError && error.code === 'NOT_REGISTERED') {
            await interaction.reply({ ephemeral: true, ...renderUnregisteredProfile() });
            return;
        }
        throw error;
    }
}
//# sourceMappingURL=profile.js.map