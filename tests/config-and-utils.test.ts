import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { customId, parseCustomId } from '../src/utils/custom-id.js';
import { normalizeIdentity } from '../src/utils/normalize.js';

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
});
