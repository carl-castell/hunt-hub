import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({ mockLogger: { error: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: mockLogger }));

import { logError } from '@/utils/logError';

beforeEach(() => vi.clearAllMocks());

describe('logError()', () => {
  it('logs an Error as a structured err field with the context as message', () => {
    const err = new Error('something went wrong');

    logError('[prefix]', err);

    expect(mockLogger.error).toHaveBeenCalledWith({ err }, '[prefix]');
  });

  it('also accepts non-Error values', () => {
    logError('[prefix]', 'just a string');

    expect(mockLogger.error).toHaveBeenCalledWith({ err: 'just a string' }, '[prefix]');
  });

  it('does not throw regardless of input', () => {
    expect(() => logError('[prefix]', null)).not.toThrow();
    expect(() => logError('[prefix]', undefined)).not.toThrow();
    expect(() => logError('[prefix]', { arbitrary: true })).not.toThrow();
  });
});
