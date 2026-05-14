import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '@/app';
import { db } from '@/db';
import { estatesTable } from '@/db/schema/estates';
import { usersTable } from '@/db/schema/users';
import { eventsTable } from '@/db/schema/events';
import { invitationsTable } from '@/db/schema/invitations';
import { contactsTable } from '@/db/schema/contacts';
import { huntingLicensesTable, trainingCertificatesTable } from '@/db/schema/licenses';
import { eq } from 'drizzle-orm';

vi.mock('@/services/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://example.com/file'),
}));

let estateId: number;
let eventId: number;
let guestId: number;
let publicId: string;

beforeAll(async () => {
  const [estate] = await db.insert(estatesTable).values({ name: 'RSVP E2E Estate' }).returning();
  estateId = estate.id;

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Spring Hunt 2030', date: '2030-04-20', time: '07:30', estateId })
    .returning();
  eventId = event.id;

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'Alice', lastName: 'Hunter', role: 'guest', estateId })
    .returning();
  guestId = guest.id;

  await db.insert(contactsTable).values({ userId: guestId, email: 'alice@test.com' });

  publicId = crypto.randomUUID();
  await db.insert(invitationsTable).values({
    publicId,
    eventId,
    userId: guestId,
    response: 'open',
    status: 'sent_email',
  });
});

afterAll(async () => {
  await db.delete(invitationsTable).where(eq(invitationsTable.eventId, eventId));
  await db.delete(contactsTable).where(eq(contactsTable.userId, guestId));
  await db.delete(usersTable).where(eq(usersTable.id, guestId));
  await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
  await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
});

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('RSVP page rendering', () => {
  it('shows the guest first name on the invitation page', async () => {
    const res = await request(app).get(`/rsvp/${publicId}`);
    expect(res.text).toContain('Alice');
  });

  it('shows the event name on the invitation page', async () => {
    const res = await request(app).get(`/rsvp/${publicId}`);
    expect(res.text).toContain('Spring Hunt 2030');
  });
});

// ---------------------------------------------------------------------------
// Accept flow
// ---------------------------------------------------------------------------

describe('RSVP accept flow', () => {
  it('redirects to the upload wizard after accepting', async () => {
    const agent = request.agent(app);

    const res = await agent
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'yes' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${publicId}?step=1`);
  });

  it('renders the license upload form at step=1', async () => {
    await db
      .update(invitationsTable)
      .set({ response: 'yes', respondedAt: new Date() })
      .where(eq(invitationsTable.publicId, publicId));

    const res = await request(app).get(`/rsvp/${publicId}?step=1`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('licenseFiles');
  });
});

// ---------------------------------------------------------------------------
// Decline flow
// ---------------------------------------------------------------------------

describe('RSVP decline flow', () => {
  let declinePublicId: string;
  let declineGuestId: number;

  beforeAll(async () => {
    const [guest] = await db
      .insert(usersTable)
      .values({ firstName: 'Bob', lastName: 'Decliner', role: 'guest', estateId })
      .returning();
    declineGuestId = guest.id;

    await db.insert(contactsTable).values({ userId: declineGuestId, email: 'bob@test.com' });

    declinePublicId = crypto.randomUUID();
    await db.insert(invitationsTable).values({
      publicId: declinePublicId,
      eventId,
      userId: declineGuestId,
      response: 'open',
      status: 'sent_email',
    });
  });

  afterAll(async () => {
    await db.delete(invitationsTable).where(eq(invitationsTable.userId, declineGuestId));
    await db.delete(contactsTable).where(eq(contactsTable.userId, declineGuestId));
    await db.delete(usersTable).where(eq(usersTable.id, declineGuestId));
  });

  it('renders the declined view after a guest declines', async () => {
    await request(app)
      .post(`/rsvp/${declinePublicId}/respond`)
      .send({ answer: 'no' });

    const res = await request(app).get(`/rsvp/${declinePublicId}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('name="answer" value="yes"');
  });
});

// ---------------------------------------------------------------------------
// Confirmed view and full wizard walkthrough (skip all uploads)
// ---------------------------------------------------------------------------

