import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

// The dashboard lives in the React app (HUN-97); its content is tested in manager-api/dashboard.test.ts.
describe('GET /manager', () => {
  let setup: ManagerSetup;

  beforeAll(async () => { setup = await setupManager('dash-redirect'); });
  afterAll(async () => { await teardown(setup.estateId); });

  it('sends the manager to the React dashboard', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app/manager');
  });

  it('the menu of the old pages links to the React dashboard', async () => {
    const res = await setup.agent.get('/manager/guests');
    expect(res.text).toContain('href="/app/manager"');
  });
});
