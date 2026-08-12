import type { Interaction } from 'discord.js';
import { handleBoard, handlePlayerSearch } from '../commands/management.js';
import { handleHelp } from '../commands/help.js';
import { handleProfile } from '../commands/profile.js';
import { handleScout, handleScoutingBrowser } from '../commands/scouting.js';
import { handleSetup } from '../commands/setup.js';
import type { BotContext } from '../commands/context.js';
import { renderError } from '../renderers/design.js';
import { waitlistPrompt, handleButton } from '../interactions/buttons.js';
import { handleManagementModal, handleRegistrationModal } from '../interactions/modals.js';
import { handleSelectMenu } from '../interactions/select-menus.js';
import { parseCustomId } from '../utils/custom-id.js';
import { AppError, publicErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export async function routeInteraction(
  interaction: Interaction,
  context: BotContext,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'profile') await handleProfile(interaction, context);
      else if (interaction.commandName === 'scouting')
        await handleScoutingBrowser(interaction, context);
      else if (interaction.commandName === 'scout') await handleScout(interaction, context);
      else if (interaction.commandName === 'setup') await handleSetup(interaction, context);
      else if (interaction.commandName === 'player') await handlePlayerSearch(interaction, context);
      else if (interaction.commandName === 'board') await handleBoard(interaction, context);
      else if (interaction.commandName === 'help') await handleHelp(interaction);
      return;
    }
    if (interaction.isButton()) {
      const parsed = parseCustomId(interaction.customId);
      await handleButton(interaction, context, parsed);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, context, parseCustomId(interaction.customId));
      return;
    }
    if (interaction.isModalSubmit()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed.action === 'modal-register') await handleRegistrationModal(interaction, context);
      else if (parsed.action === 'modal-manage')
        await handleManagementModal(interaction, context, parsed);
    }
  } catch (error) {
    logger.error(
      { error, interactionId: interaction.id, type: interaction.type, userId: interaction.user.id },
      'interaction failed',
    );
    if (error instanceof AppError && error.code === 'POSITION_TAKEN' && interaction.isButton()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed.action === 'signup' && parsed.value) {
        const response = waitlistPrompt(
          parsed.entityId,
          parsed.value as Parameters<typeof waitlistPrompt>[1],
        );
        if (interaction.replied || interaction.deferred)
          await interaction.followUp({ ephemeral: true, ...response });
        else await interaction.reply({ ephemeral: true, ...response });
        return;
      }
    }
    if (!interaction.isRepliable()) return;
    const response = {
      ephemeral: true as const,
      embeds: [renderError(publicErrorMessage(error))],
      components: [],
    };
    if (interaction.deferred) await interaction.editReply(response);
    else if (interaction.replied) await interaction.followUp(response);
    else await interaction.reply(response);
  }
}
