import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getLayerConfig, getAreaMapData } from '@/controllers/map';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 5 } } as any,
    params: {},
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
});

describe('getLayerConfig', () => {
  it('returns a layers array with topo and satellite entries', async () => {
    const res = mockRes();

    await getLayerConfig(mockReq() as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: expect.arrayContaining([
          expect.objectContaining({ id: 'topo' }),
          expect.objectContaining({ id: 'satellite' }),
        ]),
      }),
    );
  });
});

describe('getAreaMapData', () => {
  const fakeGeoJson = { type: 'FeatureCollection', features: [] };

  it('returns the parsed GeoJSON when the area is found', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 10, name: 'North Block', estateId: 5, geofile: JSON.stringify(fakeGeoJson) }]);
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(fakeGeoJson);
  });

  it('returns 404 when the area is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '99' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the area belongs to a different estate', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 10, name: 'North Block', estateId: 99, geofile: JSON.stringify(fakeGeoJson) }]);
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the area has no geo data', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 10, name: 'North Block', estateId: 5, geofile: null }]);
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
