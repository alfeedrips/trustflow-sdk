interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SimpleCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  constructor(private defaultTtlMs: number = 30_000) {}

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: K): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  size(): number {
    return this.store.size;
  }
}
