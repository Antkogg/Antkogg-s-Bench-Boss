import { describe, expect, it } from 'vitest';
import type { GuildMember } from 'discord.js';
import type { GuildConfig } from '../src/generated/prisma/client.js';
import {
  renderWelcomeEmbed,
  renderForwardPositionSelect,
  renderDefensePositionSelect,
} from '../src/renderers/welcome.renderer.js';

function mockConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
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
    scoutingChannelId: null,
    scoutingAnnouncementsChannelId: null,
    teamAvailabilityChannelId: null,
    teamAnnouncementsChannelId: null,
    managementChannelId: null,
    rulesChannelId: null,
    welcomeChannelId: '1533692233268728068',
    welcomeMode: 'SCOUTING',
    s55GoalsChannelId: '1534700577789841418',
    lgRulesChannelId: '1543414198741237911',
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
    ...overrides,
  };
}

const mockMember = {
  id: 'user123',
} as GuildMember;

describe('Welcome System', () => {
  it('renders Scouting Mode welcome embed correctly', () => {
    const config = mockConfig({
      welcomeMode: 'SCOUTING',
      scoutingChannelId: '1111111111111111111',
    });
    const res = renderWelcomeEmbed(mockMember, config);

    expect(res.content).toBe('Welcome <@user123>!');
    const embed = res.embeds[0]!.data;
    expect(embed.title).toContain('Welcome to Boston University Terriers Scouting!');
    expect(embed.description).toContain("Antkogg's Official Bot for the S55 Boston University Terriers");
    expect(embed.description).toContain('stay active and watch');
    expect(embed.description).not.toContain('Scouting Mode');
    expect(embed.fields![0]?.value).toContain('<#1534700577789841418>');
    expect(embed.fields![0]?.value).toContain('<#1543414198741237911>');
    expect(embed.fields![0]?.value).toContain('<#1111111111111111111>');
    expect(res.components.length).toBe(2);
    expect(res.components[0]?.components.length).toBe(3);
    expect(res.components[1]?.components.length).toBe(3);
  });

  it('renders Season Mode welcome embed correctly', () => {
    const config = mockConfig({
      welcomeMode: 'SEASON',
      teamAvailabilityChannelId: '2222222222222222222',
    });
    const res = renderWelcomeEmbed(mockMember, config);

    expect(res.content).toBe('Welcome <@user123>!');
    const embed = res.embeds[0]!.data;
    expect(embed.title).toContain('Welcome to Boston University Terriers!');
    expect(embed.description).toContain("Antkogg's Official Bot for the S55 Boston University Terriers");
    expect(embed.description).not.toContain('Season Mode');
    expect(embed.fields![0]?.value).toContain('<#1534700577789841418>');
    expect(embed.fields![0]?.value).toContain('<#1543414198741237911>');
    expect(embed.fields![0]?.value).toContain('<#2222222222222222222>');
  });

  it('renders Forward position select component', () => {
    const res = renderForwardPositionSelect('user123');
    expect(res.content).toContain('forward position');
    expect(res.components.length).toBe(1);
  });

  it('renders Defense position select component', () => {
    const res = renderDefensePositionSelect('user123');
    expect(res.content).toContain('defense position');
    expect(res.components.length).toBe(1);
  });
});
