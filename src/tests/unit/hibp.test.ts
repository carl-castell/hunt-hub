import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPasswordPwned } from '@/services/hibp';
import { audit } from '@/services/audit';

vi.mock('@/services/audit', () => ({ audit: vi.fn() }));

// SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PWNED_PASSWORD = 'password';
const PWNED_SUFFIX   = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

function mockFetch(status: number, body: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isPasswordPwned', () => {
  it('returns true when the hash suffix is present in the HIBP response', async () => {
    mockFetch(200, `000000:1\r\n${PWNED_SUFFIX}:14\r\nFFFFFF:2`);
    expect(await isPasswordPwned(PWNED_PASSWORD)).toBe(true);
  });

  it('returns false when the hash suffix is absent from the HIBP response', async () => {
    mockFetch(200, '000000:1\r\nFFFFFF:2');
    expect(await isPasswordPwned(PWNED_PASSWORD)).toBe(false);
  });

  it('returns false and audits when HIBP returns a non-200 status', async () => {
    mockFetch(503, '');
    const result = await isPasswordPwned(PWNED_PASSWORD, { userId: 42, ip: '1.2.3.4' });
    expect(result).toBe(false);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hibp_service_error', userId: 42, ip: '1.2.3.4' }),
    );
  });

  it('returns false and audits when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const result = await isPasswordPwned(PWNED_PASSWORD, { userId: 7, ip: '9.9.9.9' });
    expect(result).toBe(false);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hibp_service_error', userId: 7, ip: '9.9.9.9' }),
    );
  });

  it('passes null userId to audit when no context is provided', async () => {
    mockFetch(500, '');
    await isPasswordPwned(PWNED_PASSWORD);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hibp_service_error', userId: null }),
    );
  });
});
