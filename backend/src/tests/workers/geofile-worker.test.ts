import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { runWorker } from '@/utils/runWorker';

const WORKER_PATH = path.resolve('src/workers/geofile.worker.ts');
const FIXTURES_DIR = path.resolve('src/tests/fixtures');

type WorkerResult =
  | { ok: true; geometryCollection: string }
  | { ok: false; status: number; message: string };

const validFixtures = [
  ['sample.geojson'],
  ['sample.kml'],
  ['sample.gpx'],
  ['sample.zip'],
  ['sample.gpkg'],
] as const;

describe('geofile worker', () => {
  it.each(validFixtures)('parses %s and returns a GeometryCollection', async (filename) => {
    const buffer = await readFile(path.join(FIXTURES_DIR, filename));
    const result = await runWorker<WorkerResult>(WORKER_PATH, { buffer, filename });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const gc = JSON.parse(result.geometryCollection);
      expect(gc.type).toBe('GeometryCollection');
      expect(Array.isArray(gc.geometries)).toBe(true);
    }
  }, 15000);

  it('returns { ok: false, status: 400 } for an unsupported file type', async () => {
    const buffer = Buffer.from('name,lat,lng\nPoint A,51.5,0.1');
    const result = await runWorker<WorkerResult>(WORKER_PATH, { buffer, filename: 'data.csv' });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects when file content is unparseable (invalid GeoJSON)', async () => {
    const buffer = Buffer.from('this is not valid json {{{');
    await expect(
      runWorker<WorkerResult>(WORKER_PATH, { buffer, filename: 'bad.geojson' }),
    ).rejects.toThrow();
  });
});
