import { workerData, parentPort } from 'worker_threads';
import toGeoJSON from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as shapefile from 'shapefile';

type WorkerInput  = { buffer: Buffer; filename: string };
type WorkerResult = { ok: true; geometryCollection: string } | { ok: false; status: number; message: string };

function toGeometryCollection(geojson: string): string {
  const parsed = JSON.parse(geojson);

  if (parsed.type === 'FeatureCollection') {
    return JSON.stringify({
      type: 'GeometryCollection',
      geometries: parsed.features.map((f: any) => f.geometry).filter(Boolean),
    });
  }

  if (parsed.type === 'Feature') {
    return JSON.stringify({
      type: 'GeometryCollection',
      geometries: [parsed.geometry].filter(Boolean),
    });
  }

  if (parsed.type !== 'GeometryCollection') {
    return JSON.stringify({ type: 'GeometryCollection', geometries: [parsed] });
  }

  return geojson;
}

async function run(): Promise<void> {
  const { buffer, filename }: WorkerInput = workerData;
  const buf = Buffer.from(buffer);
  const content = buf.toString('utf-8');
  let geojson: string;

  if (filename.endsWith('.geojson') || filename.endsWith('.json')) {
    JSON.parse(content);
    geojson = content;

  } else if (filename.endsWith('.kml')) {
    const dom = new DOMParser().parseFromString(content, 'text/xml' as any);
    geojson = JSON.stringify(toGeoJSON.kml(dom));

  } else if (filename.endsWith('.gpx')) {
    const dom = new DOMParser().parseFromString(content, 'text/xml' as any);
    geojson = JSON.stringify(toGeoJSON.gpx(dom));

  } else if (filename.endsWith('.zip')) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shp-'));
    new AdmZip(buf).extractAllTo(tmpDir, true);

    const files = await fs.readdir(tmpDir);
    const shpFile = files.find(f => f.endsWith('.shp'));
    if (!shpFile) {
      await fs.rm(tmpDir, { recursive: true });
      const result: WorkerResult = { ok: false, status: 400, message: 'ZIP does not contain a .shp file' };
      parentPort!.postMessage(result);
      return;
    }

    const shpPath = path.join(tmpDir, shpFile);
    const dbfPath = shpPath.replace('.shp', '.dbf');
    const features: any[] = [];
    const source = await shapefile.open(shpPath, dbfPath);
    let next = await source.read();
    while (!next.done) { features.push(next.value); next = await source.read(); }
    geojson = JSON.stringify({ type: 'FeatureCollection', features });
    await fs.rm(tmpDir, { recursive: true });

  } else if (filename.endsWith('.gpkg')) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gpkg-'));
    const gpkgPath = path.join(tmpDir, 'upload.gpkg');
    await fs.writeFile(gpkgPath, buf);

    let gdal: any;
    try {
      gdal = (await import('gdal-async')).default;
    } catch {
      await fs.rm(tmpDir, { recursive: true });
      const result: WorkerResult = { ok: false, status: 400, message: 'GeoPackage (.gpkg) is not supported on this server. Use .geojson, .kml, .gpx, or .zip instead.' };
      parentPort!.postMessage(result);
      return;
    }

    const ds = await gdal.openAsync(gpkgPath);
    const features: any[] = [];
    for (const layer of ds.layers) {
      for (const feature of layer.features) {
        const geom = feature.getGeometry();
        if (!geom) continue;
        features.push({ type: 'Feature', geometry: JSON.parse(geom.toJSON()), properties: feature.fields.toObject() });
      }
    }
    geojson = JSON.stringify({ type: 'FeatureCollection', features });
    ds.close();
    await fs.rm(tmpDir, { recursive: true });

  } else {
    const result: WorkerResult = { ok: false, status: 400, message: 'Unsupported file type. Use .geojson, .kml, .gpx, .zip (shapefile), or .gpkg' };
    parentPort!.postMessage(result);
    return;
  }

  const result: WorkerResult = { ok: true, geometryCollection: toGeometryCollection(geojson) };
  parentPort!.postMessage(result);
}

run().catch(err => { throw err; });