describe('RSVP confirmed view and wizard walkthrough', () => {
  let wizardPublicId: string;
  let wizardGuestId: number;

  beforeAll(async () => {
    const [guest] = await db
      .insert(usersTable)
      .values({ firstName: 'Carol', lastName: 'Walker', role: 'guest', estateId })
      .returning();
    wizardGuestId = guest.id;

    await db.insert(contactsTable).values({ userId: wizardGuestId, email: 'carol@test.com' });

    wizardPublicId = crypto.randomUUID();
    await db.insert(invitationsTable).values({
      publicId: wizardPublicId,
      eventId,
      userId: wizardGuestId,
      response: 'yes',
      status: 'sent_email',
      respondedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(invitationsTable).where(eq(invitationsTable.userId, wizardGuestId));
    await db.delete(contactsTable).where(eq(contactsTable.userId, wizardGuestId));
    await db.delete(usersTable).where(eq(usersTable.id, wizardGuestId));
  });

  it('shows the confirmed view when response is yes and no step param', async () => {
    const res = await request(app).get(`/rsvp/${wizardPublicId}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("You've Accepted!");
  });

  it('renders the certificate upload form at step=2', async () => {
    const res = await request(app).get(`/rsvp/${wizardPublicId}?step=2`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('certFiles');
  });

  it('renders the details form at step=3', async () => {
    const res = await request(app).get(`/rsvp/${wizardPublicId}?step=3`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('upload/details');
  });

  it('skipping licence upload (no files) redirects to step=2', async () => {
    const res = await request(app)
      .post(`/rsvp/${wizardPublicId}/upload/license`)
      .send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${wizardPublicId}?step=2`);
  });

  it('skipping certificate upload (no files) redirects to step=3', async () => {
    const res = await request(app)
      .post(`/rsvp/${wizardPublicId}/upload/certificate`)
      .send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${wizardPublicId}?step=3`);
  });

  it('submitting details redirects to the done page', async () => {
    const res = await request(app)
      .post(`/rsvp/${wizardPublicId}/upload/details`)
      .send({ phone: '555-0100', dateOfBirth: '1985-06-15' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${wizardPublicId}?done=1`);
  });

  it('shows the done view after completing the wizard', async () => {
    const res = await request(app).get(`/rsvp/${wizardPublicId}?done=1`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Thank You!');
  });
});

// ---------------------------------------------------------------------------
// File upload validation
// ---------------------------------------------------------------------------

describe('RSVP upload validation', () => {
  let uploadPublicId: string;
  let uploadGuestId: number;

  const pdfBuffer  = Buffer.from('%PDF-1.4 minimal');
  const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9]);

  beforeAll(async () => {
    const [guest] = await db
      .insert(usersTable)
      .values({ firstName: 'Dave', lastName: 'Uploader', role: 'guest', estateId })
      .returning();
    uploadGuestId = guest.id;

    await db.insert(contactsTable).values({ userId: uploadGuestId, email: 'dave@test.com' });

    uploadPublicId = crypto.randomUUID();
    await db.insert(invitationsTable).values({
      publicId: uploadPublicId,
      eventId,
      userId: uploadGuestId,
      response: 'yes',
      status: 'sent_email',
      respondedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(huntingLicensesTable).where(eq(huntingLicensesTable.userId, uploadGuestId));
    await db.delete(trainingCertificatesTable).where(eq(trainingCertificatesTable.userId, uploadGuestId));
    await db.delete(invitationsTable).where(eq(invitationsTable.userId, uploadGuestId));
    await db.delete(contactsTable).where(eq(contactsTable.userId, uploadGuestId));
    await db.delete(usersTable).where(eq(usersTable.id, uploadGuestId));
  });

  it('uploading a PDF licence saves it and redirects to step=2', async () => {
    const res = await request(app)
      .post(`/rsvp/${uploadPublicId}/upload/license`)
      .field('expiryDate', '2099-12-31')
      .attach('licenseFiles', pdfBuffer, { filename: 'license.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${uploadPublicId}?step=2`);
  });

  it('returns 400 for a past licence expiry date', async () => {
    const res = await request(app)
      .post(`/rsvp/${uploadPublicId}/upload/license`)
      .field('expiryDate', '2000-01-01')
      .attach('licenseFiles', pdfBuffer, { filename: 'license.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('past');
  });

  it('returns 400 for a disallowed file type on licence upload', async () => {
    const res = await request(app)
      .post(`/rsvp/${uploadPublicId}/upload/license`)
      .field('expiryDate', '2099-12-31')
      .attach('licenseFiles', Buffer.from('data'), { filename: 'data.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
  });

  it('uploading a JPEG certificate saves it and redirects to step=3', async () => {
    const res = await request(app)
      .post(`/rsvp/${uploadPublicId}/upload/certificate`)
      .field('issueDate', '2020-01-01')
      .attach('certFiles', jpegBuffer, { filename: 'cert.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${uploadPublicId}?step=3`);
  });

  it('returns 400 for a future certificate issue date', async () => {
    const res = await request(app)
      .post(`/rsvp/${uploadPublicId}/upload/certificate`)
      .field('issueDate', '2099-01-01')
      .attach('certFiles', jpegBuffer, { filename: 'cert.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('future');
  });

  it('returns 403 when a non-accepted guest tries to upload', async () => {
    const [openGuest] = await db
      .insert(usersTable)
      .values({ firstName: 'Eve', lastName: 'Open', role: 'guest', estateId })
      .returning();
    await db.insert(contactsTable).values({ userId: openGuest.id, email: 'eve@test.com' });
    const openPublicId = crypto.randomUUID();
    await db.insert(invitationsTable).values({
      publicId: openPublicId, eventId, userId: openGuest.id,
      response: 'open', status: 'sent_email',
    });

    const res = await request(app)
      .post(`/rsvp/${openPublicId}/upload/license`)
      .field('expiryDate', '2099-12-31')
      .attach('licenseFiles', pdfBuffer, { filename: 'license.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);

    await db.delete(invitationsTable).where(eq(invitationsTable.userId, openGuest.id));
    await db.delete(contactsTable).where(eq(contactsTable.userId, openGuest.id));
    await db.delete(usersTable).where(eq(usersTable.id, openGuest.id));
  });
});
