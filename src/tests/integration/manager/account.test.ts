import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { setupManager, teardown, MANAGER_PASSWORD, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;

beforeAll(async () => {
  setup = await setupManager('account');
});

afterAll(async () => {
  await teardown(setup.estateId);
});

describe('POST /manager/account/password', () => {
  it('rejects a pwned new password with a breach error message', async () => {
    // SHA-1('password') suffix after the 5-char prefix
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:5', { status: 200 }),
    );

    const res = await setup.agent
      .post('/manager/account/password')
      .send({ oldPassword: MANAGER_PASSWORD, newPassword: 'password', confirmPassword: 'password' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('known data breach');

    vi.restoreAllMocks();
  });
});
