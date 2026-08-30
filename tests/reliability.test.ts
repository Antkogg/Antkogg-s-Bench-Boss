import type { ChatInputCommandInteraction, Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../src/commands/context.js';
import { handleRule } from '../src/commands/rules.js';
import { NotificationService } from '../src/services/notification.service.js';
import { ScoutingPostService } from '../src/services/scouting-post.service.js';
import type { ScoutingService, ScoutingSessionView } from '../src/services/scouting.service.js';

describe('reliability boundaries', () => {
  it('rebuilds and persists a canonical scouting post when the old Discord message is gone', async () => {
    const send = vi.fn(async () => ({ id: 'new-message' }));
    const saveMessage = vi.fn(async () => undefined);
    const channel = {
      isTextBased: () => true,
      isDMBased: () => false,
      messages: { fetch: vi.fn(async () => Promise.reject(new Error('Unknown Message'))) },
      send,
    };
    const client = {
      channels: { fetch: vi.fn(async () => channel) },
    } as unknown as Client;
    const scouting = { saveMessage } as unknown as ScoutingService;
    const session = {
      id: 'session-1',
      status: 'OPEN',
      channelId: 'channel-1',
      messageId: 'old-message',
      guildConfig: { scoutingChannelId: 'channel-1', timezone: 'America/Edmonton' },
      startsAt: new Date('2026-09-01T01:00:00Z'),
      durationMinutes: 60,
      format: 'ONE_SIDE',
      signupMode: 'OPEN_SIGNUP',
      signupsOpen: true,
      assignments: [],
      waitlists: [],
    } as unknown as ScoutingSessionView;
    await new ScoutingPostService(client, scouting).publish(session);
    expect(send).toHaveBeenCalledOnce();
    expect(saveMessage).toHaveBeenCalledWith('session-1', 'channel-1', 'new-message');
  });

  it('turns a blocked DM into a false delivery result instead of a thrown job error', async () => {
    const client = {
      users: { fetch: vi.fn(async () => Promise.reject(new Error('Cannot send messages'))) },
    } as unknown as Client;
    await expect(
      new NotificationService(client).availabilityEdited('discord-1', 'Week 1'),
    ).resolves.toBe(false);
  });

  it('rejects rule administration for roster/TC/scout users before any mutation', async () => {
    const setActive = vi.fn(async () => ({}));
    const interaction = {
      guildId: 'guild-1',
      guild: {
        members: {
          fetch: vi.fn(async () => ({
            permissions: { has: () => false },
            roles: { cache: { has: () => false } },
          })),
        },
      },
      user: { id: 'player-1' },
      options: { getSubcommand: () => 'admin-state' },
    } as unknown as ChatInputCommandInteraction;
    const context = {
      config: {
        ensure: vi.fn(async () => ({
          ownerRoleId: 'owner',
          gmRoleId: 'gm',
          agmRoleId: 'agm',
          managementRoleId: null,
        })),
      },
      rules: { setActive },
    } as unknown as BotContext;
    await expect(handleRule(interaction, context)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    expect(setActive).not.toHaveBeenCalled();
  });
});
