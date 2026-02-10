/**
 * TTLMap - A Map with Time-To-Live (TTL) for automatic entry expiration
 * 
 * Entries are automatically removed after the specified TTL.
 * Background cleanup runs every 60 seconds to sweep expired entries.
 */
export class TTLMap<K, V> {
  private map: Map<K, { value: V; expiresAt: number }> = new Map();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout;

  /**
   * @param ttlMs Time-to-live in milliseconds (default: 10 minutes)
   */
  constructor(ttlMs: number = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
    
    // Background cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Get a value if it exists and hasn't expired
   * @returns value or undefined if expired/not found
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value with a fresh TTL
   */
  set(key: K, value: V): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.map.set(key, { value, expiresAt });
  }

  /**
   * Check if a key exists and hasn't expired
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key
   */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Get the number of entries (including expired ones before cleanup)
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Remove all expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      // Optional: log cleanup activity
      // console.log(`TTLMap cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Stop the background cleanup interval
   * Call this when shutting down to prevent memory leaks
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
