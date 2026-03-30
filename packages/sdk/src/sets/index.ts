import type { Address } from 'viem';

/** Normalizes an address to lowercase for comparison. */
function normalize(address: Address): string {
  return address.toLowerCase();
}

/**
 * Deduplicates an array of normalized strings while preserving the first occurrence.
 * Returns lowercase Address values.
 */
function dedup(items: string[]): Address[] {
  const seen = new Set<string>();
  const result: Address[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item as Address);
    }
  }
  return result;
}

/**
 * Computes the union of multiple address collections.
 * Case-insensitive — 0xABC and 0xabc are treated as the same address.
 * Returns deduplicated lowercase addresses.
 *
 * @param sets - One or more readonly address arrays to union together
 * @returns Deduplicated array of lowercase addresses present in any input set
 */
export function union(...sets: readonly (readonly Address[])[]): Address[] {
  const all = sets.flatMap((set) => set.map(normalize));
  return dedup(all);
}

/**
 * Computes the intersection of multiple address collections.
 * Case-insensitive — only addresses present in ALL input sets are returned.
 * Returns deduplicated lowercase addresses.
 *
 * @param sets - One or more readonly address arrays to intersect
 * @returns Deduplicated array of lowercase addresses present in every input set
 */
export function intersect(...sets: readonly (readonly Address[])[]): Address[] {
  if (sets.length === 0) return [];

  // Build a Set for each input for O(1) lookups
  const normalizedSets = sets.map((set) => new Set(set.map(normalize)));
  const [first, ...rest] = normalizedSets;

  const result: string[] = [];
  for (const address of first) {
    if (rest.every((s) => s.has(address))) {
      result.push(address);
    }
  }

  return dedup(result);
}

/**
 * Computes the difference of two address collections: addresses in A but not in B.
 * Case-insensitive.
 * Returns deduplicated lowercase addresses.
 *
 * @param a - The source address array
 * @param b - The address array to subtract from A
 * @returns Deduplicated array of lowercase addresses in A but not in B
 */
export function difference(a: readonly Address[], b: readonly Address[]): Address[] {
  const bSet = new Set(b.map(normalize));
  const result = a.map(normalize).filter((addr) => !bSet.has(addr));
  return dedup(result);
}

/**
 * Computes the symmetric difference of two address collections:
 * addresses in either A or B but not both.
 * Case-insensitive.
 * Returns deduplicated lowercase addresses.
 *
 * @param a - First address array
 * @param b - Second address array
 * @returns Deduplicated array of lowercase addresses in exactly one of A or B
 */
export function symmetricDifference(a: readonly Address[], b: readonly Address[]): Address[] {
  const aSet = new Set(a.map(normalize));
  const bSet = new Set(b.map(normalize));

  const inANotB = a.map(normalize).filter((addr) => !bSet.has(addr));
  const inBNotA = b.map(normalize).filter((addr) => !aSet.has(addr));

  return dedup([...inANotB, ...inBNotA]);
}
