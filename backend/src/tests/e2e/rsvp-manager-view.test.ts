import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import app from '@/app';
import { db } from '@/db';
import { eventsTable } from '@/db/schema/events';
import { usersTable } from '@/db/schema/users';
import { invitationsTable } from '@/db/schema/invitations';
import { contactsTable } from '@/db/schema/contacts';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let eventId: number;
let guestId: number;
let invitationId: number;
let publicId: string;

beforeAll(async () => {
  setup = await setupManager('rsvp-loop');

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Loop Test Hunt', date: '2030-05-01', time: '08:00', estateId: setup.estateId })
    .returning();
  eventId = event.id;

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'Loop', lastName: 'Guest', role: 'guest', estateId: setup.estateId })
    .returning();
  guestId = guest.id;
  await db.insert(contactsTable).values({ userId: guestId, email: 'loop-guest@e2e.test' });

  publicId = crypto.randomUUID();
  const [invitation] = await db
    .insert(invitationsTable)
    .values({ publicId, eventId, userId: guestId, response: 'open', status: 'sent_email' })
    .returning();
  invitationId = invitation.id;
});

afterAll(async () => {
  await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
  await teardown(setup.estateId);
});

describe('RSVP loop: guest responds → manager sees updated status', () => {
  it('invitation list shows the guest before they respond', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Loop');
  });

  it('guest accepts the RSVP invitation', async () => {
    const res = await request(app)
      .post(`/rsvp/${publicId}/respond`)
      .send({ answer: 'yes' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`/rsvp/${publicId}`);

    const [row] = await db
      .select({ response: invitationsTable.response })
      .from(invitationsTable)
      .where(eq(invitationsTable.id, invitationId));
    expect(row.response).toBe('yes');
  });

  it('manager invitation list still shows the guest after response', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Loop');
  });

  it('manager invitation detail page shows the guest and their contact info', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations/${invitationId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Loop');
    expect(res.text).toContain('loop-guest@e2e.test');
  });
});
