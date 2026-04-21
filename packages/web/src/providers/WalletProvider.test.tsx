import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Mutable mock return values for useAccount, allowing per-test customization.
 */
let mockAccountReturn = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: undefined as number | undefined,
};

const mockSignTypedDataAsync = vi.fn();

vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: ReactNode }) => children,
  useAccount: () => mockAccountReturn,
  useSignTypedData: () => ({ signTypedDataAsync: mockSignTypedDataAsync }),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@reown/appkit/react', () => ({
  createAppKit: vi.fn(),
}));

vi.mock('@reown/appkit-adapter-wagmi', () => {
  function MockWagmiAdapter() {
    return { wagmiConfig: {} };
  }
  return { WagmiAdapter: MockWagmiAdapter };
});

vi.mock('@reown/appkit/networks', () => ({
  mainnet: { id: 1 },
  base: { id: 8453 },
  arbitrum: { id: 42161 },
}));

vi.mock('@titrate/sdk', () => ({
  createEIP712Message: vi.fn(() => ({
    domain: { name: 'Titrate' },
    types: {},
    primaryType: 'Derive',
    message: {},
  })),
  deriveMultipleWallets: vi.fn(() => ([
    {
      address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`,
      privateKey: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
    },
  ])),
  zeroPrivateKey: vi.fn((wallet: { address: string; privateKey: string }) => ({
    address: wallet.address,
    privateKey: '0x' + '00'.repeat(32),
  })),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('viem');
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({ type: 'mock-wallet-client' })),
    http: vi.fn(() => 'mock-transport'),
  };
});

const mockSignTypedDataLocal = vi.fn();

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn((pk: string) => ({
    address: pk === '0x' + 'cd'.repeat(32)
      ? '0xcafecafecafecafecafecafecafecafecafecafe'
      : '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    signTypedData: mockSignTypedDataLocal,
  })),
}));

import { WalletProvider, useWallet } from './WalletProvider.js';
import { createEIP712Message, deriveMultipleWallets, zeroPrivateKey } from '@titrate/sdk';

const mockedDeriveMultipleWallets = vi.mocked(deriveMultipleWallets);
const mockedCreateEIP712Message = vi.mocked(createEIP712Message);
const mockedZeroPrivateKey = vi.mocked(zeroPrivateKey);

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountReturn = {
    address: undefined,
    isConnected: false,
    chainId: undefined,
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

describe('WalletProvider', () => {
  it('renders children', () => {
    render(
      <WalletProvider>
        <div data-testid="child">hello</div>
      </WalletProvider>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });
});

describe('useWallet', () => {
  it('throws when called outside WalletProvider', () => {
    expect(() => {
      renderHook(() => useWallet());
    }).toThrow('useWallet must be used within a WalletProvider');
  });

  it('provides isConnected false by default', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.isConnected).toBe(false);
  });

  it('provides undefined address when disconnected', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.address).toBeUndefined();
  });

  it('provides undefined chainId when disconnected', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.chainId).toBeUndefined();
  });

  it('provides address when connected', () => {
    mockAccountReturn = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 1,
    };

    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.current.chainId).toBe(1);
  });

  it('has null perryMode by default', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.perryMode).toBeNull();
  });

  it('deriveHotWallet throws when wallet is not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await expect(
      act(() => result.current.deriveHotWallet('TestCampaign', 1, 'http://rpc.test')),
    ).rejects.toThrow('Wallet not connected');
  });

  it('deriveHotWallet sets perryMode when wallet is connected', async () => {
    mockAccountReturn = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 1,
    };

    mockSignTypedDataAsync.mockResolvedValue('0xabcdef1234');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(() => result.current.deriveHotWallet('TestCampaign', 1, 'http://rpc.test'));

    expect(mockedCreateEIP712Message).toHaveBeenCalledWith({
      funder: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'TestCampaign',
      version: 1,
    });

    expect(mockSignTypedDataAsync).toHaveBeenCalledOnce();

    expect(mockedDeriveMultipleWallets).toHaveBeenCalledWith({
      signature: '0xabcdef1234',
      count: 1,
      offset: 0,
    });

    expect(result.current.perryMode).toEqual({
      isActive: true,
      coldAddress: '0x1234567890abcdef1234567890abcdef12345678',
      wallets: [{
        address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        privateKey: '0x' + 'ab'.repeat(32),
      }],
      offset: 0,
    });
  });

  it('deriveHotWalletsFromPrivateKey signs locally and sets perryMode without wagmi', async () => {
    mockSignTypedDataLocal.mockResolvedValue('0xaacceeff11223344');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(() =>
      result.current.deriveHotWalletsFromPrivateKey({
        privateKey: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
        campaignName: 'Pasted',
        version: 3,
        count: 2,
        offset: 5,
        rpcUrl: 'http://rpc.test',
      }),
    );

    expect(mockedCreateEIP712Message).toHaveBeenCalledWith({
      funder: '0xcafecafecafecafecafecafecafecafecafecafe',
      name: 'Pasted',
      version: 3,
    });
    expect(mockSignTypedDataLocal).toHaveBeenCalledOnce();
    // wagmi's signTypedDataAsync must NOT have been touched for this path.
    expect(mockSignTypedDataAsync).not.toHaveBeenCalled();

    expect(mockedDeriveMultipleWallets).toHaveBeenCalledWith({
      signature: '0xaacceeff11223344',
      count: 2,
      offset: 5,
    });

    expect(result.current.perryMode).toMatchObject({
      isActive: true,
      coldAddress: '0xcafecafecafecafecafecafecafecafecafecafe',
      offset: 5,
    });
  });

  it('deriveHotWalletsFromPrivateKey defaults offset to 0 when omitted', async () => {
    mockSignTypedDataLocal.mockResolvedValue('0xaabb');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(() =>
      result.current.deriveHotWalletsFromPrivateKey({
        privateKey: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
        campaignName: 'NoOffset',
        version: 1,
        count: 1,
        rpcUrl: 'http://rpc.test',
      }),
    );

    expect(mockedDeriveMultipleWallets).toHaveBeenCalledWith({
      signature: '0xaabb',
      count: 1,
      offset: 0,
    });
  });

  it('clearPerryMode resets perry state to null', async () => {
    mockAccountReturn = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 1,
    };

    mockSignTypedDataAsync.mockResolvedValue('0xabcdef1234');

    const { result } = renderHook(() => useWallet(), { wrapper });

    // First derive a hot wallet
    await act(() => result.current.deriveHotWallet('TestCampaign', 1, 'http://rpc.test'));
    expect(result.current.perryMode).not.toBeNull();

    // Then clear it
    act(() => result.current.clearPerryMode());
    expect(result.current.perryMode).toBeNull();
  });
});
