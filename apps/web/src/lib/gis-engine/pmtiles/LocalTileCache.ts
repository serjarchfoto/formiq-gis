export class LocalTileCache<T> {
  private readonly entries = new Map<string, { value: T; accessedAt: number; expiresAt: number }>();

  constructor(private readonly maxEntries = 512, private readonly ttlMs = 60 * 60 * 1000) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);

    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    entry.accessedAt = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    this.pruneExpired();

    if (this.entries.size >= this.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    this.entries.set(key, {
      value,
      accessedAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    this.entries.forEach((entry, key) => {
      if (entry.expiresAt <= now) this.entries.delete(key);
    });
  }

  private evictLeastRecentlyUsed(): void {
    let lruKey: string | null = null;
    let lruAccessedAt = Number.POSITIVE_INFINITY;

    this.entries.forEach((entry, key) => {
      if (entry.accessedAt < lruAccessedAt) {
        lruAccessedAt = entry.accessedAt;
        lruKey = key;
      }
    });

    if (lruKey) this.entries.delete(lruKey);
  }
}
