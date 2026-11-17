/**
 * A small in-memory cache that forgets the least recently used entries once
 * it holds more than `maxEntries` or more than `maxSize` (measured by `sizeOf`).
 * Per app instance; keys should contain a version (e.g. updated_at), so an
 * entry can never be stale and instances need no shared invalidation.
 */
export class LruCache<V> {
  private entries = new Map<string, { value: V; size: number }>()
  private size = 0
  hits = 0
  misses = 0

  constructor(private readonly maxEntries: number, private readonly maxSize: number, private readonly sizeOf: (value: V) => number = () => 1) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    this.hits++
    // Map keeps insertion order: re-inserting marks the entry as most recently used.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: V): void {
    const size = this.sizeOf(value)
    if (size > this.maxSize) return
    const old = this.entries.get(key)
    if (old) {
      this.size -= old.size
      this.entries.delete(key)
    }
    this.entries.set(key, { value, size })
    this.size += size
    for (const [oldestKey, oldest] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.size <= this.maxSize) break
      this.entries.delete(oldestKey)
      this.size -= oldest.size
    }
  }

  get count() { return this.entries.size }
  get totalSize() { return this.size }
}
