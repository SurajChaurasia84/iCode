export class CompletionCache {
  private cache = new Map<string, { completion: string; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  public get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.completion;
  }

  public set(key: string, completion: string): void {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { completion, timestamp: Date.now() });
  }

  public clear(): void {
    this.cache.clear();
  }

  public static generateKey(filePath: string, prefix: string, suffix: string): string {
    // We use the last 150 chars of prefix and first 60 chars of suffix
    const trimmedPrefix = prefix.slice(-150);
    const trimmedSuffix = suffix.slice(0, 60);
    return `${filePath}:::${trimmedPrefix}:::${trimmedSuffix}`;
  }
}
