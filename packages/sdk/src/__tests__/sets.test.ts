import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { union, intersect, difference, symmetricDifference } from '../sets/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;
const C = '0x3333333333333333333333333333333333333333' as Address;
const D = '0x4444444444444444444444444444444444444444' as Address;

// Mixed case versions of A and B
const A_UPPER = '0x1111111111111111111111111111111111111111'.toUpperCase().replace('0X', '0x') as Address;
const B_UPPER = '0X2222222222222222222222222222222222222222' as Address;

// ---------------------------------------------------------------------------
// union
// ---------------------------------------------------------------------------

describe('union', () => {
  it('returns all unique addresses from two disjoint sets', () => {
    const result = union([A, B], [C, D]);
    expect(result).toHaveLength(4);
    expect(result).toContain(A);
    expect(result).toContain(B);
    expect(result).toContain(C);
    expect(result).toContain(D);
  });

  it('deduplicates when sets overlap', () => {
    const result = union([A, B], [B, C]);
    expect(result).toHaveLength(3);
  });

  it('empty ∪ A = A', () => {
    const result = union([], [A, B]);
    expect(result).toHaveLength(2);
    expect(result).toContain(A);
    expect(result).toContain(B);
  });

  it('A ∪ empty = A', () => {
    const result = union([A, B], []);
    expect(result).toHaveLength(2);
  });

  it('empty ∪ empty = empty', () => {
    const result = union([], []);
    expect(result).toHaveLength(0);
  });

  it('A ∪ A = A (identical sets)', () => {
    const result = union([A, B], [A, B]);
    expect(result).toHaveLength(2);
  });

  it('is case-insensitive — 0xABC and 0xabc are the same', () => {
    const result = union([A, B], [A_UPPER, B_UPPER]);
    expect(result).toHaveLength(2);
  });

  it('normalizes to lowercase', () => {
    const result = union([A_UPPER]);
    expect(result[0]).toBe(A.toLowerCase());
  });

  it('handles a single-element set', () => {
    const result = union([A]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(A);
  });

  it('handles three sets with partial overlap', () => {
    const result = union([A, B], [B, C], [C, D]);
    expect(result).toHaveLength(4);
  });

  it('handles large sets (1000+ addresses) in reasonable time', () => {
    const set1: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );
    const set2: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${(i + 500).toString(16).padStart(40, '0')}` as Address,
    );

    const start = Date.now();
    const result = union(set1, set2);
    const elapsed = Date.now() - start;

    // 500 overlap → 1500 unique
    expect(result).toHaveLength(1500);
    // Should complete well under 1 second
    expect(elapsed).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// intersect
// ---------------------------------------------------------------------------

describe('intersect', () => {
  it('returns addresses present in all input sets', () => {
    const result = intersect([A, B, C], [B, C, D], [C, D]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(C);
  });

  it('empty ∩ A = empty', () => {
    const result = intersect([], [A, B]);
    expect(result).toHaveLength(0);
  });

  it('A ∩ empty = empty', () => {
    const result = intersect([A, B], []);
    expect(result).toHaveLength(0);
  });

  it('A ∩ A = A (identical sets)', () => {
    const result = intersect([A, B], [A, B]);
    expect(result).toHaveLength(2);
    expect(result).toContain(A);
    expect(result).toContain(B);
  });

  it('disjoint sets return empty intersection', () => {
    const result = intersect([A, B], [C, D]);
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const result = intersect([A, B], [A_UPPER, C]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(A.toLowerCase());
  });

  it('handles single-element sets', () => {
    const result = intersect([A], [A]);
    expect(result).toHaveLength(1);
  });

  it('returns empty for no input sets', () => {
    const result = intersect();
    expect(result).toHaveLength(0);
  });

  it('deduplicates within a single input set before intersecting', () => {
    const result = intersect([A, A, B], [A, B]);
    expect(result).toHaveLength(2);
  });

  it('handles large sets (1000+ addresses) in reasonable time', () => {
    const set1: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );
    const set2: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${(i + 500).toString(16).padStart(40, '0')}` as Address,
    );

    const start = Date.now();
    const result = intersect(set1, set2);
    const elapsed = Date.now() - start;

    // Indices 500–999 are in both
    expect(result).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// difference
// ---------------------------------------------------------------------------

describe('difference', () => {
  it('returns addresses in A but not in B', () => {
    const result = difference([A, B, C], [B, C]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(A);
  });

  it('A \\ empty = A', () => {
    const result = difference([A, B], []);
    expect(result).toHaveLength(2);
    expect(result).toContain(A);
    expect(result).toContain(B);
  });

  it('empty \\ A = empty', () => {
    const result = difference([], [A, B]);
    expect(result).toHaveLength(0);
  });

  it('A \\ A = empty (identical sets)', () => {
    const result = difference([A, B], [A, B]);
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    // A_UPPER is the same address as A — should be removed
    const result = difference([A, B], [A_UPPER]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(B);
  });

  it('handles single-element sets', () => {
    const result = difference([A], [B]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(A);
  });

  it('deduplicates the result', () => {
    const result = difference([A, A, B], [C]);
    expect(result).toHaveLength(2);
  });

  it('handles large sets (1000+ addresses) in reasonable time', () => {
    const set1: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );
    const set2: Address[] = Array.from(
      { length: 500 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );

    const start = Date.now();
    const result = difference(set1, set2);
    const elapsed = Date.now() - start;

    expect(result).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// symmetricDifference
// ---------------------------------------------------------------------------

describe('symmetricDifference', () => {
  it('returns addresses in either set but not both', () => {
    const result = symmetricDifference([A, B], [B, C]);
    expect(result).toHaveLength(2);
    expect(result).toContain(A);
    expect(result).toContain(C);
    expect(result).not.toContain(B);
  });

  it('empty △ A = A', () => {
    const result = symmetricDifference([], [A, B]);
    expect(result).toHaveLength(2);
  });

  it('A △ empty = A', () => {
    const result = symmetricDifference([A, B], []);
    expect(result).toHaveLength(2);
  });

  it('A △ A = empty (identical sets)', () => {
    const result = symmetricDifference([A, B], [A, B]);
    expect(result).toHaveLength(0);
  });

  it('disjoint sets return all addresses', () => {
    const result = symmetricDifference([A, B], [C, D]);
    expect(result).toHaveLength(4);
  });

  it('is case-insensitive', () => {
    const result = symmetricDifference([A, B], [A_UPPER, C]);
    // A is in both (as A and A_UPPER) → excluded; B and C remain
    expect(result).toHaveLength(2);
    expect(result).toContain(B);
    expect(result).toContain(C);
  });

  it('handles single-element sets', () => {
    const result = symmetricDifference([A], [B]);
    expect(result).toHaveLength(2);
  });

  it('normalizes to lowercase', () => {
    const result = symmetricDifference([A_UPPER], [B_UPPER]);
    expect(result.every((addr) => addr === addr.toLowerCase())).toBe(true);
  });

  it('handles large sets (1000+ addresses) in reasonable time', () => {
    const set1: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );
    const set2: Address[] = Array.from(
      { length: 1000 },
      (_, i) => `0x${(i + 500).toString(16).padStart(40, '0')}` as Address,
    );

    const start = Date.now();
    const result = symmetricDifference(set1, set2);
    const elapsed = Date.now() - start;

    // 0–499 only in set1, 1000–1499 only in set2 → 1000 total
    expect(result).toHaveLength(1000);
    expect(elapsed).toBeLessThan(1000);
  });
});
