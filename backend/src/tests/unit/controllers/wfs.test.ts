import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/services/audit', () => ({ audit: vi.fn() }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { describeFeatureType, wfsGet } from '@/controllers/wfs';

function mockReq(query: Record<string, string> = {}): Partial<Request> {
  return {
    query,
    wfsUser: { id: 1, estateId: 10 },
    protocol: 'http',
    get: vi.fn().mockReturnValue('localhost:3000'),
  } as any;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('describeFeatureType', () => {
  it('returns 200 with XML content-type', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'areas' }) as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/xml');
  });

  it('returns areasType schema when typeNames=areas', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'areas' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('areasType');
    expect(xml).toContain('xs:schema');
  });

  it('returns areasType schema when typeNames matches area_N pattern', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'area_42' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('areasType');
    expect(xml).toContain('area_42');
  });

  it('returns standsType schema when typeNames matches stands_N pattern', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'stands_7' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('standsType');
    expect(xml).toContain('stands_7');
  });

  it('falls back to areas when no typeNames provided', () => {
    const res = mockRes();
    describeFeatureType(mockReq({}) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('areasType');
  });

  it('reads typeName (singular) as fallback', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeName: 'stands_3' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('standsType');
  });

  it('produces empty definitions for unrecognised type names', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'unknown_type' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).not.toContain('areasType');
    expect(xml).not.toContain('standsType');
  });

  it('handles comma-separated list with mixed types', () => {
    const res = mockRes();
    describeFeatureType(mockReq({ typeNames: 'stands_1,area_2' }) as Request, res as unknown as Response);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('standsType');
    expect(xml).toContain('areasType');
  });
});

describe('wfsGet — dispatcher', () => {
  it('routes DescribeFeatureType to describeFeatureType (sync, returns 200)', () => {
    const res = mockRes();
    wfsGet(mockReq({ request: 'DescribeFeatureType', typeNames: 'stands_5' }) as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('standsType');
  });

  it('returns 400 ExceptionReport for an unsupported request type', async () => {
    const res = mockRes();
    await wfsGet(mockReq({ request: 'NotAThingRequest' }) as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    const xml: string = res.send.mock.calls[0][0];
    expect(xml).toContain('OperationNotSupported');
    expect(xml).toContain('ExceptionReport');
  });

  it('returns 400 ExceptionReport when request param is absent', async () => {
    const res = mockRes();
    await wfsGet(mockReq({}) as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
