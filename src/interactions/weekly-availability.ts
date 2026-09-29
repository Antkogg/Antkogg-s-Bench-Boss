import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { DateTime } from 'luxon';
import type { BotContext } from '../commands/context.js';
import { requireManagement } from '../commands/authorization.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { gameOpponentLabel } from '../renderers/schedule.renderer.js';
import { DEFAULT_TEAM_ROLE_ID } from '../config/constants.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { syncAvailabilityPost } from '../commands/schedule.js';

async function checkTeamRole(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  configRoleId?: string | null,
): Promise<boolean> {
  if (!interaction.guild) return false;
  const role =
    interaction.guild.roles.cache.find((r) => r.name.toLowerCase().includes('s55 bu')) ??
    interaction.guild.roles.cache.get(configRoleId ?? '') ??
    interaction.guild.roles.cache.get(DEFAULT_TEAM_ROLE_ID);

  if (!role) return true; // If no team role configured or found, allow server members

  const member =
    interaction.member && 'roles' in interaction.member
      ? (interaction.member as any)
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) return false;
  return 'cache' in member.roles
    ? member.roles.cache.has(role.id)
    : Array.isArray(member.roles)
      ? member.roles.includes(role.id)
      : false;
}

export async function handleWeeklyAvailabilityButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Submit availability inside the server.');

  const week = await context.weeklyAvailability.getWeek(parsed.entityId);
  if (!week) throw new AppError('STALE_INTERACTION', 'This availability week no longer exists.');

  const hasRole = await checkTeamRole(interaction, week.guildConfig?.rosterRoleId);
  if (!hasRole) {
    throw new AppError(
      'NOT_ALLOWED',
      'Only players with the team role (@S55 BU) can submit availability.',
    );
  }

  // Ensure player profile exists and is on ROSTER
  const player = await context.players.byDiscordId(
    interaction.guildId,
    interaction.user.id,
    interaction.user.displayName ?? interaction.user.username,
    interaction.user.displayAvatarURL(),
  );
  if (player.teamStatus !== 'ROSTER') {
    await context.prisma.player.update({
      where: { id: player.id },
      data: { teamStatus: 'ROSTER', registered: true },
    });
  }

  // 1. Available for ALL (1 Click)
  if (parsed.value === 'avail-all') {
    await interaction.deferReply({ ephemeral: true });
    const gameIds = week.games.map((g) => g.id);
    await context.weeklyAvailability.submit({
      guildId: interaction.guildId,
      discordUserId: interaction.user.id,
      weekId: week.id,
      gameIds,
    });

    const updatedWeek = await context.weeklyAvailability.getWeek(week.id);
    if (updatedWeek) {
      await syncAvailabilityPost(interaction.guildId, updatedWeek as any, context, interaction.client);
    }

    await interaction.editReply({
      embeds: [
        renderSuccess(
          'Availability Saved!',
          `🟢 Marked you **AVAILABLE** for all **${week.games.length}** games this week!\n` +
            `The team availability board has been updated.`,
        ),
      ],
    });
    return;
  }

  // 2. Unavailable for ALL (1 Click)
  if (parsed.value === 'unavailable') {
    await interaction.deferReply({ ephemeral: true });
    await context.weeklyAvailability.submit({
      guildId: interaction.guildId,
      discordUserId: interaction.user.id,
      weekId: week.id,
      gameIds: [],
    });

    const updatedWeek = await context.weeklyAvailability.getWeek(week.id);
    if (updatedWeek) {
      await syncAvailabilityPost(interaction.guildId, updatedWeek as any, context, interaction.client);
    }

    await interaction.editReply({
      embeds: [
        renderSuccess(
          'Availability Saved',
          `🔴 Marked you **OUT** for all games this week.\n` +
            `The team availability board has been updated.`,
        ),
      ],
    });
    return;
  }

  // 3. Pick specific games (Custom checkboxes)
  if (parsed.value === 'pick' || parsed.value === 'submit' || parsed.value === 'edit') {
    await interaction.deferReply({ ephemeral: true });
    const existing = week.submissions.find((s) => s.playerId === player.id);
    const defaults =
      existing?.responses
        .filter((r) => r.status === 'AVAILABLE')
        .map((r) => r.gameId) ?? [];

    if (!week.games.length) {
      throw new AppError('NOT_FOUND', 'No games are configured for this week yet.');
    }

    const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId('weekly-availability-select', week.id))
        .setPlaceholder('Select all games you CAN play (unselected = OUT)...')
        .setMinValues(0)
        .setMaxValues(week.games.length)
        .addOptions(
          week.games.map((g, idx) => ({
            label: `Game ${idx + 1}: ${gameOpponentLabel(g)}`.slice(0, 100),
            value: g.id,
            description: DateTime.fromJSDate(g.scheduledAtUtc).toFormat('cccc h:mm a'),
            default: defaults.includes(g.id),
          })),
        ),
    );

    const embed = brandedEmbed()
      .setTitle(`SELECT YOUR GAMES`)
      .setDescription(
        `Select all the games you are available to play below.\n` +
          `Any unselected games will be saved as **OUT**.\n\n` +
          week.games
            .map(
              (g, i) =>
                `**Game ${i + 1}:** ${gameOpponentLabel(g)} • <t:${Math.floor(g.scheduledAtUtc.getTime() / 1000)}:F>`,
            )
            .join('\n'),
      );

    await interaction.editReply({
      embeds: [embed],
      components: [selectMenu],
    });
    return;
  }

  // 4. Refresh board
  if (parsed.value === 'refresh') {
    await interaction.deferUpdate();
    const updatedWeek = await context.weeklyAvailability.getWeek(week.id);
    if (updatedWeek) {
      await syncAvailabilityPost(interaction.guildId, updatedWeek as any, context, interaction.client);
    }
    return;
  }
}

