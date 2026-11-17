import AdmZip from 'adm-zip';
import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  toGeometryCollection,
  createParser,
  ParseError,
  GeoJsonParser,
  KmlParser,
  GpxParser,
  ShapefileParser,
  GeoPackageParser,
} from '@/utils/geofile-parsers';

const FIXTURES_DIR = path.resolve('src/tests/fixtures');

describe('toGeometryCollection()', () => {
  it('wraps a FeatureCollection into a GeometryCollection', () => {
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      ],
    });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries).toHaveLength(2);
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [1, 2] });
  });

  it('filters out null geometries from a FeatureCollection', () => {
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: null, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 4] }, properties: {} },
      ],
    });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.geometries).toHaveLength(1);
    expect(result.geometries[0].type).toBe('Point');
  });

  it('wraps a single Feature into a one-element GeometryCollection', () => {
    const input = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: {},
    });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries).toHaveLength(1);
    expect(result.geometries[0].type).toBe('Polygon');
  });

  it('wraps a raw geometry type into a GeometryCollection', () => {
    const input = JSON.stringify({ type: 'Point', coordinates: [7, 8] });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [7, 8] });
  });

  it('returns a GeometryCollection unchanged', () => {
    const input = JSON.stringify({ type: 'GeometryCollection', geometries: [] });
    expect(toGeometryCollection(input)).toBe(input);
  });
});

describe('createParser()', () => {
  it('returns a GeoJsonParser for .geojson files', () => {
    expect(createParser('map.geojson')).toBeInstanceOf(GeoJsonParser);
  });

  it('returns a GeoJsonParser for .json files', () => {
    expect(createParser('data.json')).toBeInstanceOf(GeoJsonParser);
  });

  it('returns a KmlParser for .kml files', () => {
    expect(createParser('areas.kml')).toBeInstanceOf(KmlParser);
  });

  it('returns a GpxParser for .gpx files', () => {
    expect(createParser('track.gpx')).toBeInstanceOf(GpxParser);
  });

  it('returns a ShapefileParser for .zip files', () => {
    expect(createParser('shapefile.zip')).toBeInstanceOf(ShapefileParser);
  });

  it('returns a GeoPackageParser for .gpkg files', () => {
    expect(createParser('layers.gpkg')).toBeInstanceOf(GeoPackageParser);
  });

  it('throws ParseError with status 400 for unsupported extensions', () => {
    expect(() => createParser('data.csv')).toThrow(ParseError);
    try {
      createParser('photo.jpg');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).status).toBe(400);
    }
  });
});

const validFixtures = [
  ['sample.geojson'],
  ['sample.kml'],
  ['sample.gpx'],
  ['sample.zip'],
  ['sample.gpkg'],
] as const;

describe('createParser() with fixture files', () => {
  it.each(validFixtures)('parses %s and returns a GeometryCollection', async (filename) => {
    const buffer = await readFile(path.join(FIXTURES_DIR, filename));
    const parser = createParser(filename);
    const result = await parser.parse(buffer);

    const gc = JSON.parse(result);
    expect(gc.type).toBe('GeometryCollection');
    expect(Array.isArray(gc.geometries)).toBe(true);
  }, 10000);
});

describe('GeoJsonParser.parse()', () => {
  it('parses valid GeoJSON and returns a GeometryCollection string', async () => {
    const parser = new GeoJsonParser();
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} }],
    });
    const result = JSON.parse(await parser.parse(Buffer.from(input)));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [10, 20] });
  });

  it('throws SyntaxError for invalid JSON', async () => {
    const parser = new GeoJsonParser();
    await expect(parser.parse(Buffer.from('not-json'))).rejects.toThrow(SyntaxError);
  });
});

describe('coordinate system of a file', () => {
  const UTM_PRJ = 'PROJCS["ETRS_1989_UTM_Zone_32N",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]]]]';

  it('takes the .prj of a shapefile as it is, and null without one', async () => {
    const original = new AdmZip(await readFile(path.join(FIXTURES_DIR, 'sample.zip')));
    const withoutPrj = new AdmZip();
    const withPrj = new AdmZip();
    for (const entry of original.getEntries()) {
      if (entry.entryName.toLowerCase().endsWith('.prj')) continue;
      withoutPrj.addFile(entry.entryName, entry.getData());
      withPrj.addFile(entry.entryName, entry.getData());
    }
    const shp = original.getEntries().find((e) => e.entryName.endsWith('.shp'))!.entryName;
    withPrj.addFile(shp.replace(/\.shp$/, '.prj'), Buffer.from(UTM_PRJ));

    const parserWith = createParser('with.zip');
    await parserWith.parse(withPrj.toBuffer());
    expect(parserWith.crs).toBe(UTM_PRJ);

    const parserWithout = createParser('without.zip');
    await parserWithout.parse(withoutPrj.toBuffer());
    expect(parserWithout.crs).toBeNull();
  }, 10000);

  it('reads the crs member of a GeoJSON file, null without one', async () => {
    const named = createParser('a.geojson');
    await named.parse(Buffer.from(JSON.stringify({ type: 'Point', coordinates: [1, 2], crs: { type: 'name', properties: { name: 'EPSG:25832' } } })));
    expect(named.crs).toBe('EPSG:25832');

    const plain = createParser('b.geojson');
    await plain.parse(Buffer.from(JSON.stringify({ type: 'Point', coordinates: [1, 2] })));
    expect(plain.crs).toBeNull();
  });

  it('reads the coordinate system of a GeoPackage layer', async () => {
    const parser = createParser('sample.gpkg');
    await parser.parse(await readFile(path.join(FIXTURES_DIR, 'sample.gpkg')));
    expect(parser.crs).toMatch(/^EPSG:\d+$/);
  }, 10000);
});
