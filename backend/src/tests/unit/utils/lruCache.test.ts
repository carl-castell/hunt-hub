import { describe, it, expect } from 'vitest';
import { LruCache } from '@/utils/lruCache';

describe('LruCache', () => {
  it('returns stored values and counts hits and misses', () => {
    const cache = new LruCache<string>(10, 1000);
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 'x');
    expect(cache.get('a')).toBe('x');
    expect({ hits: cache.hits, misses: cache.misses }).toEqual({ hits: 1, misses: 1 });
  });

  it('forgets the least recently used entry when full', () => {
    const cache = new LruCache<string>(2, 1000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // a is now more recent than b
    cache.set('c', '3');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('c')).toBe('3');
  });

  it('keeps the total size under the limit', () => {
    const cache = new LruCache<string>(100, 10, (v) => v.length);
    cache.set('a', '123456');
    cache.set('b', '123456');
    expect(cache.count).toBe(1);
    expect(cache.totalSize).toBeLessThanOrEqual(10);
    expect(cache.get('b')).toBe('123456');
  });

  it('does not store a value larger than the whole cache', () => {
    const cache = new LruCache<string>(100, 5, (v) => v.length);
    cache.set('big', '1234567');
    expect(cache.count).toBe(0);
  });

  it('replacing a key updates its size', () => {
    const cache = new LruCache<string>(100, 100, (v) => v.length);
    cache.set('a', '12345');
    cache.set('a', '12');
    expect(cache.totalSize).toBe(2);
  });
});
