import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLiveFilter, composeLiveFilters } from './useLiveFilter.js';
import type { Address } from 'viem';
import type { LiveFilter } from '@titrate/sdk';

// ---- Mocks ----

const mockCheckRecipients = vi.fn();

vi.mock('@titrate/sdk', () => ({
  checkRecipients: (...args: unknown[]) => mockCheckRecipients(...args),
}));

let chainOverrides: Record<string, unknown> = {};

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({
    publicClient: { readContract: vi.fn() },
    explorerBus: null,
    rpcBus: null,
    chainConfig: null,
    ...chainOverrides,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  chainOverrides = {};
});

// ---- composeLiveFilters ----

describe('composeLiveFilters', () => {
  it('returns undefined when no filters are provided', () => {
    expect(composeLiveFilters()).toBeUndefined();
  });

  it('returns undefined when all filters are undefined', () => {
    expect(composeLiveFilters(undefined, undefined)).toBeUndefined();
  });

  it('returns the single filter when only one is provided', () => {
    const filter: LiveFilter = async (addrs) => addrs;
    const result = composeLiveFilters(filter);
    expect(result).toBe(filter);
  });

  it('returns the single non-undefined filter when mixed with undefined', () => {
    const filter: LiveFilter = async (addrs) => addrs;
    const result = composeLiveFilters(undefined, filter, undefined);
    expect(result).toBe(filter);
  });

  it('composes two filters in sequence', async () => {
    const filter1: LiveFilter = async (addrs) =>
      addrs.filter((a) => a !== '0xAAA' as Address);
    const filter2: LiveFilter = async (addrs) =>
      addrs.filter((a) => a !== '0xBBB' as Address);

    const composed = composeLiveFilters(filter1, filter2);
    expect(composed).toBeDefined();

    const input: Address[] = ['0xAAA' as Address, '0xBBB' as Address, '0xCCC' as Address];
    const result = await composed!(input);
    expect(result).toEqual(['0xCCC']);
  });

  it('applies filters in order — first filter runs first', async () => {
    const order: string[] = [];
    const filter1: LiveFilter = async (addrs) => {
      order.push('first');
      return addrs;
    };
    const filter2: LiveFilter = async (addrs) => {
      order.push('second');
      return addrs;
    };

    const composed = composeLiveFilters(filter1, filter2);
    await composed!(['0x123' as Address]);
    expect(order).toEqual(['first', 'second']);
  });

  it('handles empty address arrays', async () => {
    const filter: LiveFilter = async (addrs) => addrs;
    const composed = composeLiveFilters(filter);
    const result = await composed!([]);
    expect(result).toEqual([]);
  });
});

// ---- useLiveFilter ----

describe('useLiveFilter', () => {
  it('returns undefined for simple variant', () => {
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'simple',
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when contractAddress is null', () => {
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: null,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'full',
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when campaignId is null', () => {
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: null,
        variant: 'full',
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when publicClient is null', () => {
    chainOverrides = { publicClient: null };
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'full',
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns a filter function for full variant with all params', () => {
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'full',
      }),
    );
    expect(result.current).toBeInstanceOf(Function);
  });

  it('filters out addresses that have already been sent to', async () => {
    // checkRecipients returns [true, false, true] — first and third already sent
    mockCheckRecipients.mockResolvedValue([true, false, true]);

    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'full',
      }),
    );

    const addresses: Address[] = [
      '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
      '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
      '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
    ];

    const filtered = await result.current!(addresses);
    expect(filtered).toEqual([
      '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    ]);
  });

  it('returns empty array for empty input', async () => {
    const { result } = renderHook(() =>
      useLiveFilter({
        contractAddress: '0x1234567890123456789012345678901234567890' as Address,
        campaignId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        variant: 'full',
      }),
    );

    const filtered = await result.current!([]);
    expect(filtered).toEqual([]);
    // Should not call checkRecipients with empty array
    expect(mockCheckRecipients).not.toHaveBeenCalled();
  });

  it('passes correct params to checkRecipients', async () => {
    mockCheckRecipients.mockResolvedValue([false]);

    const contractAddress = '0x1234567890123456789012345678901234567890' as Address;
    const campaignId = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const { result } = renderHook(() =>
      useLiveFilter({ contractAddress, campaignId, variant: 'full' }),
    );

    const addresses = ['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address];
    await result.current!(addresses);

    expect(mockCheckRecipients).toHaveBeenCalledWith({
      contractAddress,
      distributor: contractAddress,
      campaignId,
      recipients: addresses,
      publicClient: expect.any(Object),
    });
  });
});
