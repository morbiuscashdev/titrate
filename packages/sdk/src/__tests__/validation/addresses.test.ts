// packages/sdk/src/__tests__/validation/addresses.test.ts
import { describe, it, expect } from 'vitest';
import { validateAddresses } from '../../validation/addresses.js';
import { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, DUPLICATE_ADDRESS } from '../../validation/types.js';

describe('validateAddresses', () => {
  it('returns no issues for valid lowercase addresses', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('detects non-hex characters', () => {
    const issues = validateAddresses(['0xGGGG567890abcdef1234567890abcdef12345678']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_HEX);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].row).toBe(0);
  });

  it('detects wrong length', () => {
    const issues = validateAddresses(['0x1234']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_LENGTH);
  });

  it('detects missing 0x prefix', () => {
    const issues = validateAddresses(['1234567890abcdef1234567890abcdef12345678ab']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_PREFIX);
  });

  it('detects duplicate addresses as warning', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1234567890abcdef1234567890abcdef12345678',
    ]);
    const dupes = issues.filter((i) => i.code === DUPLICATE_ADDRESS);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe('warning');
    expect(dupes[0].row).toBe(1);
  });

  it('detects duplicates case-insensitively', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1234567890ABCDEF1234567890ABCDEF12345678',
    ]);
    expect(issues.filter((i) => i.code === DUPLICATE_ADDRESS)).toHaveLength(1);
  });

  it('returns errors before warnings', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xGGGG',
      '0x1234567890abcdef1234567890abcdef12345678',
    ]);
    const errorIdx = issues.findIndex((i) => i.severity === 'error');
    const warnIdx = issues.findIndex((i) => i.severity === 'warning');
    if (errorIdx >= 0 && warnIdx >= 0) expect(errorIdx).toBeLessThan(warnIdx);
  });

  it('handles empty array', () => {
    expect(validateAddresses([])).toEqual([]);
  });
});
