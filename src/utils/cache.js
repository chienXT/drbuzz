'use strict';

/**
 * Simple in-memory cache with TTL (Time To Live)
 * Useful for frequently accessed data like weekly top posts, categories, etc.
 */

class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Set cache with TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 3600 = 1 hour)
   */
  set(key, value, ttl = 3600) {
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if expired/not found
   */
  get(key) {
    const item = this.store.get(key);
    
    if (!item) return null;
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  /**
   * Check if key exists and not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete cache entry
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get cache size (for monitoring)
   */
  size() {
    return this.store.size;
  }

  /**
   * Cleanup expired entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    let deleted = 0;
    
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
        deleted++;
      }
    }
    
    return deleted;
  }
}

// Singleton instance
const cache = new Cache();

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const deleted = cache.cleanup();
  if (deleted > 0) {
    console.log(`[Cache] Cleaned up ${deleted} expired entries`);
  }
}, 10 * 60 * 1000);

module.exports = cache;
