import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { invitationsTable } from '@/db/schema/invitations';
import { and, eq, inArray } from 'drizzle-orm';
import { setupManager, teardown } from '@/tests/helpers/manager';

vi.mock('@/services/mail', () => ({
  renderTemplate: vi.fn().mockResolvedValue('<html>Test invitation</html>'),
  sendMail: vi.fn().mockResolvedValue(undefined),
  default: {},
}));

// ---------------------------------------------------------------------------
// Shared state — populated in beforeAll, read by all nested describes
// ---------------------------------------------------------------------------

let estateId: number;
let agent: ReturnType<typeof request.agent>;
let eventId: number;
const guestIds: number[] = [];   // [Alice, Bob, Carol] in creation order

beforeAll(async () => {
  const setup = await setupManager('inv-e2e');
  estateId = setup.estateId;
  agent = setup.agent;

  // Create event via HTTP
  const eventRes = await agent.post('/manager/events').send({
    eventName: 'Autumn Pheasant Drive 2030',
    date: '2030-10-15',
    time: '08:00',
  });
  const match = eventRes.headers.location?.match(/\/manager\/events\/(\d+)/);
  eventId = Number(match![1]);

  // Create 3 guests via HTTP
  for (const guest of [
    { firstName: 'Alice', lastName: 'Hunter',  email: 'alice-inv-e2e@test.com' },
    { firstName: 'Bob',   lastName: 'Shooter', email: 'bob-inv-e2e@test.com'   },
    { firstName: 'Carol', lastName: 'Walker',  email: 'carol-inv-e2e@test.com' },
  ]) {
    const res = await agent.post('/manager/guests').send(guest);
    guestIds.push(Number(res.headers.location?.split('/').pop()));
  }
});

afterAll(async () => {
  // contacts cascade-delete from users; teardown handles users + estate + events
  await teardown(estateId);
});

// ---------------------------------------------------------------------------
// Event setup
// ---------------------------------------------------------------------------

describe('event setup', () => {
  it('event page returns 200 and shows the event name', async () => {
    const res = await agent.get(`/manager/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Autumn Pheasant Drive 2030');
  });

  it('events list includes the new event', async () => {
    const res = await agent.get('/manager/events');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Autumn Pheasant Drive 2030');
  });
});

// ---------------------------------------------------------------------------
// Staging guests to the event's guest list
// ---------------------------------------------------------------------------

describe('staging guests', () => {
  it('stages all 3 guests and redirects to the invitation list', async () => {
    const res = await agent
      .post(`/manager/events/${eventId}/invitations`)
      .send({ guestIds });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/events/${eventId}/invitations`);
  });

  it('invitation list shows all 3 guests with staged status', async () => {
    const res = await agent.get(`/manager/events/${eventId}/invitations`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Bob');
    expect(res.text).toContain('Carol');
  });

  it('staging the same guests a second time is idempotent', async () => {
    await agent
      .post(`/manager/events/${eventId}/invitations`)
      .send({ guestIds });

    const rows = await db
      .select()
      .from(invitationsTable)
      .where(and(
        eq(invitationsTable.eventId, eventId),
        inArray(invitationsTable.userId, guestIds),
      ));

    expect(rows).toHaveLength(3);
  });

  it('invitation picker does not show already-staged guests', async () => {
    const res = await agent.get(`/manager/events/${eventId}/invitations/new`);

    expect(res.status).toBe(200);
    // All 3 estate guests are staged, so the picker should show none of them
    expect(res.text).not.toContain('alice-inv-e2e@test.com');
    expect(res.text).not.toContain('bob-inv-e2e@test.com');
  });
});

// ---------------------------------------------------------------------------
// Sending invitations to a subset of staged guests
// ---------------------------------------------------------------------------

describe('sending invitations', () => {
  let invitationIds: number[];   // Alice + Bob
  let carolInvitationId: number; // Carol — not sent

  beforeAll(async () => {
    const rows = await db
      .select({ id: invitationsTable.id, userId: invitationsTable.userId })
      .from(invitationsTable)
      .where(eq(invitationsTable.eventId, eventId));

    const byUserId = new Map(rows.map(r => [r.userId, r.id]));
    invitationIds   = [byUserId.get(guestIds[0])!, byUserId.get(guestIds[1])!];
    carolInvitationId = byUserId.get(guestIds[2])!;
  });

  it('send page lists all 3 staged guests with their emails', async () => {
    const res = await agent.get(`/manager/events/${eventId}/invitations/send`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('alice-inv-e2e@test.com');
    expect(res.text).toContain('bob-inv-e2e@test.com');
    expect(res.text).toContain('carol-inv-e2e@test.com');
  });

  it('POSTing to /send redirects with sent=2 and failed=0', async () => {
    const res = await agent
      .post(`/manager/events/${eventId}/invitations/send`)
      .send({
        message:       'You are invited, {{firstName}}!',
        invitationIds,
        respondBy:     '2030-09-30',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('sent=2');
    expect(res.headers.location).toContain('failed=0');
  });

  it('sendMail was called twice — once per invited guest', async () => {
    const { sendMail } = await import('@/services/mail');
    expect(vi.mocked(sendMail)).toHaveBeenCalledTimes(2);
  });

  it('emails were sent to Alice and Bob only', async () => {
    const { sendMail } = await import('@/services/mail');
    const recipients = vi.mocked(sendMail).mock.calls.map(c => c[0].to);

    expect(recipients).toContain('alice-inv-e2e@test.com');
    expect(recipients).toContain('bob-inv-e2e@test.com');
    expect(recipients).not.toContain('carol-inv-e2e@test.com');
  });

  it('invitation template was rendered with the event name', async () => {
    const { renderTemplate } = await import('@/services/mail');
    const templateCalls = vi.mocked(renderTemplate).mock.calls;

    expect(templateCalls.length).toBeGreaterThanOrEqual(2);
    for (const [, data] of templateCalls) {
      expect((data as any).eventName).toBe('Autumn Pheasant Drive 2030');
    }
  });

  it('Alice and Bob invitations are now status sent_email', async () => {
    const rows = await db
      .select({ id: invitationsTable.id, status: invitationsTable.status })
      .from(invitationsTable)
      .where(inArray(invitationsTable.id, invitationIds));

    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.status).toBe('sent_email');
  });

  it("Carol's invitation remains staged", async () => {
    const [row] = await db
      .select({ status: invitationsTable.status })
      .from(invitationsTable)
      .where(eq(invitationsTable.id, carolInvitationId));

    expect(row.status).toBe('staged');
  });

  it('invitation list still shows all 3 guests after partial send', async () => {
    const res = await agent.get(`/manager/events/${eventId}/invitations`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Bob');
    expect(res.text).toContain('Carol');
  });

  it('returns 400 when no invitationIds are sent', async () => {
    const res = await agent
      .post(`/manager/events/${eventId}/invitations/send`)
      .send({ message: 'Hello!', invitationIds: [] });

    expect(res.status).toBe(400);
  });
});
