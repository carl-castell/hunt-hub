import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { areasTable, estatesTable } from '@/db/schema';
import { boundaryCache, getAreaWithBoundary } from '@/services/areas';

const SQUARE = 'MULTIPOLYGON(((10 50,10.1 50,10.1 50.1,10 50.1,10 50)))';
const OTHER = 'MULTIPOLYGON(((11 51,11.1 51,11.1 51.1,11 51.1,11 51)))';

let estateId: number;
let areaId: number;

beforeAll(async () => {
  const [estate] = await db.insert(estatesTable).values({ name: 'Boundary cache estate' }).returning();
  estateId = estate.id;
  const [area] = await db.insert(areasTable)
    .values({ estateId, name: 'Cached area', geofile: sql`ST_GeomFromText(${SQUARE}, 4326)` as never })
    .returning({ id: areasTable.id });
  areaId = area.id;
});

afterAll(async () => {
  await db.delete(areasTable).where(eq(areasTable.estateId, estateId));
  await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
});

const firstLng = (geoJson: string | null) => (JSON.parse(geoJson!) as GeoJSON.MultiPolygon).coordinates[0][0][0][0];

describe('boundary cache', () => {
  it('serves the second request from the cache', async () => {
    const hits = boundaryCache.hits;
    const first = await getAreaWithBoundary(estateId, areaId);
    const second = await getAreaWithBoundary(estateId, areaId);
    expect(second.boundaryGeoJson).toBe(first.boundaryGeoJson);
    expect(boundaryCache.hits).toBe(hits + 1);
  });

  it('returns the new boundary right after a change (the database trigger bumps the version)', async () => {
    expect(firstLng((await getAreaWithBoundary(estateId, areaId)).boundaryGeoJson)).toBe(10);
    await db.update(areasTable).set({ geofile: sql`ST_GeomFromText(${OTHER}, 4326)` as never }).where(eq(areasTable.id, areaId));
    expect(firstLng((await getAreaWithBoundary(estateId, areaId)).boundaryGeoJson)).toBe(11);
  });

  it('returns no boundary right after it was removed', async () => {
    await db.update(areasTable).set({ geofile: null }).where(eq(areasTable.id, areaId));
    expect((await getAreaWithBoundary(estateId, areaId)).boundaryGeoJson).toBeNull();
  });

  it('still refuses areas of another estate', async () => {
    await expect(getAreaWithBoundary(estateId + 999999, areaId)).rejects.toThrow();
  });
});
