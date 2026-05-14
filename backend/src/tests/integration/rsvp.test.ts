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
import { eq } from 'drizzle-orm';

// Prevent any accidental file upload from hitting a real storage service
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
  const [estate] = await db.insert(estatesTable).values({ name: 'RSVP Test Estate' }).returning();
  estateId = estate.id;

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Autumn Hunt', date: '2030-11-15', time: '09:00', estateId })
    .returning();
  eventId = event.id;

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'Jane', lastName: 'Doe', role: 'guest', estateId })
    .returning();
  guestId = guest.id;

  await db.insert(contactsTable).values({ userId: guestId, email: 'jane@test.com' });

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

describe('GET /rsvp/:publicId', () => {
  it('returns 200 for a valid invitation', async () => {
    const res = await request(app).get(`/rsvp/${publicId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get(`/rsvp/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it('sets openedAt on first visit', async () => {
    const newPublicId = crypto.randomUUID();
    const [guest2] = await db
      .insert(usersTable)
      .values({ firstName: 'Bob', lastName: 'Smith', role: 'guest', estateId })
      .returning();
    await db.insert(contactsTable).values({ userId: guest2.id, email: 'bob@test.com' });
    await db.insert(invitationsTable).values({
      publicId: newPublicId,
      eventId,
      userId: guest2.id,
      response: 'open',
      status: 'sent_email',
    });

    // Before first visit openedAt should be null
    const [before] = await db
      .select({ openedAt: invitationsTable.openedAt })
      .from(invitationsTable)
      .where(eq(invitationsTable.publicId, newPublicId));
    expect(before.openedAt).toBeNull();

    await request(app).get(`/rsvp/${newPublicId}`);

    const [after] = await db
      .select({ openedAt: invitationsTable.openedAt })
      .from(invitationsTable)
      .where(eq(invitationsTable.publicId, newPublicId));
    expect(after.openedAt).not.toBeNull();

    // Cleanup
    await db.delete(invitationsTable).where(eq(invitationsTable.userId, guest2.id));
    await db.delete(contactsTable).where(eq(contactsTable.userId, guest2.id));
    await db.delete(usersTable).where(eq(usersTable.id, guest2.id));
  });
});

describe('POST /rsvp/:publicId/respond', () => {
  it('redirects to step=1 when the guest accepts', async () => {
    const res = await request(app)
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'yes' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${publicId}?step=1`);
  });

  it('redirects to step=1 when the guest declines', async () => {
    // Reset invitation to 'open' first
    await db
      .update(invitationsTable)
      .set({ response: 'open', respondedAt: null })
      .where(eq(invitationsTable.publicId, publicId));

    const res = await request(app)
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'no' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${publicId}?step=1`);
  });

  it('is idempotent when the invitation is already declined', async () => {
    // Invitation is now 'no' from previous test
    const res = await request(app)
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'yes' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/rsvp/${publicId}`);

    const [inv] = await db
      .select({ response: invitationsTable.response })
      .from(invitationsTable)
      .where(eq(invitationsTable.publicId, publicId));
    expect(inv.response).toBe('no');
  });

  it('returns 400 for an invalid answer value', async () => {
    const res = await request(app)
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'maybe' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app)
      .post(`/rsvp/${crypto.randomUUID()}/respond`)
      .send({ answer: 'yes' });

    expect(res.status).toBe(404);
  });
});
