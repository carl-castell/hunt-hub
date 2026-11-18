import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.mock('@/services/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { contactsTable } from '@/db/schema/contacts';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9]);

let setup: ManagerSetup;
let guestId: number;

beforeAll(async () => {
  setup = await setupManager('hunting-license');

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'License', lastName: 'Guest', role: 'guest', estateId: setup.estateId })
    .returning();
  guestId = guest.id;
  // guest controller joins contactsTable — a row is required for the page to render
  await db.insert(contactsTable).values({ userId: guest.id, email: `license-guest-${setup.estateId}@test.com` });
});

afterAll(async () => { await teardown(setup.estateId); });

describe('POST /manager/guests/:id/hunting-license (create)', () => {
  it('creates a license with a valid future expiry date', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/hunting-license`)
      .field('expiryDate', '2027-12-31')
      .attach('files', jpegBuffer, { filename: 'license.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/hunting-license\?licenseId=\d+/);
  });

  it('returns 400 for a past expiry date', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/hunting-license`)
      .field('expiryDate', '2020-01-01')
      .attach('files', jpegBuffer, { filename: 'license.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/hunting-license`)
      .send({ expiryDate: '2027-12-31' });
    expect(res.status).toBe(400);
  });
});
