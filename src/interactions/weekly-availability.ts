import {
  ActionRowBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type GuildMember,
  type APIInteractionGuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { DateTime } from 'luxon';
import type { BotContext } from '../commands/context.js';
import { requireManagement } from '../commands/authorization.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { gameOpponentLabel } from '../renderers/schedule.renderer.js';
import {
  DEFAULT_MANAGEMENT_ROLE_ID,
  DEFAULT_ROSTER_ROLE_ID,
  DEFAULT_TC_ROLE_ID,
  DEFAULT_TEAM_ROLE_ID,
} from '../config/constants.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { syncAvailabilityPost } from '../commands/schedule.js';

export function resolveMemberTeamStatus(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
  config?: { rosterRoleId?: string | null; tcRoleId?: string | null } | null,
): 'ROSTER' | 'TC' {
  if (!member) return 'ROSTER';
  const rosterRoleId = config?.rosterRoleId ?? DEFAULT_ROSTER_ROLE_ID;
  const tcRoleId = config?.tcRoleId ?? DEFAULT_TC_ROLE_ID;

  if ('roles' in member && member.roles) {
    if ('cache' in member.roles && member.roles.cache) {
      if (member.roles.cache.has(rosterRoleId)) return 'ROSTER';
      if (member.roles.cache.has(tcRoleId)) return 'TC';
      const hasTc = member.roles.cache.some(
        (r: any) => /\btc\b/i.test(r.name) || r.name.toLowerCase().includes('training camp'),
      );
      if (hasTc) return 'TC';
      return 'ROSTER';
    } else if (Array.isArray(member.roles)) {
      if (member.roles.includes(rosterRoleId)) return 'ROSTER';
      if (member.roles.includes(tcRoleId)) return 'TC';
      return 'ROSTER';
    }
  }
  return 'ROSTER';
}

export async function checkTeamRole(
  interaction: {
    guild?: any;
    member?: any;
    user: { id: string };
  },
  configRosterRoleId?: string | null,
  configTcRoleId?: string | null,
): Promise<boolean> {
  if (!interaction.guild) return false;
  const member =
    interaction.member && 'roles' in interaction.member
      ? (interaction.member as any)
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) return false;

  // Management and admins can always submit availability
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;

  const rosterRoleId = configRosterRoleId ?? DEFAULT_ROSTER_ROLE_ID;
  const tcRoleId = configTcRoleId ?? DEFAULT_TC_ROLE_ID;
  const allowedRoleIds = [rosterRoleId, tcRoleId, DEFAULT_TEAM_ROLE_ID, DEFAULT_MANAGEMENT_ROLE_ID];

  if ('cache' in member.roles && member.roles.cache) {
    if (allowedRoleIds.some((id) => member.roles.cache.has(id))) return true;
    return member.roles.cache.some((r: any) =>
      /\b(owner|gm|agm|coach|management|manager|admin|roster|bu|tc)\b/i.test(r.name),
    );
  }

  if (Array.isArray(member.roles)) {
    if (allowedRoleIds.some((id) => member.roles.includes(id))) return true;
  }

  return false;
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

  const hasRole = await checkTeamRole(
    interaction,
    week.guildConfig?.rosterRoleId,
    week.guildConfig?.tcRoleId,
  );
  if (!hasRole) {
    const roleId = week.guildConfig?.rosterRoleId ?? DEFAULT_ROSTER_ROLE_ID;
    throw new AppError(
      'NOT_ALLOWED',
      `Only players with the team role (<@&${roleId}>) can submit availability.`,
    );
  }

  // Ensure player profile exists and status matches Discord role (ROSTER vs TC)
  const player = await context.players.byDiscordId(
    interaction.guildId,
    interaction.user.id,
    interaction.user.displayName ?? interaction.user.username,
    interaction.user.displayAvatarURL(),
  );
  const resolvedStatus = resolveMemberTeamStatus(interaction.member, week.guildConfig);
  if (player.teamStatus !== resolvedStatus || !player.registered) {
    await context.prisma.player.update({
      where: { id: player.id },
      data: { teamStatus: resolvedStatus, registered: true },
    });
    player.teamStatus = resolvedStatus;
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

  // 3. My Schedule (Privately view player's weekly schedule)
  if (parsed.value === 'my-schedule') {
    await interaction.deferReply({ ephemeral: true });
    const scheduleData = await context.schedule.getPlayerWeeklySchedule(
      interaction.guildId,
      interaction.user.id,
      week.id,
    );
    if (!scheduleData || !scheduleData.totalGames) {
      await interaction.editReply({
        embeds: [
          brandedEmbed()
            .setTitle(`📅 YOUR ${week.label.toUpperCase()} SCHEDULE`)
            .setDescription(
              `You are not currently scheduled for any games in **${week.label}**.\n\n` +
                `Submit your availability so management can assign your line!`,
            ),
        ],
      });
      return;
    }

    const linesByDay = {
      SUNDAY: [] as string[],
      MONDAY: [] as string[],
      TUESDAY: [] as string[],
      OTHER: [] as string[],
    };

    for (const item of scheduleData.assignedGames) {
      const timeUnix = Math.floor(item.game.scheduledAtUtc.getTime() / 1000);
      const opponent = item.game.opponentNameSnapshot ?? 'TBD';
      const matchup = item.game.homeAway === 'AWAY' ? `@ ${opponent}` : `vs ${opponent}`;
      const serverCode =
        item.game.gameServer || item.game.gameCode
          ? ` • \`${item.game.gameServer ?? 'TBD'}\` / \`${item.game.gameCode ?? 'TBD'}\``
          : '';
      const dayList = linesByDay[item.day] ?? linesByDay.OTHER;
      dayList.push(
        `• <t:${timeUnix}:t> **${matchup}** (\`${item.position}\`)${serverCode}`,
      );
    }

    const embed = brandedEmbed()
      .setTitle(`📅 YOUR ${week.label.toUpperCase()} SCHEDULE (${scheduleData.totalGames} Games)`)
      .setDescription(`Personalized lineup and game info for <@${interaction.user.id}>:\n`)
      .addFields(
        {
          name: '🏒 SUNDAY',
          value: linesByDay.SUNDAY.length ? linesByDay.SUNDAY.join('\n') : '• *OFF*',
          inline: false,
        },
        {
          name: '🏒 MONDAY',
          value: linesByDay.MONDAY.length ? linesByDay.MONDAY.join('\n') : '• *OFF*',
          inline: false,
        },
        {
          name: '🏒 TUESDAY',
          value: linesByDay.TUESDAY.length ? linesByDay.TUESDAY.join('\n') : '• *OFF*',
          inline: false,
        },
      )
      .setFooter({ text: `Total: ${scheduleData.totalGames} games assigned` });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // 4. Pick specific games (Custom checkboxes)
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
