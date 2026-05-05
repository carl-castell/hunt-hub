import { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import path from 'path';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { standsTable } from '@/db/schema/stands';
import { runWorker } from '@/utils/runWorker';
import { audit } from '@/services/audit';
import { logError } from '@/utils/logError';
import { areaNameSchema, deleteConfirmSchema } from '@/schemas';

const GEOFILE_WORKER = path.resolve(
  __dirname,
  __filename.endsWith('.ts') ? '../../workers/geofile.worker.ts' : '../../workers/geofile.worker.js'
);

// ── Get Area ─────────────────────────────────────────────────────────────────

export async function getArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [area] = await db
      .select({
        id: areasTable.id,
        name: areasTable.name,
        estateId: areasTable.estateId,
        geofile: sql<string>`ST_AsGeoJSON(geofile)`,
      })
      .from(areasTable)
      .where(eq(areasTable.id, Number(id)))
      .limit(1);

    if (!area || area.estateId !== user.estateId) return res.status(404).send('Area not found');

    const breadcrumbs = [
      { label: 'Estate', href: '/manager/estate' },
      { label: area.name },
    ];
    res.render('manager/estate/area', { title: area.name, user, area, breadcrumbs });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Create Area ───────────────────────────────────────────────────────────────

export async function postCreateArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = areaNameSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const [area] = await db
      .insert(areasTable)
      .values({ name: result.data.name, estateId: user.estateId! })
      .returning();

    res.redirect(`/manager/areas/${area.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Rename Area ───────────────────────────────────────────────────────────────

export async function postRenameArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [area] = await db
      .select({
        id: areasTable.id,
        name: areasTable.name,
        estateId: areasTable.estateId,
      })
      .from(areasTable)
      .where(eq(areasTable.id, Number(id)))
      .limit(1);

    if (!area || area.estateId !== user.estateId) return res.status(404).send('Area not found');

    const result = areaNameSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db
      .update(areasTable)
      .set({ name: result.data.name })
      .where(eq(areasTable.id, Number(id)));

    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Delete Area ───────────────────────────────────────────────────────────────

export async function postDeleteArea(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [area] = await db
      .select({
        id: areasTable.id,
        name: areasTable.name,
        estateId: areasTable.estateId,
      })
      .from(areasTable)
      .where(eq(areasTable.id, Number(id)))
      .limit(1);

    if (!area || area.estateId !== user.estateId) return res.status(404).send('Area not found');

    const result = deleteConfirmSchema.safeParse(req.body);
    if (!result.success || result.data.confirm !== area.name) {
      return res.status(400).send('Confirmation name does not match.');
    }

    await db.delete(standsTable).where(eq(standsTable.areaId, Number(id)));
    await db.delete(areasTable).where(eq(areasTable.id, Number(id)));

    await audit({
      event: 'area_deleted',
      userId: user.id,
      ip: req.ip,
      metadata: { areaId: area.id, name: area.name, estateId: area.estateId },
    });

    res.redirect('/manager/estate');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Upload / Replace Geo File ─────────────────────────────────────────────────

export async function postUploadGeofile(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [area] = await db
      .select({
        id: areasTable.id,
        name: areasTable.name,
        estateId: areasTable.estateId,
      })
      .from(areasTable)
      .where(eq(areasTable.id, Number(id)))
      .limit(1);

    if (!area || area.estateId !== user.estateId) return res.status(404).send('Area not found');
    if (!req.file) return res.status(400).send('No file uploaded');

    const result = await runWorker<{ ok: true; geometryCollection: string } | { ok: false; status: number; message: string }>(
      GEOFILE_WORKER,
      { buffer: req.file.buffer, filename: req.file.originalname.toLowerCase() },
    );

    if (!result.ok) return res.status(result.status).send(result.message);

    await db
      .update(areasTable)
      .set({ geofile: sql`ST_Multi(ST_CollectionExtract(ST_GeomFromGeoJSON(${result.geometryCollection}), 3))` })
      .where(eq(areasTable.id, Number(id)));

    await audit({ userId: user.id, event: 'geofile_uploaded', ip: req.ip, metadata: { areaId: Number(id) } });
    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Delete Geo File ───────────────────────────────────────────────────────────

export async function postDeleteGeofile(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [area] = await db
      .select({
        id: areasTable.id,
        name: areasTable.name,
        estateId: areasTable.estateId,
      })
      .from(areasTable)
      .where(eq(areasTable.id, Number(id)))
      .limit(1);

    if (!area || area.estateId !== user.estateId) return res.status(404).send('Area not found');

    await db
      .update(areasTable)
      .set({ geofile: null })
      .where(eq(areasTable.id, Number(id)));

    await audit({ userId: user.id, event: 'geofile_deleted', ip: req.ip, metadata: { areaId: Number(id) } });
    res.redirect(`/manager/areas/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
