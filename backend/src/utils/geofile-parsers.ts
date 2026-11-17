import * as toGeoJSON from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as shapefile from 'shapefile';
import { WGS84 } from './crs';

/** The part of the sql.js API the GeoPackage parser uses. */
type SqlJs = {
  Database: new (data: Uint8Array) => {
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    close(): void;
  };
};

export class ParseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function toGeometryCollection(geojson: string): string {
  const parsed = JSON.parse(geojson);

  if (parsed.type === 'FeatureCollection') {
    return JSON.stringify({
      type: 'GeometryCollection',
      geometries: parsed.features.map((f: { geometry: unknown }) => f.geometry).filter(Boolean),
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

export abstract class GeoFileParser {
  abstract parse(buf: Buffer): Promise<string>;

  /**
   * The file's coordinate system as the file describes it (EPSG code, URN or
   * WKT), known after parse(). null: the file doesn't say. KML and GPX are
   * always WGS 84.
   */
  crs: string | null = WGS84;

  protected toGeometryCollection(geojson: string): string {
    return toGeometryCollection(geojson);
  }
}

export class GeoJsonParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> {
    const content = buf.toString('utf-8');
    const parsed = JSON.parse(content);
    // Older files (and QGIS exports) name their system. Without one, GeoJSON should be WGS 84,
    // but some tools write UTM anyway: "doesn't say", so the coordinates are checked.
    this.crs = typeof parsed?.crs?.properties?.name === 'string' ? parsed.crs.properties.name : null;
    return this.toGeometryCollection(content);
  }
}

export class KmlParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> {
    const content = buf.toString('utf-8');
    const dom = new DOMParser().parseFromString(content, 'text/xml');
    return this.toGeometryCollection(JSON.stringify(toGeoJSON.kml(dom)));
  }
}

export class GpxParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> {
    const content = buf.toString('utf-8');
    const dom = new DOMParser().parseFromString(content, 'text/xml');
    return this.toGeometryCollection(JSON.stringify(toGeoJSON.gpx(dom)));
  }
}

export class ShapefileParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shp-'));
    new AdmZip(buf).extractAllTo(tmpDir, true);
    const files = await fs.readdir(tmpDir);
    const shpFile = files.find(f => f.endsWith('.shp'));
    if (!shpFile) {
      await fs.rm(tmpDir, { recursive: true });
      throw new ParseError(400, 'ZIP does not contain a .shp file');
    }
    const shpPath = path.join(tmpDir, shpFile);
    const dbfPath = shpPath.replace('.shp', '.dbf');
    // The .prj file names the coordinate system; without it, it is unknown.
    const prjFile = files.find(f => f.toLowerCase() === shpFile.toLowerCase().replace(/\.shp$/, '.prj'));
    this.crs = prjFile ? (await fs.readFile(path.join(tmpDir, prjFile), 'utf-8')).trim() || null : null;
    const features: unknown[] = [];
    const source = await shapefile.open(shpPath, dbfPath);
    let next = await source.read();
    while (!next.done) { features.push(next.value); next = await source.read(); }
    await fs.rm(tmpDir, { recursive: true });
    return this.toGeometryCollection(JSON.stringify({ type: 'FeatureCollection', features }));
  }
}

export class GeoPackageParser extends GeoFileParser {
  override async parse(buf: Buffer): Promise<string> {
    // The pure-JS build of sql.js has no type declarations, so describe the part we use.
    const sqlJsModule: string = 'sql.js/dist/sql-asm.js';
    const initSqlJs = (await import(sqlJsModule)).default as () => Promise<SqlJs>;
    const { Geometry: WkxGeometry } = await import('wkx');
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(buf));

    const gcResult = db.exec('SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns');
    if (!gcResult.length || !gcResult[0].values.length) {
      db.close();
      throw new ParseError(400, 'No geometry layers found in GeoPackage');
    }

    // The coordinate system of the first layer; QGIS writes one per file.
    const srsId = (gcResult[0].values[0] as unknown[])[2];
    this.crs = geoPackageCrs(db, srsId);

    const features: unknown[] = [];
    for (const [tableName, columnName] of gcResult[0].values as [string, string][]) {
      const rows = db.exec(`SELECT * FROM "${tableName}"`);
      if (!rows.length) continue;

      const cols = rows[0].columns;
      const geomIdx = cols.indexOf(columnName);

      for (const row of rows[0].values) {
        const blob = row[geomIdx];
        if (!blob || !(blob instanceof Uint8Array)) continue;

        const flags = blob[3];
        const envelopeType = (flags >> 1) & 0x07;
        const envelopeBytes = ([0, 32, 48, 48, 64] as const)[envelopeType] ?? 0;
        const wkbStart = 8 + envelopeBytes;

        try {
          const geom = WkxGeometry.parse(Buffer.from(blob.subarray(wkbStart)));
          const properties: Record<string, unknown> = {};
          cols.forEach((col: string, i: number) => { if (i !== geomIdx) properties[col] = row[i]; });
          features.push({ type: 'Feature', geometry: geom.toGeoJSON(), properties });
        } catch { /* skip unparseable geometry */ }
      }
    }

    db.close();
    return this.toGeometryCollection(JSON.stringify({ type: 'FeatureCollection', features }));
  }
}

/**
 * A GeoPackage layer's coordinate system: "EPSG:<code>" for EPSG systems,
 * otherwise the WKT definition stored in the file. -1 means "undefined
 * Cartesian" (unknown), 0 "undefined geographic" (longitude/latitude).
 */
function geoPackageCrs(db: InstanceType<SqlJs['Database']>, srsId: unknown): string | null {
  if (typeof srsId !== 'number') return null;
  if (srsId === 0) return WGS84;
  const res = db.exec(`SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id = ${Math.trunc(srsId)}`);
  const row = res[0]?.values[0];
  if (!row) return null;
  const [organization, code, definition] = row;
  if (String(organization).toUpperCase() === 'EPSG' && typeof code === 'number' && code > 0) return `EPSG:${code}`;
  return typeof definition === 'string' && definition.trim() && definition.trim() !== 'undefined' ? definition.trim() : null;
}

export function createParser(filename: string): GeoFileParser {
  if (filename.endsWith('.geojson') || filename.endsWith('.json')) return new GeoJsonParser();
  if (filename.endsWith('.kml'))  return new KmlParser();
  if (filename.endsWith('.gpx'))  return new GpxParser();
  if (filename.endsWith('.zip'))  return new ShapefileParser();
  if (filename.endsWith('.gpkg')) return new GeoPackageParser();
  throw new ParseError(400, 'Unsupported file type. Use .geojson, .kml, .gpx, .zip (shapefile), or .gpkg');
}
