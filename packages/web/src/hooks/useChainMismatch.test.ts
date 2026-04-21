import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockAccountReturn: {
  chainId: number | undefined;
} = { chainId: undefined };

const mockSwitchChainAsync = vi.fn();
let mockSwitchChainReturn = {
  switchChainAsync: mockSwitchChainAsync,
  isPending: false,
  error: null as Error | null,
};

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountReturn,
  useSwitchChain: () => mockSwitchChainReturn,
}));

import { useChainMismatch } from './useChainMismatch.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountReturn = { chainId: undefined };
  mockSwitchChainReturn = {
    switchChainAsync: mockSwitchChainAsync,
    isPending: false,
    error: null,
  };
});

describe('useChainMismatch', () => {
  it('returns mismatched=false when the wallet is disconnected', () => {
    mockAccountReturn = { chainId: undefined };
    const { result } = renderHook(() => useChainMismatch(1));
    expect(result.current.mismatched).toBe(false);
    expect(result.current.walletChainId).toBeUndefined();
    expect(result.current.campaignChainId).toBe(1);
  });

  it('returns mismatched=false when the campaign chain is zero or undefined', () => {
    mockAccountReturn = { chainId: 1 };

    const a = renderHook(() => useChainMismatch(undefined));
    expect(a.result.current.mismatched).toBe(false);

    const b = renderHook(() => useChainMismatch(0));
    expect(b.result.current.mismatched).toBe(false);
  });

  it('returns mismatched=false when the IDs match', () => {
    mockAccountReturn = { chainId: 8453 };
    const { result } = renderHook(() => useChainMismatch(8453));
    expect(result.current.mismatched).toBe(false);
  });

  it('returns mismatched=true when the IDs differ', () => {
    mockAccountReturn = { chainId: 1 };
    const { result } = renderHook(() => useChainMismatch(8453));
    expect(result.current.mismatched).toBe(true);
    expect(result.current.walletChainId).toBe(1);
    expect(result.current.campaignChainId).toBe(8453);
  });

  it('reflects the switchChain pending state', () => {
    mockAccountReturn = { chainId: 1 };
    mockSwitchChainReturn = {
      switchChainAsync: mockSwitchChainAsync,
      isPending: true,
      error: null,
    };

    const { result } = renderHook(() => useChainMismatch(8453));
    expect(result.current.switching).toBe(true);
  });

  it('surfaces the switchChain error from wagmi', () => {
    mockAccountReturn = { chainId: 1 };
    const err = new Error('user rejected');
    mockSwitchChainReturn = {
      switchChainAsync: mockSwitchChainAsync,
      isPending: false,
      error: err,
    };

    const { result } = renderHook(() => useChainMismatch(8453));
    expect(result.current.switchError).toBe(err);
  });

  it('forwards switchChain() to wagmi with the campaign chainId', async () => {
    mockAccountReturn = { chainId: 1 };
    mockSwitchChainAsync.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChainMismatch(8453));
    await act(async () => {
      await result.current.switchChain();
    });

    expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 8453 });
  });

  it('switchChain() is a no-op when campaignChainId is missing', async () => {
    mockAccountReturn = { chainId: 1 };
    const { result } = renderHook(() => useChainMismatch(undefined));

    await act(async () => {
      await result.current.switchChain();
    });

    expect(mockSwitchChainAsync).not.toHaveBeenCalled();
  });
});
