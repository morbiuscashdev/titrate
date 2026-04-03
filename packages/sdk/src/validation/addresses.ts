// packages/sdk/src/validation/addresses.ts
import { getAddress } from 'viem';
import type { ValidationIssue } from './types.js';
import { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, CHECKSUM_MISMATCH, DUPLICATE_ADDRESS } from './types.js';

const HEX_CHARS = /^0x[0-9a-fA-F]{40}$/;

export function validateAddresses(addresses: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];

    if (!addr.startsWith('0x')) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: 'Missing 0x prefix', code: INVALID_PREFIX });
      continue;
    }
    if (addr.length !== 42) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: `Address must be 42 characters (got ${addr.length})`, code: INVALID_LENGTH });
      continue;
    }
    if (!HEX_CHARS.test(addr)) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: 'Contains non-hex characters', code: INVALID_HEX });
      continue;
    }

    if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) {
      try {
        const checksummed = getAddress(addr);
        if (checksummed !== addr) {
          issues.push({ severity: 'warning', row: i, field: 'address', value: addr, message: `Checksum mismatch (expected ${checksummed})`, code: CHECKSUM_MISMATCH });
        }
      } catch { /* already validated by hex check */ }
    }

    const lower = addr.toLowerCase();
    const firstSeen = seen.get(lower);
    if (firstSeen !== undefined) {
      issues.push({ severity: 'warning', row: i, field: 'address', value: addr, message: `Duplicate of row ${firstSeen}`, code: DUPLICATE_ADDRESS });
    } else {
      seen.set(lower, i);
    }
  }

  issues.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  return issues;
}
