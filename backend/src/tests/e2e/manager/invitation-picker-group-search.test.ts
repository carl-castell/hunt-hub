import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let eventId: number;
let groupId: number;
const memberIds: number[] = [];

beforeAll(async () => {
  setup = await setupManager('grp-inv');

  const eventRes = await setup.agent.post('/manager/events').send({
    eventName: 'Group Search Hunt',
    date: '2030-11-01',
    time: '08:00',
  });
  const match = eventRes.headers.location?.match(/\/manager\/events\/(\d+)/);
  eventId = Number(match![1]);

  for (const guest of [
    { firstName: 'Alice', lastName: 'Member', email: 'alice-grp-inv@e2e.test' },
    { firstName: 'Bob',   lastName: 'Member', email: 'bob-grp-inv@e2e.test' },
    { firstName: 'Carol', lastName: 'Member', email: 'carol-grp-inv@e2e.test' },
  ]) {
    const res = await setup.agent.post('/manager/guests').send(guest);
    memberIds.push(Number(res.headers.location?.split('/').pop()));
  }

  await setup.agent.post('/manager/guests').send({
    firstName: 'Dave', lastName: 'Outside', email: 'dave-grp-inv@e2e.test',
  });

  const groupRes = await setup.agent.post('/manager/guest-groups').send({ name: 'Regulars' });
  const groupMatch = groupRes.headers.location?.match(/\/manager\/guest-groups\/(\d+)/);
  groupId = Number(groupMatch![1]);

  for (const id of memberIds) {
    await setup.agent.post(`/manager/guest-groups/${groupId}/members`).send({ userId: id });
  }
});

afterAll(async () => {
  await teardown(setup.estateId);
});

describe('invitation picker: searching by group name', () => {
  it('returns all group members when searching by group name', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations/new?search=Regulars`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('Bob');
    expect(res.text).toContain('Carol');
  });

  it('does not return the non-member when searching by group name', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations/new?search=Regulars`);
    expect(res.text).not.toContain('Outside');
  });

  it('returns the non-member when searching by their own name', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations/new?search=Dave`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dave');
  });

  it('group members do not appear when searching by the non-member name', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/invitations/new?search=Dave`);
    expect(res.text).not.toContain('Alice');
    expect(res.text).not.toContain('Bob');
    expect(res.text).not.toContain('Carol');
  });
});
