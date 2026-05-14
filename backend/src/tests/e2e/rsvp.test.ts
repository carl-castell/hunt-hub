import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
    // Make sure invitation is accepted
    await db
      .update(invitationsTable)
      .set({ response: 'yes', respondedAt: new Date() })
      .where(eq(invitationsTable.publicId, publicId));

    const res = await request(app).get(`/rsvp/${publicId}?step=1`);

    expect(res.status).toBe(200);
    // The upload view should contain a file input
    expect(res.text).toContain('licenseFiles');
  });
});

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
    // The declined template should not show the accept/decline buttons
    expect(res.text).not.toContain('name="answer" value="yes"');
  });
});
