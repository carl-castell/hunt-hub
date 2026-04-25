import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { estatesTable } from '@/db/schema/estates';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let existingAreaId: number;
let otherEstateId: number;
let otherAreaId: number;

beforeAll(async () => {
  setup = await setupManager('areas');

  const [area] = await db
    .insert(areasTable)
    .values({ name: 'Existing Area', estateId: setup.estateId })
    .returning();
  existingAreaId = area.id;

  const [otherEstate] = await db
    .insert(estatesTable)
    .values({ name: 'Other Areas Estate' })
    .returning();
  otherEstateId = otherEstate.id;

  const [otherArea] = await db
    .insert(areasTable)
    .values({ name: 'Other Area', estateId: otherEstate.id })
    .returning();
  otherAreaId = otherArea.id;
});

afterAll(async () => {
  await db.delete(estatesTable).where(eq(estatesTable.id, otherEstateId));
  await teardown(setup.estateId);
});

// ── POST /manager/areas ───────────────────────────────────────────────────────

describe('POST /manager/areas', () => {
  it('creates an area and redirects to the new area page', async () => {
    const res = await setup.agent.post('/manager/areas').send({ name: 'New Area' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/manager\/areas\/\d+$/);
  });

  it('returns 400 for an empty name', async () => {
    const res = await setup.agent.post('/manager/areas').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('redirects to /login when not authenticated', async () => {
    const res = await request(app).post('/manager/areas').send({ name: 'Unauth' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

// ── GET /manager/areas/:id ────────────────────────────────────────────────────

describe('GET /manager/areas/:id', () => {
  it('returns 200 for an area in own estate', async () => {
    const res = await setup.agent.get(`/manager/areas/${existingAreaId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an area belonging to another estate', async () => {
    const res = await setup.agent.get(`/manager/areas/${otherAreaId}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /manager/areas/:id/rename ────────────────────────────────────────────

describe('POST /manager/areas/:id/rename', () => {
  it('renames area and redirects', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${existingAreaId}/rename`)
      .send({ name: 'Renamed Area' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/areas/${existingAreaId}`);
  });

  it('returns 400 for an empty name', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${existingAreaId}/rename`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an area in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${otherAreaId}/rename`)
      .send({ name: 'Hack' });
    expect(res.status).toBe(404);
  });
});

// ── POST /manager/areas/:id/delete ────────────────────────────────────────────

describe('POST /manager/areas/:id/delete', () => {
  it('returns 400 when confirmation name does not match', async () => {
    const [area] = await db
      .insert(areasTable)
      .values({ name: 'Delete Me', estateId: setup.estateId })
      .returning();

    const res = await setup.agent
      .post(`/manager/areas/${area.id}/delete`)
      .send({ confirm: 'Wrong Name' });
    expect(res.status).toBe(400);

    await db.delete(areasTable).where(eq(areasTable.id, area.id));
  });

  it('deletes area and redirects when confirmation matches', async () => {
    const [area] = await db
      .insert(areasTable)
      .values({ name: 'Delete This Area', estateId: setup.estateId })
      .returning();

    const res = await setup.agent
      .post(`/manager/areas/${area.id}/delete`)
      .send({ confirm: 'Delete This Area' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/estate');
  });
});
