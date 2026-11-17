import { describe, it, expect } from 'vitest';
import { assertSafeLoginSettings, isDevLoginEnabled } from '@/utils/devLogin';

const local = { DB_PROVIDER: 'local' };

describe('isDevLoginEnabled', () => {
  it('is on only with DEV_LOGIN=true, outside production, on the local database', () => {
    expect(isDevLoginEnabled({ ...local, DEV_LOGIN: 'true', NODE_ENV: 'development' })).toBe(true);
    expect(isDevLoginEnabled({ ...local, DEV_LOGIN: 'true' })).toBe(true);
  });

  it('is off without the variable, with any other value, and in production', () => {
    expect(isDevLoginEnabled({ ...local })).toBe(false);
    expect(isDevLoginEnabled({ ...local, DEV_LOGIN: '1' })).toBe(false);
    expect(isDevLoginEnabled({ ...local, DEV_LOGIN: 'true', NODE_ENV: 'production' })).toBe(false);
  });

  it('is off on the production database (Neon), also on a local server', () => {
    expect(isDevLoginEnabled({ DEV_LOGIN: 'true', NODE_ENV: 'development', DB_PROVIDER: 'neon' })).toBe(false);
    expect(isDevLoginEnabled({ DEV_LOGIN: 'true', NODE_ENV: 'development' })).toBe(false);
  });
});

describe('assertSafeLoginSettings', () => {
  it('refuses DEV_LOGIN and SKIP_TOTP in production', () => {
    expect(() => assertSafeLoginSettings({ ...local, NODE_ENV: 'production', DEV_LOGIN: 'true' })).toThrow('DEV_LOGIN=true is not allowed in production');
    expect(() => assertSafeLoginSettings({ ...local, NODE_ENV: 'production', SKIP_TOTP: 'true' })).toThrow('SKIP_TOTP=true is not allowed in production');
  });

  it('refuses DEV_LOGIN with the production database (Neon), also on a local server', () => {
    expect(() => assertSafeLoginSettings({ NODE_ENV: 'development', DEV_LOGIN: 'true', DB_PROVIDER: 'neon' }))
      .toThrow('DEV_LOGIN=true is only allowed with DB_PROVIDER=local (found: neon)');
  });

  it('allows them in development on the local database, and production without them', () => {
    expect(() => assertSafeLoginSettings({ ...local, NODE_ENV: 'development', DEV_LOGIN: 'true', SKIP_TOTP: 'true' })).not.toThrow();
    expect(() => assertSafeLoginSettings({ NODE_ENV: 'production', DB_PROVIDER: 'neon' })).not.toThrow();
    expect(() => assertSafeLoginSettings({ NODE_ENV: 'development', DB_PROVIDER: 'neon' })).not.toThrow();
  });
});
