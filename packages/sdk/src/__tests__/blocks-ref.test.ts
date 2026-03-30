import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';

// Mock the scanner module before importing resolveBlockRef
vi.mock('../scanner/index.js', () => ({
  resolveBlockByTimestamp: vi.fn().mockResolvedValue(19_000_000n),
}));

import { resolveBlockRef } from '../utils/blocks.js';

describe('resolveBlockRef', () => {
  const client = {} as PublicClient;

  it('parses a raw block number string', async () => {
    const result = await resolveBlockRef('19000000', client);
    expect(result).toBe(19_000_000n);
  });

  it('resolves an ISO date via resolveBlockByTimestamp', async () => {
    const result = await resolveBlockRef('2025-01-15', client);
    expect(result).toBe(19_000_000n);
  });

  it('trims whitespace', async () => {
    const result = await resolveBlockRef('  19000000  ', client);
    expect(result).toBe(19_000_000n);
  });
});
