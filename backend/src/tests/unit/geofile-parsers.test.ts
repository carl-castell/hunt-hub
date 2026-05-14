import { describe, it, expect } from 'vitest';
import { toGeometryCollection, createParser, ParseError, GeoJsonParser, KmlParser, GpxParser, ShapefileParser, GeoPackageParser } from '@/utils/geofile-parsers';

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

  it('returns a GeometryCollection unchanged', () => {
    const input = JSON.stringify({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [5, 6] }],
    });

    const result = toGeometryCollection(input);

    expect(result).toBe(input);
  });

  it('wraps a raw geometry type (e.g. Point) into a GeometryCollection', () => {
    const input = JSON.stringify({ type: 'Point', coordinates: [7, 8] });

    const result = JSON.parse(toGeometryCollection(input));

    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries).toHaveLength(1);
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [7, 8] });
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

  it('throws a ParseError with status 400 for unsupported extensions', () => {
    expect(() => createParser('data.csv')).toThrow(ParseError);
    expect(() => createParser('data.csv')).toThrow('Unsupported file type');

    try {
      createParser('photo.jpg');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).status).toBe(400);
    }
  });
});

describe('GeoJsonParser.parse()', () => {
  it('parses valid GeoJSON and returns a GeometryCollection string', async () => {
    const parser = new GeoJsonParser();
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} },
      ],
    });

    const result = JSON.parse(await parser.parse(Buffer.from(input)));

    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [10, 20] });
  });

  it('throws a SyntaxError for invalid JSON', async () => {
    const parser = new GeoJsonParser();

    await expect(parser.parse(Buffer.from('not-json'))).rejects.toThrow(SyntaxError);
  });
});
