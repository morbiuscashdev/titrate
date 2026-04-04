export type CacheKey = string;

export type CacheEntry<T> = {
  readonly key: CacheKey;
  readonly value: T;
  readonly createdAt: number;
  readonly ttl: number | null;
  readonly metadata?: Record<string, unknown>;
};

export type CacheStore = {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  put<T>(entry: CacheEntry<T>): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};

export type CacheConfig = {
  readonly memoryCache?: boolean;
  readonly persistentStore?: CacheStore;
};

export type Cache = {
  get<T>(key: CacheKey): Promise<T | null>;
  getOrCompute<T>(key: CacheKey, compute: () => Promise<T>, ttl?: number | null): Promise<T>;
  set<T>(key: CacheKey, value: T, ttl?: number | null): Promise<void>;
  invalidate(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};
