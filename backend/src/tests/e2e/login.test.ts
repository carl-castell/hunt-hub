import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '@/app';

describe('GET /login — page rendering', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
  });

  it('renders email and password fields', async () => {
    const res = await request(app).get('/login');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="password"');
  });

  it('includes a CSRF token field', async () => {
    const res = await request(app).get('/login');
    expect(res.text).toContain('name="_csrf"');
  });

  it('shows no error message by default', async () => {
    const res = await request(app).get('/login');
    expect(res.text).not.toContain('alert-error');
  });
});

describe('POST /login — error messages in HTML', () => {
  it('shows "Invalid email or password" for bad credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword!' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password');
  });

  it('returns 200 for empty fields', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: '', password: '' });
    expect(res.status).toBe(200);
  });
});
