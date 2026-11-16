import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockGetAreaWithBoundary } = vi.hoisted(() => ({ mockGetAreaWithBoundary: vi.fn() }));

// The controller only translates between HTTP and the areas service; the
// database queries (incl. estate scoping) are tested against the real test
// database in tests/integration/manager/areas.test.ts.
vi.mock('@/services/areas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/areas')>()),
  getAreaWithBoundary: mockGetAreaWithBoundary,
}));
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getLayerConfig, getAreaMapData } from '@/controllers/map';
import { AreaNotFoundError } from '@/services/areas';

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
  const fakeGeoJson = { type: 'MultiPolygon', coordinates: [] };

  it('returns the parsed boundary of an area in the user\'s estate', async () => {
    mockGetAreaWithBoundary.mockResolvedValueOnce({ id: 10, name: 'North Block', estateId: 5, boundaryGeoJson: JSON.stringify(fakeGeoJson) });
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(mockGetAreaWithBoundary).toHaveBeenCalledWith(5, 10);
    expect(res.json).toHaveBeenCalledWith(fakeGeoJson);
  });

  it('returns 404 when the service finds no area (unknown or other estate)', async () => {
    mockGetAreaWithBoundary.mockRejectedValueOnce(new AreaNotFoundError());
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '99' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for users without an estate (admins)', async () => {
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' }, session: { user: { id: 1, role: 'admin', estateId: null } } as any }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetAreaWithBoundary).not.toHaveBeenCalled();
  });

  it('returns 404 when the area has no boundary', async () => {
    mockGetAreaWithBoundary.mockResolvedValueOnce({ id: 10, name: 'North Block', estateId: 5, boundaryGeoJson: null });
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetAreaWithBoundary.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getAreaMapData(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
