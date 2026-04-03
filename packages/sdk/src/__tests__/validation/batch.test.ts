// packages/sdk/src/__tests__/validation/batch.test.ts
import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { validateBatch } from '../../validation/batch.js';

describe('validateBatch', () => {
  it('returns no issues for valid batch', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address];
    expect(validateBatch(r, [1000n]).filter((i) => i.severity === 'error')).toHaveLength(0);
  });
  it('catches address errors', () => {
    expect(validateBatch(['0xGGGG' as Address], [1000n]).some((i) => i.severity === 'error')).toBe(true);
  });
  it('catches amount errors', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address];
    expect(validateBatch(r, [-500n]).some((i) => i.severity === 'error')).toBe(true);
  });
  it('catches length mismatch', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address, '0xabcdef1234567890abcdef1234567890abcdef12' as Address];
    expect(validateBatch(r, [1000n]).some((i) => i.code === 'LENGTH_MISMATCH')).toBe(true);
  });
});
