import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { codeOf, errorHandler, notFound, statusOf } from '@/middlewares/errorHandler';

function testApp() {
  const app = express();
  app.use((_req, res, next) => { res.setHeader('X-Request-Id', 'req-123'); next(); });
  app.use(express.json({ limit: '10b' }));
  app.get('/api/boom', () => { throw new Error('database password is secret'); });
  app.get('/boom', () => { throw new Error('database password is secret'); });
  app.post('/api/echo', (req, res) => res.json(req.body));
  app.get('/api/teapot', (_req, _res, next) => next(Object.assign(new Error('nope'), { status: 418 })));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('API: unexpected errors become a 500 without internal details, with the request id', async () => {
    const res = await request(testApp()).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong on our side. Please try again later.', requestId: 'req-123' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('browser: the same error as a short page, still without details', async () => {
    const res = await request(testApp()).get('/boom').set('Accept', 'text/html');
    expect(res.status).toBe(500);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Request ID: req-123');
    expect(res.text).not.toContain('secret');
  });

  it('keeps the status and message of client errors that are meant for the client (body parser)', async () => {
    const res = await request(testApp()).post('/api/echo').set('Content-Type', 'application/json').send('{"too":"long for 10 bytes"}');
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' });
  });

  it('client errors without a public message get the standard one', async () => {
    const res = await request(testApp()).get('/api/teapot');
    expect(res.status).toBe(418);
    expect(res.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'The request could not be understood.' });
  });
});

describe('notFound', () => {
  it('API paths: a JSON 404', async () => {
    const res = await request(testApp()).get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-123' });
  });

  it('pages: an HTML 404', async () => {
    const res = await request(testApp()).get('/nothing-here').set('Accept', 'text/html');
    expect(res.status).toBe(404);
    expect(res.text).toContain('This page or resource does not exist.');
  });
});

describe('statusOf / codeOf', () => {
  it('uses the error status only if it is a real HTTP error status', () => {
    expect(statusOf(Object.assign(new Error(), { status: 404 }))).toBe(404);
    expect(statusOf(Object.assign(new Error(), { statusCode: 429 }))).toBe(429);
    expect(statusOf(Object.assign(new Error(), { status: 200 }))).toBe(500);
    expect(statusOf('not even an error')).toBe(500);
    expect(codeOf(503)).toBe('INTERNAL_SERVER_ERROR');
  });
});
