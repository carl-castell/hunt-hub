import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;

beforeAll(async () => { setup = await setupManager('estate'); });
afterAll(async () => { await teardown(setup.estateId); });

// ── GET /manager/estate ───────────────────────────────────────────────────────

describe('GET /manager/estate', () => {
  it('returns 200 for authenticated manager', async () => {
    const res = await setup.agent.get('/manager/estate');
    expect(res.status).toBe(200);
  });

  it('redirects to /login when not authenticated', async () => {
    const res = await request(app).get('/manager/estate');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

// ── POST /manager/estate/rename ───────────────────────────────────────────────

describe('POST /manager/estate/rename', () => {
  it('renames estate and redirects', async () => {
    const res = await setup.agent
      .post('/manager/estate/rename')
      .send({ name: 'Renamed Estate' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/estate');
  });

  it('returns 400 for an empty name', async () => {
    const res = await setup.agent
      .post('/manager/estate/rename')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });
});
