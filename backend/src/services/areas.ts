import { and, eq, sql } from 'drizzle-orm';
import path from 'path';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { audit } from '@/services/audit';
import { runWorker } from '@/utils/runWorker';

// Parsing geo files is CPU-heavy, so it runs in a worker thread and does
// not block other requests.
const GEOFILE_WORKER = path.resolve(
  __dirname,
  __filename.endsWith('.ts') ? '../workers/geofile.worker.ts' : '../workers/geofile.worker.js',
);

type GeofileWorkerResult =
  | { ok: true; geometryCollection: string }
  | { ok: false; status: number; message: string };

/**
 * Business logic for hunting areas, shared by the server-rendered manager
 * pages, the manager API (tRPC) and, later, the mobile sync.
 *
 * Every function takes the estate it works in: an area of another estate
 * behaves exactly like a missing one. Input is validated at the edges
 * (Zod in controllers / tRPC); this module only does the domain work.
 */

export class AreaNotFoundError extends Error {
  constructor() {
    super('Area not found');
    this.name = 'AreaNotFoundError';
  }
}

export class DeleteConfirmationError extends Error {
  constructor() {
    super('Confirmation name does not match.');
    this.name = 'DeleteConfirmationError';
  }
}

/** The uploaded file could not be used as a boundary (wrong type, broken, no polygons). */
export class GeofileRejectedError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GeofileRejectedError';
  }
}

/** Who performs a change, for the audit log. */
export type Actor = { userId: number; ip?: string };

export type AreaSummary = { id: number; name: string; estateId: number };

/** The area with this id, but only if it belongs to the given estate. */
export async function findAreaInEstate(estateId: number, areaId: number): Promise<AreaSummary | null> {
  const [area] = await db
    .select({ id: areasTable.id, name: areasTable.name, estateId: areasTable.estateId })
    .from(areasTable)
    .where(and(eq(areasTable.id, areaId), eq(areasTable.estateId, estateId)))
    .limit(1);
  return area ?? null;
}

async function requireAreaInEstate(estateId: number, areaId: number): Promise<AreaSummary> {
  const area = await findAreaInEstate(estateId, areaId);
  if (!area) throw new AreaNotFoundError();
  return area;
}

export async function createArea(estateId: number, name: string): Promise<AreaSummary> {
  const [area] = await db
    .insert(areasTable)
    .values({ name, estateId })
    .returning({ id: areasTable.id, name: areasTable.name, estateId: areasTable.estateId });
  return area;
}

export async function renameArea(estateId: number, areaId: number, name: string): Promise<void> {
  const area = await requireAreaInEstate(estateId, areaId);
  await db.update(areasTable).set({ name }).where(eq(areasTable.id, area.id));
}

/**
 * Deletes the area and its stands. The caller must repeat the area's name
 * (protection against deleting the wrong area by accident).
 */
export async function deleteArea(estateId: number, areaId: number, confirmName: string, actor: Actor): Promise<void> {
  const area = await requireAreaInEstate(estateId, areaId);
  if (confirmName !== area.name) throw new DeleteConfirmationError();

  // One statement: the foreign key (ON DELETE CASCADE) removes the stands
  // in the same operation, so area and stands go together or not at all.
  await db.delete(areasTable).where(eq(areasTable.id, area.id));

  await audit({
    event: 'area_deleted',
    userId: actor.userId,
    ip: actor.ip,
    metadata: { areaId: area.id, name: area.name, estateId: area.estateId },
  });
}

/** Removes the area's boundary (the uploaded geo file). */
export async function clearAreaBoundary(estateId: number, areaId: number, actor: Actor): Promise<void> {
  const area = await requireAreaInEstate(estateId, areaId);
  await db.update(areasTable).set({ geofile: null }).where(eq(areasTable.id, area.id));
  await audit({ userId: actor.userId, event: 'geofile_deleted', ip: actor.ip, metadata: { areaId: area.id } });
}

/**
 * Sets the area's boundary from an uploaded geo file (GPX, KML, GeoJSON,
 * Shapefile zip or GeoPackage). Only the polygons of the file are kept.
 */
export async function setAreaBoundaryFromFile(
  estateId: number,
  areaId: number,
  file: { buffer: Buffer; filename: string },
  actor: Actor,
): Promise<void> {
  const area = await requireAreaInEstate(estateId, areaId);

  const result = await runWorker<GeofileWorkerResult>(GEOFILE_WORKER, {
    buffer: file.buffer,
    filename: file.filename.toLowerCase(),
  });
  if (!result.ok) throw new GeofileRejectedError(result.status, result.message);

  await db
    .update(areasTable)
    .set({ geofile: sql`ST_Multi(ST_CollectionExtract(ST_GeomFromGeoJSON(${result.geometryCollection}), 3))` })
    .where(eq(areasTable.id, area.id));

  await audit({ userId: actor.userId, event: 'geofile_uploaded', ip: actor.ip, metadata: { areaId: area.id } });
}
