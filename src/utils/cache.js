/**
 * ============================================================================
 * MODULE: High-Performance In-Memory TTL Cache (src/utils/cache.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   In-memory key-value cache with time-to-live (TTL) expiration. Provides sub-millisecond
 *   retrieval for frequently accessed read data (e.g. doctor rosters, department lists)
 *   to minimize SQLite query overhead.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Architectural Performance & Concurrency Invariants
 *
 * PACKAGES & DEPENDENCIES:
 *   - Pure ES Module utilizing native JavaScript Map
 *
 * KEY EXPORTS:
 *   - appCache                             : Default singleton instance with 60s TTL
 *   - MemoryCache                          : Cache class for custom TTL instances
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Used in src/server.js for caching doctor rosters and system health endpoints.
 * ============================================================================
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
