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
    // Dynamic import + asm.js build avoids WASM file resolution issues in worker threads
    const initSqlJs = (await import('sql.js/dist/sql-asm.js' as any)).default as () => Promise<any>;
    const { Geometry: WkxGeometry } = await import('wkx');
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(buf));

    const gcResult = db.exec('SELECT table_name, column_name FROM gpkg_geometry_columns');
    if (!gcResult.length || !gcResult[0].values.length) {
      db.close();
      const result: WorkerResult = { ok: false, status: 400, message: 'No geometry layers found in GeoPackage' };
      parentPort!.postMessage(result);
      return;
    }

    const features: any[] = [];
    for (const [tableName, columnName] of gcResult[0].values as [string, string][]) {
      const rows = db.exec(`SELECT * FROM "${tableName}"`);
      if (!rows.length) continue;

      const cols = rows[0].columns;
      const geomIdx = cols.indexOf(columnName);

      for (const row of rows[0].values) {
        const blob = row[geomIdx];
        if (!blob || !(blob instanceof Uint8Array)) continue;

        // GPKG geometry blob: 2-byte magic + version + flags + 4-byte srsId + optional envelope + WKB
        // flags: bit0=byte order, bits 1-3=envelope type, bit4=empty
        const flags = blob[3];
        const envelopeType = (flags >> 1) & 0x07;
        const envelopeBytes = ([0, 32, 48, 48, 64] as const)[envelopeType] ?? 0;
        const wkbStart = 8 + envelopeBytes;

        try {
          const geom = WkxGeometry.parse(Buffer.from(blob.subarray(wkbStart))) as any;
          const properties: Record<string, unknown> = {};
          cols.forEach((col: string, i: number) => { if (i !== geomIdx) properties[col] = row[i]; });
          features.push({ type: 'Feature', geometry: geom.toGeoJSON(), properties });
        } catch { /* skip unparseable geometry */ }
      }
    }

    db.close();
    geojson = JSON.stringify({ type: 'FeatureCollection', features });

  } else {
    const result: WorkerResult = { ok: false, status: 400, message: 'Unsupported file type. Use .geojson, .kml, .gpx, .zip (shapefile), or .gpkg' };
    parentPort!.postMessage(result);
    return;
  }

  const result: WorkerResult = { ok: true, geometryCollection: toGeometryCollection(geojson) };
  parentPort!.postMessage(result);
}

run().catch(err => { throw err; });
