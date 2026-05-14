import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logError } from '@/utils/logError';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('logError()', () => {
  it('logs the error message and stack when given an Error instance', () => {
    const err = new Error('something went wrong');

    logError('[prefix]', err);

    expect(console.error).toHaveBeenCalledWith('[prefix]', err.message, err.stack ?? '');
  });

  it('logs String() when given a plain string', () => {
    logError('[prefix]', 'just a string');

    expect(console.error).toHaveBeenCalledWith('[prefix]', 'just a string', '');
  });

  it('logs String() when given a number', () => {
    logError('[prefix]', 404);

    expect(console.error).toHaveBeenCalledWith('[prefix]', '404', '');
  });

  it('does not throw regardless of input', () => {
    expect(() => logError('[prefix]', null)).not.toThrow();
    expect(() => logError('[prefix]', undefined)).not.toThrow();
    expect(() => logError('[prefix]', { arbitrary: true })).not.toThrow();
  });
});
