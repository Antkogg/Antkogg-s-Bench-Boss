import { DateTime } from 'luxon';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type ButtonInteraction } from 'discord.js';
import type { BotContext } from '../commands/context.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { discordTimestamp, renderSuccess } from '../renderers/design.js';
import { renderManagementPanel } from '../renderers/management.renderer.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { showManagementModal } from './modals.js';

export async function launchSessionFromPreset(
  context: BotContext,
  guildId: string,
  actorDiscordId: string,
  dateStr: string,
  timeStr: string,
  formatStr = 'ONE_SIDE',
) {
  const config = await context.config.ensure(guildId);
  if (!config.scoutingChannelId) {
    throw new AppError('NOT_CONFIGURED', 'Configure the scouting channel with `/setup channels` first.');
  }

  let starts = DateTime.now().setZone(config.timezone);
  if (dateStr.toLowerCase() === 'tomorrow') {
    starts = starts.plus({ days: 1 });
  } else if (dateStr.toLowerCase() !== 'today') {
    const targetDayMap: Record<string, number> = {
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
    };
    const targetDay = targetDayMap[dateStr.toLowerCase()];
    if (targetDay) {
      let daysToAdd = targetDay - starts.weekday;
      if (daysToAdd <= 0) daysToAdd += 7;
      starts = starts.plus({ days: daysToAdd });
    }
  }

  let hours = 0;
  let minutes = 0;
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch && timeMatch[1] && timeMatch[2]) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
  } else {
    const pmMatch = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
    if (pmMatch && pmMatch[1] && pmMatch[3]) {
      hours = parseInt(pmMatch[1], 10);
      minutes = parseInt(pmMatch[2] || '0', 10);
      if (pmMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (pmMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    }
  }

  starts = starts.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  const format = formatStr === 'PRIVATE_6V6' ? 'PRIVATE_6V6' : 'ONE_SIDE';
  const session = await context.scouting.create({
    guildId,
    startsAt: starts.toUTC().toJSDate(),
    durationMinutes: config.defaultDurationMinutes,
    format,
    signupMode: 'OPEN_SIGNUP',
    createdByDiscordId: actorDiscordId,
  });
  await context.posts.publish(session);
  return { session, config };
}

export async function handleManagementButton(
  interaction: ButtonInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this control in the server.');
  const [config, member] = await Promise.all([
    context.config.ensure(interaction.guildId),
    interaction.guild.members.fetch(interaction.user.id),
  ]);
  if (!hasManagementAccess(accessLevel(member, config)))
    throw new AppError('NOT_ALLOWED', 'This control is private to LG Assistant management.');
  if (parsed.action === 'manage-hub') {
    const val = parsed.value ?? parsed.entityId;
    if (val.startsWith('quick.')) {
      const parts = val.split('.');
      const dateStr = parts[1] ?? 'Today';
      const timeStr = parts[2] ?? '8:30 PM';
      const formatStr = parts[3] ?? 'ONE_SIDE';
      const { session, config: gConfig } = await launchSessionFromPreset(
        context,
        interaction.guildId,
        interaction.user.id,
        dateStr,
        timeStr,
        formatStr,
      );
      await interaction.reply({
        ephemeral: true,
        embeds: [
          renderSuccess(
            'Scouting Session Live!',
            `${discordTimestamp(session.startsAt, 'F')} is now live in <#${gConfig.scoutingChannelId}>.`,
          ),
        ],
      });
      return;
    }
    if (val === 'list-sessions') {
      const sessions = await context.scouting.upcoming(interaction.guildId);
      if (!sessions.length) {
        await interaction.reply({
          ephemeral: true,
          embeds: [renderSuccess('Active Scouting Sessions', 'No upcoming sessions posted. Click **➕ New Scouting Session** to post one!')],
        });
        return;
      }
      if (sessions.length === 1) {
        await interaction.reply({ ephemeral: true, ...renderManagementPanel(sessions[0]!) });
        return;
      }
      const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId('manage-hub', 'hub', 'select-session'))
          .setPlaceholder('Choose a scouting session to manage...')
          .addOptions(
            sessions.slice(0, 25).map((session) => ({
              label: `${session.format === 'PRIVATE_6V6' ? '6v6' : '1-Side'} • ${session.assignments.length} confirmed`,
              value: session.id,
              description: `Starts: ${session.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            })),
          ),
      );
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Active Scouting Sessions', 'Select a session below to open its control room:')],
        components: [selectMenu],
      });
      return;
    }
    if (val === 'weekly-avail') {
      const currentWeek = await context.weeklyAvailability.current(interaction.guildId);
      if (!currentWeek) {
        await interaction.reply({
          ephemeral: true,
          embeds: [renderSuccess('Weekly Availability', 'No weekly availability active right now.')],
        });
        return;
      }
      const isWeekOpen = currentWeek.status === 'OPEN';
      const description = `**Week:** ${currentWeek.label}\n**Status:** ${currentWeek.status}\n**Submissions:** ${currentWeek.submissions.length} submitted\n**Games:** ${currentWeek.games.length} games scheduled`;
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId('manage-hub', 'hub', 'toggle-weekly'))
          .setLabel(isWeekOpen ? '🔒 Lock Weekly Availability' : '🔓 Open Weekly Availability')
          .setStyle(isWeekOpen ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(customId('manage-hub', 'hub', 'remind-weekly'))
          .setLabel('📢 Remind Unsubmitted Players')
          .setStyle(ButtonStyle.Primary),
      );
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Weekly Availability Control', description)],
        components: [buttons],
      });
      return;
    }
    if (val === 'toggle-weekly') {
      const currentWeek = await context.weeklyAvailability.current(interaction.guildId);
      if (!currentWeek) throw new AppError('NOT_FOUND', 'No active weekly availability week found.');
      const newStatus = currentWeek.status === 'OPEN' ? 'LOCKED' : 'OPEN';
      await context.weeklyAvailability.setState(currentWeek.id, newStatus, interaction.user.id);
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Weekly Availability Updated', `Weekly availability is now **${newStatus}**.`)],
      });
      return;
    }
    if (val === 'remind-weekly') {
      const currentWeek = await context.weeklyAvailability.current(interaction.guildId);
      if (!currentWeek) throw new AppError('NOT_FOUND', 'No active weekly availability week found.');
      const missing = await context.weeklyAvailability.missing(currentWeek.id);
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Reminders Processed', `Sent availability reminders to **${missing.length}** unsubmitted players.`)],
      });
      return;
    }
    if (val === 'search-player') {
      await showManagementModal(interaction, { action: 'modal-manage', entityId: 'search', value: 'search-player' });
      return;
    }
    if (val === 'setup-view') {
      const details = `**Timezone:** ${config.timezone}\n**Format:** ${config.defaultFormat}\n**Scouting Channel:** <#${config.scoutingChannelId ?? 'Not Set'}>\n**Management Role:** ${config.managementRoleId ? `<@&${config.managementRoleId}>` : 'Server Admins / Managers'}`;
      const tzSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId('manage-hub', 'hub', 'set-tz'))
          .setPlaceholder('Quick-change server timezone...')
          .addOptions(
            { label: 'Eastern Time (EST/EDT)', value: 'America/New_York' },
            { label: 'Central Time (CST/CDT)', value: 'America/Chicago' },
            { label: 'Mountain Time (MST/MDT)', value: 'America/Denver' },
            { label: 'Pacific Time (PST/PDT)', value: 'America/Los_Angeles' },
            { label: 'Atlantic Time (AST/ADT)', value: 'America/Halifax' },
          ),
      );
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Server Setup & Settings', details)],
        components: [tzSelect],
      });
      return;
    }
    if (val === 'create-session') {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          renderSuccess(
            'Create Scouting Session',
            'To post a new scouting session with real-time 15-minute time autocompletion, use:\n\n`/scout create date:Today time:8:30 PM format:One Side`',
          ),
        ],
      });
      return;
    }
    return;
  }
  if (parsed.action === 'manage') {
    const session = await context.scouting.get(parsed.entityId);
    if (!session) throw new AppError('NOT_FOUND', 'Session not found.');
    await interaction.reply({ ephemeral: true, ...renderManagementPanel(session) });
    return;
  }
  if (['add', 'move', 'remove', 'swap', 'note', 'evaluate'].includes(parsed.value ?? ''))
    return showManagementModal(interaction, parsed);
  if (parsed.value === 'history') {
    const view = await context.evaluations.playerView(parsed.entityId);
    const assignments = (view as { assignments?: Array<{ session: { startsAt: Date; status: string }; position: string }> }).assignments ?? [];
    const history = assignments.length
      ? assignments
          .map(
            (entry) =>
              `<t:${Math.floor(entry.session.startsAt.getTime() / 1000)}:D> • **${entry.position}** • ${entry.session.status}`,
          )
          .join('\n')
      : 'No scouting history yet.';
    await interaction.reply({
      ephemeral: true,
      embeds: [renderSuccess('Player history', history)],
    });
    return;
  }
  if (parsed.value === 'status') {
    await interaction.reply({
      ephemeral: true,
      content: 'Choose the internal management status:',
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(customId('manage-action', parsed.entityId, 'set-status'))
            .addOptions(
              ...[
                'UNSCOUTED',
                'SCOUTED',
                'WATCH',
                'INTERESTED',
                'SHORTLIST',
                'PRIORITY',
                'PASS',
              ].map((value) => ({ label: value, value })),
            ),
        ),
      ],
    });
    return;
  }
  let session;
  if (['lock', 'signups', 'start', 'complete', 'cancel', 'repost'].includes(parsed.value ?? '')) {
    await interaction.deferUpdate();
  }
  if (parsed.value === 'lock') {
    const current = await context.scouting.get(parsed.entityId);
    session = await context.scouting.setStatus(
      parsed.entityId,
      current?.status === 'LOCKED' ? 'OPEN' : 'LOCKED',
      interaction.user.id,
    );
  } else if (parsed.value === 'signups') {
    const current = await context.scouting.get(parsed.entityId);
    session = await context.scouting.setSignups(
      parsed.entityId,
      !current?.signupsOpen,
      interaction.user.id,
    );
  } else if (parsed.value === 'start')
    session = await context.scouting.setStatus(parsed.entityId, 'IN_PROGRESS', interaction.user.id);
  else if (parsed.value === 'complete')
    session = await context.scouting.setStatus(parsed.entityId, 'COMPLETED', interaction.user.id);
  else if (parsed.value === 'cancel')
    session = await context.scouting.setStatus(parsed.entityId, 'CANCELLED', interaction.user.id);
  else if (parsed.value === 'repost') {
    session = await context.scouting.get(parsed.entityId);
    if (session) await context.posts.publish(session, true);
  } else throw new AppError('INVALID_INPUT', 'That management action is not available here.');
  if (!session) throw new AppError('NOT_FOUND', 'Session not found.');
  await context.posts.queueRefresh(session.id);
  if (parsed.value === 'lock' || parsed.value === 'cancel') {
    const recipients =
      parsed.value === 'cancel'
        ? [
            ...session.assignments.map((assignment) => ({
              userId: assignment.player.discordUserId,
              position: assignment.position,
            })),
            ...session.waitlists.map((entry) => ({
              userId: entry.player.discordUserId,
              position: undefined,
            })),
          ]
        : session.assignments.map((assignment) => ({
            userId: assignment.player.discordUserId,
            position: assignment.position,
          }));
    await Promise.allSettled(
      [...new Map(recipients.map((recipient) => [recipient.userId, recipient])).values()].map(
        (recipient) =>
          context.notifications.status(
            recipient.userId,
            session,
            parsed.value === 'lock' ? '🔒 LINEUP LOCKED' : 'SCOUTING CANCELLED',
            parsed.value === 'lock'
              ? `You're locked in at **${recipient.position}**.`
              : 'This scouting session has been cancelled.',
          ),
      ),
    );
  }
  await interaction.editReply({ ...renderManagementPanel(session) });
}