export async function handleAvailabilityReminderButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId) throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await requireManagement(interaction, context);
  await interaction.deferReply({ ephemeral: true });
  const [week, missing] = await Promise.all([
    context.weeklyAvailability.getWeek(parsed.entityId),
    context.weeklyAvailability.missing(parsed.entityId),
  ]);
  if (!week) throw new AppError('NOT_FOUND', 'Week not found.');
  const scheduledFor = new Date();
  scheduledFor.setSeconds(0, 0);
  let sent = 0;
  for (const player of missing) {
    const claim = await context.prisma.weeklyAvailabilityReminder.upsert({
      where: {
        weekId_playerId_kind_scheduledFor: {
          weekId: week.id,
          playerId: player.id,
          kind: 'MANUAL',
          scheduledFor,
        },
      },
      create: { weekId: week.id, playerId: player.id, kind: 'MANUAL', scheduledFor },
      update: {},
    });
    if (claim.sentAt || claim.failedAt) continue;
    const delivered = await context.notifications.availabilityReminder(
      player.discordUserId,
      week,
      player.teamStatus === 'ROSTER' ? 'required' : 'encouraged',
    );
    await context.prisma.weeklyAvailabilityReminder.update({
      where: { id: claim.id },
      data: delivered ? { sentAt: new Date() } : { failedAt: new Date() },
    });
    if (delivered) sent++;
  }
  await interaction.editReply({
    embeds: [
      renderSuccess(
        'Reminders sent',
        `Delivered **${sent}** DM(s) to players who still have no response.`,
      ),
    ],
  });
}

export async function handleWeeklyAvailabilitySelect(
  interaction: StringSelectMenuInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId)
    throw new AppError('NOT_ALLOWED', 'Submit availability inside the server.');
  await interaction.deferReply({ ephemeral: true });

  const week = await context.weeklyAvailability.getWeek(parsed.entityId);
  if (!week) throw new AppError('STALE_INTERACTION', 'This availability week no longer exists.');

  const selectedGameIds = interaction.values;
  await context.weeklyAvailability.submit({
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
    weekId: parsed.entityId,
    gameIds: selectedGameIds,
  });

  const updatedWeek = await context.weeklyAvailability.getWeek(week.id);
  if (updatedWeek) {
    await syncAvailabilityPost(interaction.guildId, updatedWeek as any, context, interaction.client);
  }

  await interaction.editReply({
    embeds: [
      renderSuccess(
        'Availability Saved!',
        `✅ Updated your availability: **${selectedGameIds.length} of ${week.games.length}** games selected as AVAILABLE.\n` +
          `The team availability board has been updated.`,
      ),
    ],
  });
}
