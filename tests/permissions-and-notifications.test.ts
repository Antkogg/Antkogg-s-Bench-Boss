import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { accessLevel, hasManagementAccess } from '../src/domain/permissions.js';
import {
  renderSignupConfirmation,
  renderWaitlistOffer,
} from '../src/renderers/notification.renderer.js';
import type { ScoutingSessionView } from '../src/services/scouting-view.js';

function member(administrator: boolean, roles: string[]): GuildMember {
  return {
    permissions: {
      has: (permission: bigint) =>
        administrator && permission === PermissionFlagsBits.Administrator,
    },
    roles: { cache: { has: (roleId: string) => roles.includes(roleId) } },
  } as unknown as GuildMember;
}

const session = {
  id: 'session',
  startsAt: new Date('2026-08-20T01:00:00Z'),
  durationMinutes: 60,
  assignments: [],
  waitlists: [],
  guildConfig: {},
} as unknown as ScoutingSessionView;

describe('permissions and notification payloads', () => {
  it('distinguishes player, management, and administrator access', () => {
    expect(accessLevel(member(false, []), 'management')).toBe('PLAYER');
    expect(accessLevel(member(false, ['management']), 'management')).toBe('MANAGEMENT');
    expect(accessLevel(member(true, []), 'management')).toBe('ADMIN');
    expect(hasManagementAccess('PLAYER')).toBe(false);
    expect(hasManagementAccess('MANAGEMENT')).toBe(true);
    expect(hasManagementAccess('ADMIN')).toBe(true);
  });

  it('builds signup DMs independently from the live Discord client', () => {
    const embed = renderSignupConfirmation(session, 'C', 'xX AnTkOgG Xx').toJSON();
    expect(JSON.stringify(embed)).toContain("YOU'RE CONFIRMED");
    expect(JSON.stringify(embed)).toContain('xX AnTkOgG Xx');
    expect(JSON.stringify(embed)).toContain('POSITION');
  });

  it('builds a timed, one-click waitlist offer', () => {
    const payload = renderWaitlistOffer(session, 'RW', 'offer-token');
    expect(payload.components[0]!.toJSON().components).toHaveLength(2);
    expect(JSON.stringify(payload)).toContain('RW');
    expect(JSON.stringify(payload)).toContain('Take Spot');
  });
});
