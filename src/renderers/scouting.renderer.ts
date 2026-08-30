import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbedField,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { BRAND } from '../config/constants.js';
import { ALL_SCOUTING_POSITIONS, groupForScoutingPosition } from '../domain/positions.js';
import { capacity, remainingByGroup } from '../domain/scouting.js';
import type { LineupTeam, PositionGroup, ScoutingPosition } from '../generated/prisma/enums.js';
import type { ScoutingSessionView } from '../services/scouting.service.js';
import { customId } from '../utils/custom-id.js';
import { brandedEmbed, discordTimestamp } from './design.js';

const STATUS_LABELS = {
  OPEN: 'SIGNUPS OPEN',
  LOCKED: 'LINEUP LOCKED',
  IN_PROGRESS: 'SCOUTING IN PROGRESS',
  COMPLETED: 'SCOUTING COMPLETE',
  CANCELLED: 'SESSION CANCELLED',
} as const;

const STATUS_COLORS = {
  OPEN: BRAND.colors.primary,
  LOCKED: BRAND.colors.warning,
  IN_PROGRESS: BRAND.colors.inProgress,
  COMPLETED: BRAND.colors.success,
  CANCELLED: BRAND.colors.danger,
} as const;

function slotLine(
  session: ScoutingSessionView,
  team: LineupTeam,
  position: ScoutingPosition,
): string {
  const assignment = session.assignments.find(
    (item) => item.team === team && item.position === position,
  );
  return assignment ? `**${position}**  \`${assignment.player.eaTag}\`` : `**${position}**  *OPEN*`;
}

function teamFields(
  session: ScoutingSessionView,
  team: LineupTeam,
  title?: string,
): APIEmbedField[] {
  const field = (name: string, positions: readonly ScoutingPosition[]): APIEmbedField => ({
    name,
    value: positions.map((position) => slotLine(session, team, position)).join('\n'),
    inline: true,
  });
  const fields = [
    field(title ? `${title} • FORWARDS` : 'FORWARDS', ['LW', 'C', 'RW']),
    field(title ? `${title} • DEFENSE` : 'DEFENSE', ['LD', 'RD']),
    field(title ? `${title} • GOALIE` : 'GOALIE', ['G']),
  ];
  return fields;
}

function poolText(session: ScoutingSessionView): string {
  const pool = session.availability ?? [];
  if (!pool.length) return '*No signups in pool yet.*';

  const positions: ScoutingPosition[] = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
  const grouped: string[] = [];

  for (const pos of positions) {
    const entries = pool.filter((item) => item.position === pos);
    if (entries.length > 0) {
      const names = entries.map((item) => `\`${item.player.eaTag}\``).join(', ');
      grouped.push(`**${pos}** (${entries.length}): ${names}`);
    }
  }

  const unassigned = pool.filter((item) => !item.position);
  if (unassigned.length > 0) {
    const names = unassigned.map((item) => `\`${item.player.eaTag}\``).join(', ');
    grouped.push(`**General** (${unassigned.length}): ${names}`);
  }

  return grouped.join('\n') || '*No signups in pool yet.*';
}

function needsText(session: ScoutingSessionView): string {
  const remaining = remainingByGroup(
    session.format,
    session.assignments.map((item) => item.position),
  );
  const labels: Record<PositionGroup, [string, string]> = {
    FORWARD: ['Forward', 'Forwards'],
    DEFENSE: ['Defense', 'Defense'],
    GOALIE: ['Goalie', 'Goalies'],
  };
  const needs = (Object.entries(remaining) as [PositionGroup, number][])
    .filter(([, count]) => count > 0)
    .map(([group, count]) => `${count} ${labels[group][count === 1 ? 0 : 1]}`);
  return needs.length ? needs.join('  •  ') : '✓ Lineup full';
}

