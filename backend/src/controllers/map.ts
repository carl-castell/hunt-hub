import { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { logError } from '@/utils/logError';

// ── GET /map/layers ───────────────────────────────────────────────────────────

export async function getLayerConfig(_req: Request, res: Response) {
  res.json({
    layers: [

      {
        id: 'topo',
        label: 'Topographic',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17,
      },
      {
        id: 'satellite',
        label: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19,
      },
    ],
  });
}

// ── GET /map/area/:id ─────────────────────────────────────────────────────────

export async function getAreaMapData(req: Request, res: Response) {
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

    if (!area || area.estateId !== user.estateId) {
      return res.status(404).json({ error: 'Area not found' });
    }

    if (!area.geofile) {
      return res.status(404).json({ error: 'No geo data for this area' });
    }

    res.json(JSON.parse(area.geofile));
  } catch (err) {
    logError('[error]', err);
    res.status(500).json({ error: 'Server error' });
  }
}
