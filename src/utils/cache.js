/**
 * In-Memory High-Performance TTL Cache
 * Provides sub-millisecond retrieval for frequently requested read data
 * (e.g. Doctor Rosters, Available Slots, Department Lists).
 */

class MemoryCache {
  constructor(defaultTtlSeconds = 60) {
    this.store = new Map();
    this.defaultTtl = defaultTtlSeconds * 1000;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlSeconds = null) {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl;
    this.store.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  del(key) {
    this.store.delete(key);
  }

  flush() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}

export const appCache = new MemoryCache(60);
export default appCache;
