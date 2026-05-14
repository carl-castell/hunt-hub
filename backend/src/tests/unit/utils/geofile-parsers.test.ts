import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { createParser, ParseError, toGeometryCollection } from '@/utils/geofile-parsers';

const FIXTURES_DIR = path.resolve('src/tests/fixtures');

const validFixtures = [
  ['sample.geojson'],
  ['sample.kml'],
  ['sample.gpx'],
  ['sample.zip'],
  ['sample.gpkg'],
] as const;

describe('createParser', () => {
  it.each(validFixtures)('parses %s and returns a GeometryCollection', async (filename) => {
    const buffer = await readFile(path.join(FIXTURES_DIR, filename));
    const parser = createParser(filename);
    const result = await parser.parse(buffer);

    const gc = JSON.parse(result);
    expect(gc.type).toBe('GeometryCollection');
    expect(Array.isArray(gc.geometries)).toBe(true);
  }, 10000);

  it('throws ParseError for an unsupported file type', () => {
    expect(() => createParser('data.csv')).toThrow(ParseError);
    expect(() => createParser('data.csv')).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('GeoJsonParser', () => {
  it('throws SyntaxError when the file content is not valid JSON', async () => {
    const parser = createParser('bad.geojson');
    await expect(parser.parse(Buffer.from('not valid json {{{'))).rejects.toThrow(SyntaxError);
  });
});

describe('toGeometryCollection', () => {
  it('wraps a FeatureCollection', () => {
    const input = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
    });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries[0]).toEqual({ type: 'Point', coordinates: [0, 0] });
  });

  it('wraps a single Feature', () => {
    const input = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: {},
    });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries).toHaveLength(1);
  });

  it('wraps a plain geometry', () => {
    const input = JSON.stringify({ type: 'Point', coordinates: [1, 2] });
    const result = JSON.parse(toGeometryCollection(input));
    expect(result.type).toBe('GeometryCollection');
    expect(result.geometries[0].type).toBe('Point');
  });

  it('passes through an existing GeometryCollection unchanged', () => {
    const input = JSON.stringify({ type: 'GeometryCollection', geometries: [] });
    expect(toGeometryCollection(input)).toBe(input);
  });
});
