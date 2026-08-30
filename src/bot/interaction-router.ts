import type { Interaction } from 'discord.js';
import { handleBoard, handlePlayerSearch } from '../commands/management.js';
import { handleHelp } from '../commands/help.js';
import { handleProfile } from '../commands/profile.js';
import { handleScout, handleScoutingBrowser } from '../commands/scouting.js';
import { handleSetup } from '../commands/setup.js';
import { handleAvailability } from '../commands/availability.js';
import { handleTeam, handleTc, handleTeamButton } from '../commands/team.js';
import { handleAnnouncement } from '../commands/announce.js';
import { handleGame, handleSchedule, handleTimezone, handleWeek } from '../commands/schedule.js';
import { handleBuilds, handleDisconnect, handleRule, handleRules } from '../commands/rules.js';
import type { BotContext } from '../commands/context.js';
import { renderError } from '../renderers/design.js';
import { waitlistPrompt, handleButton } from '../interactions/buttons.js';
import { handleManagementModal, handleRegistrationModal } from '../interactions/modals.js';
import { handleSelectMenu } from '../interactions/select-menus.js';
import {
  handleAvailabilityReminderButton,
  handleWeeklyAvailabilityButton,
  handleWeeklyAvailabilitySelect,
} from '../interactions/weekly-availability.js';
import {
  handleGameButton,
  handleGameCodeModal,
  handleGameStatusSelect,
  handleLineupButton,
  handleLineupPlayerSelect,
  handleLineupPositionSelect,
  handlePlayerGameButton,
  handleWeekButton,
  handleWeekDayModal,
  handleWeekGameSelect,
} from '../interactions/schedule.js';
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
      else if (interaction.commandName === 'help') await handleHelp(interaction, context);
      else if (interaction.commandName === 'availability')
        await handleAvailability(interaction, context);
      else if (interaction.commandName === 'team') await handleTeam(interaction, context);
      else if (interaction.commandName === 'tc') await handleTc(interaction, context);
      else if (interaction.commandName === 'rules') await handleRules(interaction, context);
      else if (interaction.commandName === 'rule') await handleRule(interaction, context);
      else if (interaction.commandName === 'builds') await handleBuilds(interaction, context);
      else if (interaction.commandName === 'disconnect')
        await handleDisconnect(interaction, context);
      else if (interaction.commandName === 'announce')
        await handleAnnouncement(interaction, context);
      else if (interaction.commandName === 'timezone') await handleTimezone(interaction, context);
      else if (interaction.commandName === 'week') await handleWeek(interaction, context);
      else if (interaction.commandName === 'schedule') await handleSchedule(interaction, context);
      else if (interaction.commandName === 'game') await handleGame(interaction, context);
      return;
    }
    if (interaction.isButton()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed.action === 'weekly-availability')
        await handleWeeklyAvailabilityButton(interaction, context, parsed);
      else if (parsed.action === 'availability-remind')
        await handleAvailabilityReminderButton(interaction, context, parsed);
      else if (parsed.action === 'team-action')
        await handleTeamButton(interaction, context, parsed);
      else if (parsed.action === 'week-action')
        await handleWeekButton(interaction, context, parsed);
      else if (parsed.action === 'lineup-action')
        await handleLineupButton(interaction, context, parsed);
      else if (parsed.action === 'game-action')
        await handleGameButton(interaction, context, parsed);
      else if (parsed.action === 'player-game')
        await handlePlayerGameButton(interaction, context, parsed);
      else await handleButton(interaction, context, parsed);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed.action === 'weekly-availability-select')
        await handleWeeklyAvailabilitySelect(interaction, context, parsed);
      else if (parsed.action === 'week-game-select')
        await handleWeekGameSelect(interaction, context);
      else if (parsed.action === 'lineup-position-select')
        await handleLineupPositionSelect(interaction, context);
      else if (parsed.action === 'lineup-player-select')
        await handleLineupPlayerSelect(interaction, context, parsed);
      else if (parsed.action === 'game-status-select')
        await handleGameStatusSelect(interaction, context, parsed);
      else await handleSelectMenu(interaction, context, parsed);
      return;
    }
    if (interaction.isModalSubmit()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed.action === 'modal-register') await handleRegistrationModal(interaction, context);
      else if (parsed.action === 'modal-manage')
        await handleManagementModal(interaction, context, parsed);
      else if (parsed.action === 'modal-week-day')
        await handleWeekDayModal(interaction, context, parsed);
      else if (parsed.action === 'modal-game-code')
        await handleGameCodeModal(interaction, context, parsed);
      return;
    }
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'time') {
        const value = focused.value.toLowerCase();
        const times = [
          '5:00 PM',
          '5:15 PM',
          '5:30 PM',
          '5:45 PM',
          '6:00 PM',
          '6:15 PM',
          '6:30 PM',
          '6:45 PM',
          '7:00 PM',
          '7:15 PM',
          '7:30 PM',
          '7:45 PM',
          '8:00 PM',
          '8:15 PM',
          '8:30 PM',
          '8:45 PM',
          '9:00 PM',
          '9:15 PM',
          '9:30 PM',
          '9:45 PM',
          '10:00 PM',
          '10:15 PM',
          '10:30 PM',
          '10:45 PM',
          '11:00 PM',
          '11:15 PM',
          '11:30 PM',
          '11:45 PM',
          '12:00 AM',
          '12:15 AM',
          '12:30 AM',
          '12:45 AM',
          '1:00 AM',
          '1:15 AM',
          '1:30 AM',
          '1:45 AM',
        ];
        const filtered = times.filter((t) => t.toLowerCase().includes(value)).slice(0, 25);
        await interaction.respond(filtered.map((choice) => ({ name: choice, value: choice })));
      } else if ((focused.name === 'player' || focused.name === 'query') && interaction.guildId) {
        const players = await context.players.search(interaction.guildId, focused.value);
        await interaction.respond(
          players.slice(0, 25).map((p) => ({
            name: `${p.discordDisplayName} (${p.eaTag})`,
            value: p.discordUserId,
          })),
        );
      }
      return;
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
    try {
      if (interaction.deferred) await interaction.editReply(response);
      else if (interaction.replied) await interaction.followUp(response);
      else await interaction.reply(response);
    } catch (replyError) {
      logger.error(
        { error: replyError, interactionId: interaction.id },
        'failed to send error reply',
      );
    }
  }
}
