import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { hostname } from 'os';
import { instanceName, showInstance } from '@/utils/instance';

const app = () => {
  const a = express();
  a.use(showInstance);
  a.get('/', (_req, res) => res.send('ok'));
  return a;
};

describe('instance name (local scaling demo)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off unless SHOW_INSTANCE is exactly "true"', () => {
    expect(instanceName({})).toBeNull();
    expect(instanceName({ SHOW_INSTANCE: '1' })).toBeNull();
    expect(instanceName({ SHOW_INSTANCE: 'true' })).toBe(hostname());
  });

  it('adds no X-Instance header by default (production)', async () => {
    const res = await request(app()).get('/');
    expect(res.headers['x-instance']).toBeUndefined();
  });

  it('adds X-Instance with the hostname when SHOW_INSTANCE=true', async () => {
    vi.stubEnv('SHOW_INSTANCE', 'true');
    const res = await request(app()).get('/');
    expect(res.headers['x-instance']).toBe(hostname());
  });
});
