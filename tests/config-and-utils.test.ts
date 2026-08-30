import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { customId, parseCustomId } from '../src/utils/custom-id.js';
import { normalizeIdentity, parseFlexibleTime } from '../src/utils/normalize.js';

describe('configuration and identity safety', () => {
  it('normalizes only matching identity while preserving display input elsewhere', () => {
    expect(normalizeIdentity('  xX  AnTkOgG  Xx  ')).toBe('xx antkogg xx');
  });

  it('rejects missing startup secrets with a clear error', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DISCORD_TOKEN/);
  });

  it('accepts valid configuration', () => {
    expect(
      loadEnv({
        NODE_ENV: 'test',
        DISCORD_TOKEN: 'secret',
        DISCORD_CLIENT_ID: '1234',
        DATABASE_URL: 'postgresql://user:pass@localhost/db',
      }).NODE_ENV,
    ).toBe('test');
  });

  it('treats a blank optional guild ID as unset for production env files', () => {
    expect(
      loadEnv({
        NODE_ENV: 'production',
        DISCORD_TOKEN: 'secret',
        DISCORD_CLIENT_ID: '1234',
        DISCORD_GUILD_ID: '',
        DATABASE_URL: 'postgresql://user:pass@neon.example/db?sslmode=require',
      }).DISCORD_GUILD_ID,
    ).toBeUndefined();
  });

  it('round-trips deterministic restart-safe custom IDs', () => {
    const id = customId('signup', 'session123', 'C');
    expect(parseCustomId(id)).toEqual({ action: 'signup', entityId: 'session123', value: 'C' });
    expect(id.length).toBeLessThanOrEqual(100);
  });

  it('parses flexible time inputs like 3, 4, 330, 4pm, 8:30', () => {
    expect(parseFlexibleTime('3')).toEqual({ hours: 15, minutes: 0 });
    expect(parseFlexibleTime('4')).toEqual({ hours: 16, minutes: 0 });
    expect(parseFlexibleTime('330')).toEqual({ hours: 15, minutes: 30 });
    expect(parseFlexibleTime('4pm')).toEqual({ hours: 16, minutes: 0 });
    expect(parseFlexibleTime('8:30 PM')).toEqual({ hours: 20, minutes: 30 });
    expect(parseFlexibleTime('9:15 AM')).toEqual({ hours: 9, minutes: 15 });
  });
});
