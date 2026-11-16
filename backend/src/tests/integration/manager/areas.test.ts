import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { estatesTable } from '@/db/schema/estates';
import { standsTable } from '@/db/schema/stands';
import { syncTombstonesTable } from '@/db/schema/sync';
import { and, eq, sql } from 'drizzle-orm';
import path from 'path';
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

describe('POST /manager/areas/:id/geofile/delete', () => {
  it('clears the geofile and redirects to the area page', async () => {
    const res = await setup.agent.post(`/manager/areas/${existingAreaId}/geofile/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/areas/${existingAreaId}`);
  });

  it('returns 404 for an area in another estate', async () => {
    const res = await setup.agent.post(`/manager/areas/${otherAreaId}/geofile/delete`);
    expect(res.status).toBe(404);
  });
});

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

  it('removes the area together with its stands', async () => {
    const [area] = await db
      .insert(areasTable)
      .values({ name: 'Area With Stands', estateId: setup.estateId })
      .returning();
    await db.insert(standsTable).values([
      { number: '1', areaId: area.id },
      { number: '2', areaId: area.id },
    ]);

    await setup.agent.post(`/manager/areas/${area.id}/delete`).send({ confirm: 'Area With Stands' });

    expect(await db.select().from(areasTable).where(eq(areasTable.id, area.id))).toHaveLength(0);
    expect(await db.select().from(standsTable).where(eq(standsTable.areaId, area.id))).toHaveLength(0);
  });

  it('records an area tombstone so the iPhone app removes the area and its stands', async () => {
    const [area] = await db
      .insert(areasTable)
      .values({ name: 'Synced Area', estateId: setup.estateId })
      .returning();

    await setup.agent.post(`/manager/areas/${area.id}/delete`).send({ confirm: 'Synced Area' });

    const tombstones = await db
      .select()
      .from(syncTombstonesTable)
      .where(and(eq(syncTombstonesTable.entity, 'area'), eq(syncTombstonesTable.entityId, area.id)));
    expect(tombstones).toHaveLength(1);
  });

  it('returns 404 for an area in another estate and keeps it', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${otherAreaId}/delete`)
      .send({ confirm: 'Other Area' });

    expect(res.status).toBe(404);
    expect(await db.select().from(areasTable).where(eq(areasTable.id, otherAreaId))).toHaveLength(1);
  });
});

describe('area changes are stored', () => {
  it('stores the new name after a rename', async () => {
    await setup.agent.post(`/manager/areas/${existingAreaId}/rename`).send({ name: 'Stored Name' });

    const [area] = await db.select().from(areasTable).where(eq(areasTable.id, existingAreaId));
    expect(area.name).toBe('Stored Name');
  });

  it('creates the area in the manager\'s own estate', async () => {
    const res = await setup.agent.post('/manager/areas').send({ name: 'Own Estate Area' });
    const id = Number(res.headers.location.split('/').pop());

    const [area] = await db.select().from(areasTable).where(eq(areasTable.id, id));
    expect(area).toMatchObject({ name: 'Own Estate Area', estateId: setup.estateId });
  });
});

describe('POST /manager/areas/:id/geofile', () => {
  const fixture = (name: string) => path.join(__dirname, '../../fixtures', name);

  async function geofileOf(id: number) {
    const [row] = await db
      .select({ geofile: sql<string | null>`ST_AsGeoJSON(geofile)` })
      .from(areasTable)
      .where(eq(areasTable.id, id));
    return row.geofile;
  }

  it('stores the boundary from a valid GeoJSON file', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${existingAreaId}/geofile`)
      .attach('geofile', fixture('sample.geojson'));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/areas/${existingAreaId}`);
    expect(JSON.parse((await geofileOf(existingAreaId))!).type).toBe('MultiPolygon');
  });

  it('rejects an unsupported file type and keeps the area unchanged', async () => {
    const before = await geofileOf(existingAreaId);

    const res = await setup.agent
      .post(`/manager/areas/${existingAreaId}/geofile`)
      .attach('geofile', Buffer.from('not a geo file'), 'notes.txt');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await geofileOf(existingAreaId)).toBe(before);
  });

  it('returns 400 when no file is sent', async () => {
    const res = await setup.agent.post(`/manager/areas/${existingAreaId}/geofile`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an area in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/areas/${otherAreaId}/geofile`)
      .attach('geofile', fixture('sample.geojson'));

    expect(res.status).toBe(404);
    expect(await geofileOf(otherAreaId)).toBeNull();
  });
});

describe('GET /map/area/:id', () => {
  it('returns the stored boundary as GeoJSON', async () => {
    await setup.agent
      .post(`/manager/areas/${existingAreaId}/geofile`)
      .attach('geofile', path.join(__dirname, '../../fixtures', 'sample.geojson'));

    const res = await setup.agent.get(`/map/area/${existingAreaId}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('MultiPolygon');
  });

  it('returns 404 when the area has no boundary', async () => {
    const [area] = await db
      .insert(areasTable)
      .values({ name: 'No Boundary', estateId: setup.estateId })
      .returning();

    const res = await setup.agent.get(`/map/area/${area.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an area in another estate', async () => {
    const res = await setup.agent.get(`/map/area/${otherAreaId}`);
    expect(res.status).toBe(404);
  });
});
