import { describe, it, expect } from 'vitest';
import { MANAGER_NAV, managerNavHref } from '@/shared/managerNav';

describe('managerNavHref', () => {
  it('links server-rendered pages directly', () => {
    expect(managerNavHref({ label: 'Guests', path: '/manager/guests' })).toBe('/manager/guests');
  });

  it('links React pages under /app', () => {
    expect(managerNavHref({ label: 'Areas', path: '/manager/areas', inReactApp: true }))
      .toBe('/app/manager/areas');
  });
});

describe('MANAGER_NAV', () => {
  it('only contains manager paths', () => {
    for (const entry of MANAGER_NAV) expect(entry.path).toMatch(/^\/manager(\/|$)/);
  });

  it('has unique labels and paths', () => {
    expect(new Set(MANAGER_NAV.map(e => e.label)).size).toBe(MANAGER_NAV.length);
    expect(new Set(MANAGER_NAV.map(e => e.path)).size).toBe(MANAGER_NAV.length);
  });
});
