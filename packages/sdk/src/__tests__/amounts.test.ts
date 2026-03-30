import { describe, it, expect } from 'vitest';
import { decimalToInteger, parseVariableAmounts } from '../utils/amounts.js';

describe('decimalToInteger', () => {
  it('converts whole number with 18 decimals', () => {
    expect(decimalToInteger('1', 18)).toBe(1_000_000_000_000_000_000n);
  });
  it('converts decimal with 18 decimals', () => {
    expect(decimalToInteger('1.5', 18)).toBe(1_500_000_000_000_000_000n);
  });
  it('truncates excess decimal places', () => {
    expect(decimalToInteger('1.123456789', 6)).toBe(1_123_456n);
  });
  it('pads short fractional parts', () => {
    expect(decimalToInteger('1.1', 6)).toBe(1_100_000n);
  });
  it('handles zero', () => {
    expect(decimalToInteger('0', 18)).toBe(0n);
  });
  it('handles no fractional part', () => {
    expect(decimalToInteger('100', 8)).toBe(10_000_000_000n);
  });
});

describe('parseVariableAmounts', () => {
  it('parses integer format', () => {
    const result = parseVariableAmounts(['1000', '2000', '3000'], 'integer', 18);
    expect(result).toEqual([1000n, 2000n, 3000n]);
  });
  it('parses decimal format', () => {
    const result = parseVariableAmounts(['1.5', '2.0'], 'decimal', 18);
    expect(result).toEqual([1_500_000_000_000_000_000n, 2_000_000_000_000_000_000n]);
  });
  it('treats null as zero', () => {
    const result = parseVariableAmounts([null, '100', null], 'integer', 18);
    expect(result).toEqual([0n, 100n, 0n]);
  });
  it('handles empty array', () => {
    expect(parseVariableAmounts([], 'integer', 18)).toEqual([]);
  });
});
