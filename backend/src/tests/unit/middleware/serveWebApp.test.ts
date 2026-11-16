import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { serveWebApp } from '@/middlewares/serveWebApp';

let distDir: string;

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<div id="root"></div>');
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1)');
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

function appWithWebApp(dir: string) {
  const app = express();
  serveWebApp(app, dir);
  app.get('/manager', (_req, res) => res.send('server-rendered page'));
  return app;
}

describe('serveWebApp', () => {
  it('serves index.html for the app root', async () => {
    const res = await request(appWithWebApp(distDir)).get('/app');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves index.html for deep links so a reload works', async () => {
    const res = await request(appWithWebApp(distDir)).get('/app/manager/areas/3');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('serves hashed assets with a long cache lifetime', async () => {
    const res = await request(appWithWebApp(distDir)).get('/app/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('returns 404 for a missing file instead of the HTML page', async () => {
    const res = await request(appWithWebApp(distDir)).get('/app/assets/index-old999.js');
    expect(res.status).toBe(404);
  });

  it('leaves server-rendered routes untouched', async () => {
    const res = await request(appWithWebApp(distDir)).get('/manager');
    expect(res.text).toBe('server-rendered page');
  });

  it('does nothing when the build is missing', async () => {
    const res = await request(appWithWebApp(path.join(distDir, 'does-not-exist'))).get('/app');
    expect(res.status).toBe(404);
  });
});
