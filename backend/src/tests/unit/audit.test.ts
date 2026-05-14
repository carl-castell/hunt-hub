import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures the mocks exist before vi.mock factory is called
const { mockValues, mockInsert } = vi.hoisted(() => {
  const mockValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return { mockValues, mockInsert };
});

vi.mock('@/db', () => ({
  db: { insert: mockInsert },
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

import { audit } from '@/services/audit';
import { logError } from '@/utils/logError';

beforeEach(() => {
  vi.clearAllMocks();
  mockValues.mockResolvedValue(undefined);
});

describe('audit()', () => {
  it('inserts a record with all provided fields', async () => {
    await audit({ userId: 42, event: 'login', ip: '127.0.0.1', metadata: { foo: 'bar' } });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith({
      userId: 42,
      event: 'login',
      ip: '127.0.0.1',
      metadata: { foo: 'bar' },
    });
  });

  it('passes null when userId is not provided', async () => {
    await audit({ event: 'hibp_service_error' });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it('passes null when userId is explicitly null', async () => {
    await audit({ userId: null, event: 'failed_login', ip: '10.0.0.1' });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it('passes null for metadata when not provided', async () => {
    await audit({ userId: 1, event: 'logout' });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: null }),
    );
  });

  it('does not throw when the DB insert rejects', async () => {
    mockValues.mockRejectedValueOnce(new Error('connection refused'));

    await expect(audit({ userId: 1, event: 'login' })).resolves.toBeUndefined();
  });

  it('calls logError when the DB insert rejects', async () => {
    const dbError = new Error('connection refused');
    mockValues.mockRejectedValueOnce(dbError);

    await audit({ userId: 1, event: 'login' });

    expect(logError).toHaveBeenCalledWith('[audit error]', dbError);
  });
});