export function renderScoutingSession(session: ScoutingSessionView, viewerDiscordUserId?: string) {
  const total = capacity(session.format);
  const count = session.assignments.length;
  const format = session.format === 'ONE_SIDE' ? 'LG SCOUTING' : 'PRIVATE 6V6';
  const signupState =
    session.status === 'OPEN' && !session.signupsOpen
      ? 'SIGNUPS CLOSED'
      : STATUS_LABELS[session.status];
  const titleText = session.note ? session.note : format;
  const poolCount = (session.availability ?? []).length;
  const embed = brandedEmbed(STATUS_COLORS[session.status])
    .setTitle(`${titleText}  •  ${signupState}`)
    .setDescription(
      [`## ${discordTimestamp(session.startsAt, 'F')}`, discordTimestamp(session.startsAt, 'R')]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields(
      ...teamFields(session, 'TEAM_1', session.format === 'PRIVATE_6V6' ? 'TEAM 1' : undefined),
    );

  if (session.format === 'PRIVATE_6V6') embed.addFields(...teamFields(session, 'TEAM_2', 'TEAM 2'));
  embed
    .addFields(
      {
        name: `${count === total ? '✓ ' : ''}${count} / ${total} CONFIRMED STARTERS`,
        value: needsText(session),
        inline: false,
      },
      {
        name: `SIGNUP POOL (${poolCount} Interested)`,
        value: poolText(session),
        inline: false,
      },
      {
        name: 'HOW TO SIGN UP',
        value:
          session.status === 'OPEN' && session.signupsOpen
            ? session.signupMode === 'AVAILABILITY'
              ? 'Tap **I’m Available**. Management will build the lineup from the availability pool.'
              : 'Tap a position below (**LW**, **C**, **RW**, **LD**, **RD**, **G**) to join or switch in the signup pool. Management will confirm starters for the lineup.'
            : 'The lineup is preserved here. Player controls are currently disabled.',
        inline: false,
      },
    )
    .setTimestamp(session.updatedAt);

  return { embeds: [embed], components: scoutingComponents(session, viewerDiscordUserId) };
}

export function scoutingComponents(
  session: ScoutingSessionView,
  viewerDiscordUserId?: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const active = session.status === 'OPEN' && session.signupsOpen;
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const positionRows: ScoutingPosition[][] = [
    ['LW', 'C', 'RW'],
    ['LD', 'RD', 'G'],
  ];

  const userPoolEntry = viewerDiscordUserId
    ? (session.availability ?? []).find((item) => item.player.discordUserId === viewerDiscordUserId)
    : null;

  for (const positions of positionRows) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const position of positions) {
      const isSelected = userPoolEntry?.position === position;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId('signup', session.id, position))
          .setLabel(isSelected ? `✓ ${position}` : position)
          .setStyle(
            isSelected
              ? ButtonStyle.Success
              : groupForScoutingPosition(position) === 'GOALIE'
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary,
          )
          .setDisabled(!active || session.signupMode === 'AVAILABILITY'),
      );
    }
    rows.push(row);
  }
  const leave = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('leave', session.id))
      .setLabel('Leave Game')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!active || session.signupMode === 'AVAILABILITY'),
    new ButtonBuilder()
      .setCustomId(customId('manage', session.id))
      .setLabel('Management')
      .setStyle(ButtonStyle.Secondary),
  );
  if (session.signupMode === 'AVAILABILITY' && active) {
    leave.addComponents(
      new ButtonBuilder()
        .setCustomId(customId('availability', session.id, 'toggle'))
        .setLabel("I'm Available")
        .setStyle(ButtonStyle.Success),
    );
  }
  rows.push(leave);
  return rows;
}

export function renderWaitlistButtons(
  sessionId: string,
  group: PositionGroup,
  preferredPosition?: ScoutingPosition,
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('waitlist', sessionId, `${group}.${preferredPosition ?? ''}`))
      .setLabel(
        `Join ${group === 'GOALIE' ? 'Goalie' : group === 'DEFENSE' ? 'Defense' : 'Forward'} Waitlist`,
      )
      .setStyle(ButtonStyle.Primary),
  );
}

export function positionCapacityAvailable(
  session: ScoutingSessionView,
  position: ScoutingPosition,
): boolean {
  const max = session.format === 'PRIVATE_6V6' ? 2 : 1;
  return session.assignments.filter((assignment) => assignment.position === position).length < max;
}

export const SCOUTING_POSITIONS = ALL_SCOUTING_POSITIONS;
