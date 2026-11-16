import { Request, Response } from 'express';
import { AreaNotFoundError, getAreaWithBoundary } from '@/services/areas';
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
    if (user.estateId === null) return res.status(404).json({ error: 'Area not found' });

    const area = await getAreaWithBoundary(user.estateId, Number(req.params.id));
    if (!area.boundaryGeoJson) return res.status(404).json({ error: 'No geo data for this area' });

    res.json(JSON.parse(area.boundaryGeoJson));
  } catch (err) {
    if (err instanceof AreaNotFoundError) return res.status(404).json({ error: err.message });
    logError('[error]', err);
    res.status(500).json({ error: 'Server error' });
  }
}
