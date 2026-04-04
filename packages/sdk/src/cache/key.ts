import { createHash } from 'node:crypto';
import type { CacheKey } from './types.js';

/**
 * Replacer for JSON.stringify that handles BigInt values.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `__bigint__${value.toString()}`;
  return value;
}

/**
 * Recursively sorts object keys for deterministic serialization.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return `__bigint__${obj.toString()}`;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Computes a deterministic SHA-256 cache key from request parameters.
 * Keys are sorted alphabetically for order-independence.
 * BigInt values are serialized as strings.
 */
export async function computeCacheKey(params: Record<string, unknown>): Promise<CacheKey> {
  const sorted = sortKeys(params);
  const json = JSON.stringify(sorted, bigintReplacer);
  const hash = createHash('sha256').update(json).digest('hex');
  return hash;
}
