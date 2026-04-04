import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockWalletReturn, mockSignTypedDataAsync, mockStorage, mockEncryptedStorage } = vi.hoisted(() => {
  const storeFns = () => ({
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  });

  const storage = {
    campaigns: storeFns(),
    addressSets: storeFns(),
    addresses: storeFns(),
    batches: storeFns(),
    wallets: storeFns(),
    pipelineConfigs: storeFns(),
    chainConfigs: storeFns(),
    appSettings: storeFns(),
  };

  return {
    mockWalletReturn: {
      isConnected: false,
      address: undefined as `0x${string}` | undefined,
      chainId: undefined as number | undefined,
      perryMode: null,
      deriveHotWallet: vi.fn(),
      clearPerryMode: vi.fn(),
    },
    mockSignTypedDataAsync: vi.fn(),
    mockStorage: storage,
    mockEncryptedStorage: { ...storage, _encrypted: true },
  };
});

vi.mock('wagmi', () => ({
  useSignTypedData: () => ({ signTypedDataAsync: mockSignTypedDataAsync }),
}));

vi.mock('./WalletProvider.js', () => ({
  useWallet: () => mockWalletReturn,
}));

vi.mock('@titrate/storage-idb', () => ({
  createIDBStorage: vi.fn().mockResolvedValue(mockStorage),
}));

vi.mock('../crypto/encrypt.js', () => ({
  deriveEncryptionKey: vi.fn().mockResolvedValue('mock-key'),
}));

vi.mock('../crypto/storage-wrapper.js', () => ({
  createEncryptedStorage: vi.fn().mockReturnValue(mockEncryptedStorage),
}));

import { StorageProvider, useStorage } from './StorageProvider.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockWalletReturn.isConnected = false;
  mockWalletReturn.address = undefined;
  mockWalletReturn.chainId = undefined;
  mockWalletReturn.perryMode = null;
  mockWalletReturn.deriveHotWallet = vi.fn();
  mockWalletReturn.clearPerryMode = vi.fn();
});

function wrapper({ children }: { children: ReactNode }) {
  return <StorageProvider>{children}</StorageProvider>;
}

describe('StorageProvider', () => {
  it('renders children', () => {
    render(
      <StorageProvider>
        <div data-testid="child">hello</div>
      </StorageProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('provides storage after IDB initialization', async () => {
    const { result } = renderHook(() => useStorage(), { wrapper });

    await waitFor(() => {
      expect(result.current.storage).not.toBeNull();
    });

    expect(result.current.isUnlocked).toBe(false);
  });

  it('auto-prompts for encryption signature when wallet connects', async () => {
    mockWalletReturn.isConnected = true;
    mockSignTypedDataAsync.mockResolvedValue('0xsignature');

    const { result } = renderHook(() => useStorage(), { wrapper });

    await waitFor(() => {
      expect(result.current.isUnlocked).toBe(true);
    });

    expect(mockSignTypedDataAsync).toHaveBeenCalledOnce();
  });

  it('logs warning and stays unencrypted when signature is rejected', async () => {
    mockWalletReturn.isConnected = true;
    mockSignTypedDataAsync.mockRejectedValue(new Error('User rejected'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useStorage(), { wrapper });

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[StorageProvider] Encryption signature rejected',
      );
    });

    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.storage).toBe(mockStorage);

    warnSpy.mockRestore();
  });
});

describe('useStorage', () => {
  it('throws when called outside StorageProvider', () => {
    expect(() => {
      renderHook(() => useStorage());
    }).toThrow('useStorage must be used within a StorageProvider');
  });
});
