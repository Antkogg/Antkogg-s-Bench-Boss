import { ActionRowBuilder, StringSelectMenuBuilder, type ButtonInteraction } from 'discord.js';
import type { BotContext } from '../commands/context.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { renderSuccess } from '../renderers/design.js';
import { renderManagementPanel } from '../renderers/management.renderer.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';
import { showManagementModal } from './modals.js';

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
    if (parsed.value === 'list-sessions') {
      const sessions = await context.scouting.upcoming(interaction.guildId);
      if (!sessions.length) {
        await interaction.reply({
          ephemeral: true,
          embeds: [renderSuccess('Active Scouting Sessions', 'No upcoming sessions posted.')],
        });
        return;
      }
      const upcomingSession = sessions[0]!;
      await interaction.reply({ ephemeral: true, ...renderManagementPanel(upcomingSession) });
      return;
    }
    if (parsed.value === 'weekly-avail') {
      const currentWeek = await context.weeklyAvailability.current(interaction.guildId);
      const description = currentWeek
        ? `**Week Status:** ${currentWeek.status}\n**Submissions:** ${currentWeek.submissions.length} players submitted\n**Games This Week:** ${currentWeek.games.length}`
        : 'No weekly availability active right now.';
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Weekly Availability Overview', description)],
      });
      return;
    }
    if (parsed.value === 'search-player') {
      await showManagementModal(interaction, { action: 'modal-manage', entityId: 'search', value: 'search-player' });
      return;
    }
    if (parsed.value === 'setup-view') {
      const details = `**Timezone:** ${config.timezone}\n**Format:** ${config.defaultFormat}\n**Scouting Channel:** <#${config.scoutingChannelId ?? 'Not Set'}>\n**Management Role:** ${config.managementRoleId ? `<@&${config.managementRoleId}>` : 'Server Admins / Managers'}`;
      await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Server Setup Status', details)],
      });
      return;
    }
    if (parsed.value === 'create-session') {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          renderSuccess(
            'Create Scouting Session',
            'To post a new scouting session, use `/scout create date:Today time:8:30 PM format:One Side`',
          ),
        ],
      });
      return;
    }
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
