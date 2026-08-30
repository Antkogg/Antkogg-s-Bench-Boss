import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { ScoutingSessionView } from '../src/services/scouting.service.js';
import { renderScoutingSession } from '../src/renderers/scouting.renderer.js';

function session(overrides: Partial<ScoutingSessionView> = {}): ScoutingSessionView {
  const base = {
    id: 'session1',
    guildConfigId: 'config1',
    startsAt: new Date('2026-08-20T01:00:00Z'),
    durationMinutes: 60,
    format: 'ONE_SIDE',
    signupMode: 'OPEN_SIGNUP',
    status: 'OPEN',
    signupsOpen: true,
    note: null,
    channelId: '100',
    messageId: '200',
    createdByDiscordId: '999',
    createdAt: new Date(),
    updatedAt: new Date(),
    guildConfig: {
      id: 'config1',
      guildId: 'guild1',
      timezone: 'America/New_York',
      managementRoleId: null,
      ownerRoleId: null,
      gmRoleId: null,
      agmRoleId: null,
      rosterRoleId: null,
      tcRoleId: null,
      scoutRoleId: null,
      registeredRoleId: null,
      forwardRoleId: null,
      defenseRoleId: null,
      goalieRoleId: null,
      positionRoleIds: null,
      scoutingChannelId: '100',
      scoutingAnnouncementsChannelId: null,
      teamAvailabilityChannelId: null,
      teamAnnouncementsChannelId: null,
      managementChannelId: null,
      rulesChannelId: null,
      teamName: 'Boston University',
      seasonLabel: 'S55',
      defaultFormat: 'ONE_SIDE',
      defaultDurationMinutes: 60,
      reminderMinutes: [60, 15],
      availabilityReminderMinutes: [1440, 360],
      availabilityDeadlineDayOffset: -1,
      availabilityDeadlineLocalTime: '20:00',
      availabilityOpeningNotices: false,
      serverCodeReminderMinutes: 60,
      notifyConfirmedGameInfo: true,
      tcReminderPolicy: 'ENCOURAGED',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    assignments: [],
    waitlists: [],
  } satisfies ScoutingSessionView;
  return { ...base, ...overrides };
}

function assignment(
  position: 'LW' | 'C' | 'RW' | 'LD' | 'RD' | 'G',
  eaTag: string,
  team: 'TEAM_1' | 'TEAM_2' = 'TEAM_1',
) {
  return {
    id: `a-${team}-${position}`,
    sessionId: 'session1',
    playerId: `p-${eaTag}`,
    team,
    position,
    slotIndex: 0,
    eligibilityOverride: false,
    conflictOverride: false,
    assignedByDiscordId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    player: {
      id: `p-${eaTag}`,
      guildConfigId: 'config1',
      discordUserId: `d-${eaTag}`,
      discordDisplayName: eaTag,
      discordAvatarUrl: null,
      lgUsername: eaTag,
      lgUsernameNormalized: eaTag.toLowerCase(),
      signupPositions:
        position === 'G'
          ? ['G']
          : position === 'LD' || position === 'RD'
            ? ['LD', 'RD']
            : ['LW', 'C', 'RW'],
      positionGroup:
        position === 'G'
          ? 'GOALIE'
          : position === 'LD' || position === 'RD'
            ? 'DEFENSE'
            : 'FORWARD',
      eaTag,
      eaTagNormalized: eaTag.toLowerCase(),
      registered: true,
      internalStatus: 'UNSCOUTED',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as ScoutingSessionView['assignments'][number];
}

describe('canonical scouting renderer', () => {
  it('makes every vacancy and exact EA Tag obvious in a partial one-side lineup', () => {
    const view = renderScoutingSession(
      session({ assignments: [assignment('C', 'xX AnTkOgG Xx'), assignment('LD', 'Puck Mover')] }),
    );
    const json = view.embeds[0]!.toJSON();
    const text = JSON.stringify(json);
    expect(text).toContain('xX AnTkOgG Xx');
    expect(text).toContain('OPEN');
    expect(text).toContain('2 / 6 CONFIRMED');
    expect(view.components).toHaveLength(3);
  });

  it.each(['LOCKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const)(
    'disables player controls in %s state',
    (status) => {
      const rows = renderScoutingSession(session({ status })).components.map((row) => row.toJSON());
      const buttons = rows
        .flatMap((row) => row.components)
        .filter((component) => component.type === ComponentType.Button);
      expect(buttons.slice(0, 6).every((button) => button.disabled)).toBe(true);
    },
  );

  it('renders two complete team groups for private 6v6', () => {
    const view = renderScoutingSession(session({ format: 'PRIVATE_6V6' }));
    const fields = view.embeds[0]!.toJSON().fields ?? [];
    expect(fields.some((field) => field.name.includes('TEAM 1'))).toBe(true);
    expect(fields.some((field) => field.name.includes('TEAM 2'))).toBe(true);
    expect(JSON.stringify(fields)).toContain('0 / 12 CONFIRMED');
  });

  it('uses availability CTA without enabling position buttons', () => {
    const rows = renderScoutingSession(session({ signupMode: 'AVAILABILITY' })).components.map(
      (row) => row.toJSON(),
    );
    expect(
      rows
        .flatMap((row) => row.components)
        .some((component) => 'label' in component && component.label === "I'm Available"),
    ).toBe(true);
    expect(
      rows
        .slice(0, 2)
        .flatMap((row) => row.components)
        .every((button) => button.disabled),
    ).toBe(true);
  });
});
