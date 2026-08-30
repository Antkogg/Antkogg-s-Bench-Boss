import type { ChatInputCommandInteraction } from 'discord.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import {
  renderGame,
  renderManagementWeek,
  renderPlayerWeek,
} from '../renderers/schedule.renderer.js';
import { renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';

export async function handleTimezone(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  if (interaction.options.getSubcommand() === 'set') {
    const timezone = interaction.options.getString('timezone', true);
    await context.schedule.setManagementTimezone(
      interaction.guildId,
      interaction.user.id,
      timezone,
      interaction.user.id,
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [
        renderSuccess(
          'Timezone saved',
          `Schedule times you enter will be interpreted as **${timezone}**.`,
        ),
      ],
    });
  } else {
    const timezone = await context.schedule.managementTimezone(
      interaction.guildId,
      interaction.user.id,
    );
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Management timezone', timezone)],
    });
  }
}

export async function handleWeek(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  const subcommand = interaction.options.getSubcommand();
  const week =
    subcommand === 'setup'
      ? await context.schedule.createWeek({
          guildId: interaction.guildId,
          seasonNumber: interaction.options.getInteger('season', true),
          weekNumber: interaction.options.getInteger('week', true),
          ...(interaction.options.getString('sunday')
            ? { sundayDate: interaction.options.getString('sunday')! }
            : {}),
          actorDiscordId: interaction.user.id,
        })
      : subcommand === 'next'
        ? await context.schedule.createNextWeek(interaction.guildId, interaction.user.id)
        : await context.schedule.currentWeek(interaction.guildId);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
  await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
}

export async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const [week, config, member] = await Promise.all([
    context.schedule.currentWeek(interaction.guildId),
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!week) throw new AppError('NOT_FOUND', 'No current week was found.');
  if (hasManagementAccess(accessLevel(member, config))) {
    await interaction.reply({ ephemeral: true, ...renderManagementWeek(week) });
    return;
  }
  const player = await context.players.byDiscordId(
    interaction.guildId,
    interaction.user.id,
    interaction.user.displayName ?? interaction.user.username,
    interaction.user.displayAvatarURL(),
  );
  await interaction.reply({ ephemeral: true, ...renderPlayerWeek(week, player.id) });
}

export async function handleGame(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  const management = hasManagementAccess(accessLevel(member, config));
  const player = management
    ? null
    : await context.players.byDiscordId(
        interaction.guildId,
        interaction.user.id,
        interaction.user.displayName ?? interaction.user.username,
        interaction.user.displayAvatarURL(),
      );
  const game = await context.schedule.nearestGame(interaction.guildId, player?.id);
  if (!game)
    throw new AppError(
      'NOT_FOUND',
      management ? 'No upcoming game was found.' : 'You do not have an upcoming confirmed game.',
    );
  await interaction.reply({ ephemeral: true, ...renderGame(game, management, player?.id) });
}
