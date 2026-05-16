import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { guestGroupMembersTable } from '@/db/schema/guest_groups';
import { and, count, eq } from 'drizzle-orm';
import { setupManager, teardown } from '@/tests/helpers/manager';


let estateId: number;
let agent: ReturnType<typeof request.agent>;
let groupId: number;
const guestIds: number[] = [];   // [Alice, Bob, Carol] in creation order

beforeAll(async () => {
  const setup = await setupManager('groups-e2e');
  estateId = setup.estateId;
  agent = setup.agent;

  // Create 3 guests via HTTP
  for (const guest of [
    { firstName: 'Alice', lastName: 'Hunter',  email: 'alice-grp@test.com' },
    { firstName: 'Bob',   lastName: 'Shooter', email: 'bob-grp@test.com'   },
    { firstName: 'Carol', lastName: 'Walker',  email: 'carol-grp@test.com' },
  ]) {
    const res = await agent.post('/manager/guests').send(guest);
    guestIds.push(Number(res.headers.location?.split('/').pop()));
  }
});

afterAll(async () => {
  // groups and members cascade-delete from estate; teardown handles everything
  await teardown(estateId);
});


describe('creating a group', () => {
  it('POST /manager/guest-groups creates the group and redirects', async () => {
    const res = await agent
      .post('/manager/guest-groups')
      .send({ name: 'Regulars' });

    expect(res.status).toBe(302);
    const match = res.headers.location?.match(/\/manager\/guest-groups\/(\d+)/);
    expect(match).not.toBeNull();
    groupId = Number(match![1]);
  });

  it('group page shows the group name', async () => {
    const res = await agent.get(`/manager/guest-groups/${groupId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Regulars');
  });

  it('groups list shows the new group', async () => {
    const res = await agent.get('/manager/guest-groups');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Regulars');
  });

  it('returns 400 for an empty group name', async () => {
    const res = await agent
      .post('/manager/guest-groups')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });
});


describe('adding members', () => {
  it('adds Alice to the group and redirects', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/members`)
      .send({ userId: guestIds[0] });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guest-groups/${groupId}`);
  });

  it('adds Bob and Carol to the group', async () => {
    for (const id of [guestIds[1], guestIds[2]]) {
      const res = await agent
        .post(`/manager/guest-groups/${groupId}/members`)
        .send({ userId: id });
      expect(res.status).toBe(302);
    }
  });

  it('group page shows all 3 members', async () => {
    const res = await agent.get(`/manager/guest-groups/${groupId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Bob');
    expect(res.text).toContain('Carol');
  });

  it('adding the same guest again is idempotent — DB still has exactly 1 row', async () => {
    await agent
      .post(`/manager/guest-groups/${groupId}/members`)
      .send({ userId: guestIds[0] });

    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(guestGroupMembersTable)
      .where(and(
        eq(guestGroupMembersTable.groupId, groupId),
        eq(guestGroupMembersTable.userId, guestIds[0]),
      ));

    expect(memberCount).toBe(1);
  });

  it('returns 404 when adding a guest from a different estate', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/members`)
      .send({ userId: 999999 });

    expect(res.status).toBe(404);
  });

  it('group has exactly 3 members in the DB', async () => {
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(guestGroupMembersTable)
      .where(eq(guestGroupMembersTable.groupId, groupId));

    expect(memberCount).toBe(3);
  });
});


describe('removing a member', () => {
  it('removes Carol from the group and redirects', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/members/${guestIds[2]}/remove`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guest-groups/${groupId}`);
  });

  it('group page no longer shows Carol', async () => {
    const res = await agent.get(`/manager/guest-groups/${groupId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Bob');
    expect(res.text).not.toContain('Carol');
  });

  it('group has exactly 2 members in the DB after removal', async () => {
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(guestGroupMembersTable)
      .where(eq(guestGroupMembersTable.groupId, groupId));

    expect(memberCount).toBe(2);
  });
});


describe('renaming the group', () => {
  it('renames the group and redirects', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/rename`)
      .send({ name: 'VIP Guests' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guest-groups/${groupId}`);
  });

  it('group page shows the new name', async () => {
    const res = await agent.get(`/manager/guest-groups/${groupId}`);
    expect(res.text).toContain('VIP Guests');
    expect(res.text).not.toContain('Regulars');
  });

  it('groups list shows the updated name', async () => {
    const res = await agent.get('/manager/guest-groups');
    expect(res.text).toContain('VIP Guests');
    expect(res.text).not.toContain('Regulars');
  });

  it('returns 400 for an empty new name', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/rename`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });
});


describe('deleting the group', () => {
  it('deletes the group and redirects to the groups list', async () => {
    const res = await agent
      .post(`/manager/guest-groups/${groupId}/delete`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/guest-groups');
  });

  it('groups list no longer shows the deleted group', async () => {
    const res = await agent.get('/manager/guest-groups');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('VIP Guests');
  });

  it('group page returns 404 after deletion', async () => {
    const res = await agent.get(`/manager/guest-groups/${groupId}`);
    expect(res.status).toBe(404);
  });

  it('all members are removed from the DB when the group is deleted', async () => {
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(guestGroupMembersTable)
      .where(eq(guestGroupMembersTable.groupId, groupId));

    expect(memberCount).toBe(0);
  });
});
