import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
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
    const hibpPassword = 'Password1!';
    const hibpHash = createHash('sha1').update(hibpPassword).digest('hex').toUpperCase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(`${hibpHash.slice(5)}:5`, { status: 200 }),
    );

    const res = await setup.agent
      .post('/manager/account/password')
      .send({ oldPassword: MANAGER_PASSWORD, newPassword: hibpPassword, confirmPassword: hibpPassword });

    expect(res.status).toBe(200);
    expect(res.text).toContain('known data breach');

    vi.restoreAllMocks();
  });
});
