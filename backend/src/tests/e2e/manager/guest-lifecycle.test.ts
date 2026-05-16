import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.mock('@/services/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://example.com/file'),
}));

import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

const pdfBuffer  = Buffer.from('%PDF-1.4 minimal');
const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9]);

let setup: ManagerSetup;
let guestId: number;
let licenseId: number;
let certId: number;

beforeAll(async () => {
  setup = await setupManager('guest-lifecycle');
});

afterAll(async () => {
  await teardown(setup.estateId);
});

describe('guest lifecycle: create → upload licence → upload cert → check both → view profile', () => {
  it('manager creates a guest and is redirected to the guest page', async () => {
    const res = await setup.agent.post('/manager/guests').send({
      firstName: 'Lifecycle',
      lastName:  'Guest',
      email:     'lifecycle-guest@e2e.test',
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/manager\/guests\/\d+$/);
    guestId = Number(res.headers.location.split('/').pop());
  });

  it('guest page is accessible and shows the guest name', async () => {
    const res = await setup.agent.get(`/manager/guests/${guestId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lifecycle');
  });

  it('manager uploads a hunting licence for the guest', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/hunting-license`)
      .field('expiryDate', '2030-12-31')
      .attach('files', pdfBuffer, { filename: 'license.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/hunting-license\?licenseId=\d+/);
    licenseId = Number(new URL('http://x' + res.headers.location).searchParams.get('licenseId'));
  });

  it('guest page shows the hunting licence', async () => {
    const res = await setup.agent.get(`/manager/guests/${guestId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('hunting-license');
  });

  it('manager uploads a training certificate for the guest', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate`)
      .field('issueDate', '2023-06-15')
      .attach('files', jpegBuffer, { filename: 'cert.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/training-certificate\?certId=\d+/);
    certId = Number(new URL('http://x' + res.headers.location).searchParams.get('certId'));
  });

  it('guest page shows the training certificate', async () => {
    const res = await setup.agent.get(`/manager/guests/${guestId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('training-certificate');
  });

  it('manager checks the hunting licence', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/hunting-license/check`)
      .send({ licenseId });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('manager checks the training certificate', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/training-certificate/check`)
      .send({ certId });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('guest profile is still accessible after both checks', async () => {
    const res = await setup.agent.get(`/manager/guests/${guestId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lifecycle');
  });
});
