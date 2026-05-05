import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.mock('@/services/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { contactsTable } from '@/db/schema/contacts';
import { trainingCertificatesTable } from '@/db/schema/licenses';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9]);

let setup: ManagerSetup;
let guestId: number;

beforeAll(async () => {
  setup = await setupManager('training-cert');

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'Cert', lastName: 'Guest', role: 'guest', estateId: setup.estateId })
    .returning();
  guestId = guest.id;
  // guest controller joins contactsTable — a row is required for the page to render
  await db.insert(contactsTable).values({ userId: guest.id, email: `cert-guest-${setup.estateId}@test.com` });
});

afterAll(async () => { await teardown(setup.estateId); });

describe('POST /manager/guests/:id/training-certificate (create)', () => {
  it('creates a certificate with a valid past issue date', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate`)
      .field('issueDate', '2023-01-01')
      .attach('files', jpegBuffer, { filename: 'cert.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/training-certificate\?certId=\d+/);
  });

  it('returns 400 for a future issue date', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate`)
      .field('issueDate', '2030-01-01')
      .attach('files', jpegBuffer, { filename: 'cert.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate`)
      .send({ issueDate: '2023-01-01' });
    expect(res.status).toBe(400);
  });
});

describe('POST /manager/guests/:id/training-certificate/update', () => {
  it('updates issue date to a valid past date', async () => {
    const [cert] = await db
      .insert(trainingCertificatesTable)
      .values({ userId: guestId, estateId: setup.estateId, issueDate: '2022-01-01' })
      .returning();

    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate/update`)
      .send({ certId: cert.id, issueDate: '2021-06-15' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`certId=${cert.id}`);
  });

  it('returns 400 for a future issue date', async () => {
    const [cert] = await db
      .insert(trainingCertificatesTable)
      .values({ userId: guestId, estateId: setup.estateId, issueDate: '2022-01-01' })
      .returning();

    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate/update`)
      .send({ certId: cert.id, issueDate: '2030-01-01' });
    expect(res.status).toBe(400);
  });
});

describe('POST /manager/guests/:id/training-certificate/check', () => {
  it('marks certificate as checked and redirects to guest page', async () => {
    const [cert] = await db
      .insert(trainingCertificatesTable)
      .values({ userId: guestId, estateId: setup.estateId, issueDate: '2022-01-01' })
      .returning();

    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate/check`)
      .send({ certId: cert.id });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });
});

describe('POST /manager/guests/:id/training-certificate/delete', () => {
  it('deletes certificate and redirects to guest page', async () => {
    const [cert] = await db
      .insert(trainingCertificatesTable)
      .values({ userId: guestId, estateId: setup.estateId, issueDate: '2022-01-01' })
      .returning();

    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate/delete`)
      .send({ certId: cert.id });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });
});
