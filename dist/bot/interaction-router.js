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
import { renderError } from '../renderers/design.js';
import { waitlistPrompt, handleButton } from '../interactions/buttons.js';
import { handleManagementModal, handleRegistrationModal } from '../interactions/modals.js';
import { handleSelectMenu } from '../interactions/select-menus.js';
import { handleAvailabilityReminderButton, handleWeeklyAvailabilityButton, handleWeeklyAvailabilitySelect, } from '../interactions/weekly-availability.js';
import { handleGameButton, handleGameCodeModal, handleGameStatusSelect, handleLineupButton, handleLineupPlayerSelect, handleLineupPositionSelect, handlePlayerGameButton, handleWeekButton, handleWeekDayModal, handleWeekGameSelect, } from '../interactions/schedule.js';
import { handleWelcomeButton, handleWelcomeSelectMenu } from '../interactions/welcome.js';
import { parseCustomId } from '../utils/custom-id.js';
import { AppError, publicErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
export async function routeInteraction(interaction, context) {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'profile')
                await handleProfile(interaction, context);
            else if (interaction.commandName === 'scouting')
                await handleScoutingBrowser(interaction, context);
            else if (interaction.commandName === 'scout')
                await handleScout(interaction, context);
            else if (interaction.commandName === 'setup')
                await handleSetup(interaction, context);
            else if (interaction.commandName === 'player')
                await handlePlayerSearch(interaction, context);
            else if (interaction.commandName === 'board')
                await handleBoard(interaction, context);
            else if (interaction.commandName === 'help')
                await handleHelp(interaction, context);
            else if (interaction.commandName === 'availability')
                await handleAvailability(interaction, context);
            else if (interaction.commandName === 'team')
                await handleTeam(interaction, context);
            else if (interaction.commandName === 'tc')
                await handleTc(interaction, context);
            else if (interaction.commandName === 'rules')
                await handleRules(interaction, context);
            else if (interaction.commandName === 'rule')
                await handleRule(interaction, context);
            else if (interaction.commandName === 'builds')
                await handleBuilds(interaction, context);
            else if (interaction.commandName === 'disconnect')
                await handleDisconnect(interaction, context);
            else if (interaction.commandName === 'announce')
                await handleAnnouncement(interaction, context);
            else if (interaction.commandName === 'timezone')
                await handleTimezone(interaction, context);
            else if (interaction.commandName === 'week')
                await handleWeek(interaction, context);
            else if (interaction.commandName === 'schedule')
                await handleSchedule(interaction, context);
            else if (interaction.commandName === 'game')
                await handleGame(interaction, context);
            return;
        }
        if (interaction.isButton()) {
            const parsed = parseCustomId(interaction.customId);
            if (parsed.action === 'welcome-group')
                await handleWelcomeButton(interaction, context, parsed);
            else if (parsed.action === 'weekly-availability')
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
            else
                await handleButton(interaction, context, parsed);
            return;
        }
        if (interaction.isStringSelectMenu()) {
            const parsed = parseCustomId(interaction.customId);
            if (parsed.action === 'welcome-positions')
                await handleWelcomeSelectMenu(interaction, context, parsed);
            else if (parsed.action === 'weekly-availability-select')
                await handleWeeklyAvailabilitySelect(interaction, context, parsed);
            else if (parsed.action === 'week-game-select')
                await handleWeekGameSelect(interaction, context);
            else if (parsed.action === 'lineup-position-select')
                await handleLineupPositionSelect(interaction, context);
            else if (parsed.action === 'lineup-player-select')
                await handleLineupPlayerSelect(interaction, context, parsed);
            else if (parsed.action === 'game-status-select')
                await handleGameStatusSelect(interaction, context, parsed);
            else
                await handleSelectMenu(interaction, context, parsed);
            return;
        }
        if (interaction.isModalSubmit()) {
            const parsed = parseCustomId(interaction.customId);
            if (parsed.action === 'modal-register')
                await handleRegistrationModal(interaction, context);
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
                const raw = focused.value.trim().toLowerCase();
                const allTimes = [];
                const hoursOrder = [
                    { h: 3, p: 'PM' }, { h: 4, p: 'PM' }, { h: 5, p: 'PM' }, { h: 6, p: 'PM' },
                    { h: 7, p: 'PM' }, { h: 8, p: 'PM' }, { h: 9, p: 'PM' }, { h: 10, p: 'PM' },
                    { h: 11, p: 'PM' }, { h: 12, p: 'PM' }, { h: 1, p: 'PM' }, { h: 2, p: 'PM' },
                    { h: 12, p: 'AM' }, { h: 1, p: 'AM' }, { h: 2, p: 'AM' }, { h: 3, p: 'AM' },
                    { h: 4, p: 'AM' }, { h: 5, p: 'AM' }, { h: 6, p: 'AM' }, { h: 7, p: 'AM' },
                    { h: 8, p: 'AM' }, { h: 9, p: 'AM' }, { h: 10, p: 'AM' }, { h: 11, p: 'AM' },
                ];
                for (const item of hoursOrder) {
                    for (const min of ['00', '15', '30', '45']) {
                        allTimes.push(`${item.h}:${min} ${item.p}`);
                    }
                }
                let filtered = allTimes;
                if (raw) {
                    const cleanDigits = raw.replace(/[^0-9]/g, '');
                    const hasP = raw.includes('p');
                    const hasA = raw.includes('a');
                    filtered = allTimes.filter((t) => {
                        const tLower = t.toLowerCase();
                        const hourStr = t.split(':')[0];
                        const noSpace = tLower.replace(/\s+/g, '');
                        const isPm = tLower.includes('pm');
                        const isAm = tLower.includes('am');
                        if (hasP && !isPm)
                            return false;
                        if (hasA && !isAm)
                            return false;
                        return (tLower.includes(raw) ||
                            noSpace.includes(raw.replace(/\s+/g, '')) ||
                            hourStr === raw ||
                            (cleanDigits.length > 0 &&
                                (hourStr === cleanDigits || noSpace.replace(/[^0-9]/g, '').startsWith(cleanDigits))));
                    });
                }
                await interaction.respond(filtered.slice(0, 25).map((choice) => ({ name: choice, value: choice })));
            }
            else if ((focused.name === 'player' || focused.name === 'query') && interaction.guildId) {
                const players = await context.players.search(interaction.guildId, focused.value);
                await interaction.respond(players.slice(0, 25).map((p) => ({
                    name: `${p.discordDisplayName} (${p.eaTag})`,
                    value: p.discordUserId,
                })));
            }
            return;
        }
    }
    catch (error) {
        logger.error({ error, interactionId: interaction.id, type: interaction.type, userId: interaction.user.id }, 'interaction failed');
        if (error instanceof AppError && error.code === 'POSITION_TAKEN' && interaction.isButton()) {
            const parsed = parseCustomId(interaction.customId);
            if (parsed.action === 'signup' && parsed.value) {
                const response = waitlistPrompt(parsed.entityId, parsed.value);
                if (interaction.replied || interaction.deferred)
                    await interaction.followUp({ ephemeral: true, ...response });
                else
                    await interaction.reply({ ephemeral: true, ...response });
                return;
            }
        }
        if (!interaction.isRepliable())
            return;
        const response = {
            ephemeral: true,
            embeds: [renderError(publicErrorMessage(error))],
            components: [],
        };
        try {
            if (interaction.deferred)
                await interaction.editReply(response);
            else if (interaction.replied)
                await interaction.followUp(response);
            else
                await interaction.reply(response);
        }
        catch (replyError) {
            logger.error({ error: replyError, interactionId: interaction.id }, 'failed to send error reply');
        }
    }
}
//# sourceMappingURL=interaction-router.js.map