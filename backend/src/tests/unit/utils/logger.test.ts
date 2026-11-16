import { describe, it, expect } from 'vitest';
import { Writable } from 'stream';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sanitizeUrl, requestIdFor, createLogger, createRequestLogger } from '@/utils/logger';

describe('sanitizeUrl', () => {
  it('keeps normal URLs unchanged', () => {
    expect(sanitizeUrl('/manager/areas/3')).toBe('/manager/areas/3');
    expect(sanitizeUrl('/api/v1/trpc/manager.areas.get?input=%7B%22id%22%3A3%7D')).toBe('/api/v1/trpc/manager.areas.get?input=%7B%22id%22%3A3%7D');
  });

  it('hides the activation token', () => {
    expect(sanitizeUrl('/activate/abc123secret')).toBe('/activate/[redacted]');
  });

  it("hides a guest's RSVP magic link but keeps the action", () => {
    expect(sanitizeUrl('/rsvp/9f2c1e/respond')).toBe('/rsvp/[redacted]/respond');
  });

  it("keeps the manager's RSVP preview (no secret)", () => {
    expect(sanitizeUrl('/rsvp/preview/12/respond')).toBe('/rsvp/preview/12/respond');
  });

  it('hides token query parameters, e.g. the QGIS/WFS token', () => {
    expect(sanitizeUrl('/wfs?SERVICE=WFS&token=supersecret')).toBe('/wfs?SERVICE=WFS&token=%5Bredacted%5D');
    expect(sanitizeUrl('/wfs?TOKEN=supersecret')).toBe('/wfs?TOKEN=%5Bredacted%5D');
  });
});

describe('requestIdFor', () => {
  const res = () => {
    const headers: Record<string, string> = {};
    return { headers, setHeader: (name: string, value: string) => { headers[name] = value; } };
  };

  it('creates a new id and returns it in the X-Request-Id header', () => {
    const response = res();
    const id = requestIdFor({ headers: {} } as never, response as never);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['X-Request-Id']).toBe(id);
  });

  it('reuses a safe incoming id, e.g. from a proxy', () => {
    const id = requestIdFor({ headers: { 'x-request-id': 'abc-123' } } as never, res() as never);
    expect(id).toBe('abc-123');
  });

  it('ignores an unsafe incoming id (log injection)', () => {
    const id = requestIdFor({ headers: { 'x-request-id': 'evil\n{"level":"fatal"}' } } as never, res() as never);
    expect(id).not.toContain('evil');
  });
});

describe('redaction (the app logger configuration)', () => {
  function captured() {
    const lines: string[] = [];
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(chunk.toString()); done(); } });
    return { log: createLogger(sink, 'info'), output: () => lines.join('') };
  }

  it('never writes passwords, tokens or cookies', () => {
    const { log, output } = captured();

    log.info({
      password: 'hunter2',
      user: { newPassword: 'n3w', token: 't0k', refreshToken: 'r3fresh' },
      req: { headers: { cookie: 'sid=abc', authorization: 'Bearer xyz' } },
    }, 'probe');

    expect(output()).not.toMatch(/hunter2|n3w|t0k|r3fresh|sid=abc|Bearer xyz/);
    expect(output()).toContain('[redacted]');
  });

  it('writes one JSON object per line with level, time and service', () => {
    const { log, output } = captured();

    log.info({ userId: 7 }, 'hello');

    const line = JSON.parse(output().trim());
    expect(line).toMatchObject({ level: 'info', msg: 'hello', userId: 7, service: 'hunt-hub-backend' });
    expect(new Date(line.time).toString()).not.toBe('Invalid Date');
  });
});

describe('request logging', () => {
  function appWithCapturedLog() {
    const lines: string[] = [];
    const sink = new Writable({ write(chunk, _enc, done) { lines.push(chunk.toString()); done(); } });
    const app = express();
    app.use(createRequestLogger(createLogger(sink, 'info')));
    const entries = () => lines.map((line) => JSON.parse(line));
    return { app, entries };
  }

  it('logs a completed static file as completed, not aborted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-'));
    fs.writeFileSync(path.join(dir, 'style.css'), 'body{}');
    const { app, entries } = appWithCapturedLog();
    app.use(express.static(dir));

    await request(app).get('/style.css').expect(200);

    expect(entries().slice(-1)[0]).toMatchObject({ msg: 'request completed', req: { method: 'GET', url: '/style.css' }, res: { statusCode: 200 } });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('logs 4xx as warn, with the safe URL and the request id', async () => {
    const { app, entries } = appWithCapturedLog();
    app.get('/activate/:token', (_req, res) => { res.status(404).end(); });

    const res = await request(app).get('/activate/SECRET').set('X-Request-Id', 'trace-1');

    expect(res.headers['x-request-id']).toBe('trace-1');
    expect(entries().slice(-1)[0]).toMatchObject({ level: 'warn', req: { id: 'trace-1', url: '/activate/[redacted]' } });
    expect(JSON.stringify(entries())).not.toContain('SECRET');
  });

  it('does not log health checks', async () => {
    const { app, entries } = appWithCapturedLog();
    app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

    await request(app).get('/health').expect(200);

    expect(entries()).toHaveLength(0);
  });
});
