import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '@/routes/health';

const appWith = (ping: () => Promise<unknown>) => {
  const app = express();
  app.use(createHealthRouter(ping));
  return app;
};

describe('GET /health', () => {
  it('returns 200 when the database answers', async () => {
    const res = await request(appWith(vi.fn().mockResolvedValue({ rows: [] }))).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 when the database fails', async () => {
    const res = await request(appWith(vi.fn().mockRejectedValue(new Error('connection refused')))).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', checks: { database: 'unreachable' } });
  });

  it('reports the deployed commit (shortened) when Render provides it', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '3bb1768abcdef0123456789');
    const res = await request(appWith(vi.fn().mockResolvedValue({}))).get('/health');
    vi.unstubAllEnvs();

    expect(res.body.commit).toBe('3bb1768');
  });

  it('does not leak error details', async () => {
    const res = await request(appWith(vi.fn().mockRejectedValue(new Error('password authentication failed')))).get('/health');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
