import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletStep } from './WalletStep.js';

const mockSetActiveStep = vi.fn();
const mockDeriveHotWallet = vi.fn();
const mockClearPerryMode = vi.fn();

const mockDeriveHotWallets = vi.fn();

const mockAppSettingsGet = vi.fn().mockResolvedValue(null);
const mockAppSettingsPut = vi.fn().mockResolvedValue(undefined);
const mockAppSettingsDelete = vi.fn().mockResolvedValue(undefined);

const defaultWallet = {
  isConnected: false,
  address: undefined as string | undefined,
  chainId: undefined as number | undefined,
  perryMode: null as { isActive: true; wallets: { address: string; privateKey: string }[]; coldAddress: string; offset: number } | null,
  deriveHotWallet: mockDeriveHotWallet,
  deriveHotWallets: mockDeriveHotWallets,
  clearPerryMode: mockClearPerryMode,
  walletClients: [] as unknown[],
};

const defaultCampaign = {
  activeCampaign: null as Record<string, unknown> | null,
  campaigns: [],
  activeStepId: 'wallet' as const,
  stepStates: [],
  setActiveStep: mockSetActiveStep,
  setActiveCampaign: vi.fn(),
  createCampaign: vi.fn(),
  saveCampaign: vi.fn(),
  refreshCampaigns: vi.fn(),
};

const defaultChain = {
  publicClient: null,
  explorerBus: null,
  rpcBus: null,
  chainConfig: null as { name: string } | null,
};

let walletOverrides: Partial<typeof defaultWallet> = {};
let campaignOverrides: Partial<typeof defaultCampaign> = {};
let chainOverrides: Partial<typeof defaultChain> = {};

let mockColdWalletClient: Record<string, unknown> | null = null;

vi.mock('wagmi', () => ({
  useWalletClient: () => ({ data: mockColdWalletClient }),
}));

vi.mock('../providers/WalletProvider.js', () => ({
  useWallet: () => ({ ...defaultWallet, ...walletOverrides }),
}));

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({ ...defaultCampaign, ...campaignOverrides }),
}));

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({ ...defaultChain, ...chainOverrides }),
}));

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: {
      appSettings: {
        get: mockAppSettingsGet,
        put: mockAppSettingsPut,
        delete: mockAppSettingsDelete,
      },
    },
    isUnlocked: true,
    unlock: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  walletOverrides = {};
  campaignOverrides = {};
  chainOverrides = {};
  mockColdWalletClient = null;
});

describe('WalletStep', () => {
  it('shows connect prompt when wallet is not connected', () => {
    render(<WalletStep />);
    expect(screen.getByText(/connect your wallet using the button in the header/i)).toBeInTheDocument();
  });

  it('shows wallet badge when connected', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      chainId: 1,
    };
    chainOverrides = { chainConfig: { name: 'Ethereum' } as typeof defaultChain['chainConfig'] };

    render(<WalletStep />);
    expect(screen.getByText('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });

  it('shows derive button when connected without perry mode', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };

    render(<WalletStep />);
    expect(screen.getByRole('button', { name: /derive hot wallets/i })).toBeInTheDocument();
  });

  it('calls deriveHotWallet on derive button click', async () => {
    mockDeriveHotWallet.mockResolvedValue(undefined);
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { name: 'Test', version: 1, rpcUrl: 'http://rpc.test' } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /derive hot wallets/i }));

    await waitFor(() => {
      expect(mockDeriveHotWallet).toHaveBeenCalledWith('Test', 1, 'http://rpc.test');
    });
  });

  it('shows perry mode info when active', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [{ address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) }],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);
    expect(screen.getByText(/operating with a derived hot wallet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear perry mode/i })).toBeInTheDocument();
  });

  it('calls clearPerryMode when clear button is clicked', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [{ address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) }],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /clear perry mode/i }));
    expect(mockClearPerryMode).toHaveBeenCalled();
  });

  it('advances to requirements step on continue', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(mockSetActiveStep).toHaveBeenCalledWith('requirements');
  });

  it('shows error when derive fails', async () => {
    mockDeriveHotWallet.mockRejectedValue(new Error('User rejected'));
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /derive hot wallets/i }));

    await waitFor(() => {
      expect(screen.getByText('User rejected')).toBeInTheDocument();
    });
  });

  it('renders step panel with title', () => {
    render(<WalletStep />);
    expect(screen.getByText('Wallet')).toBeInTheDocument();
  });

  it('does not call deriveHotWallet when no active campaign', async () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = { activeCampaign: null };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /derive hot wallets/i }));

    // handleDerive early-returns because activeCampaign is null
    expect(mockDeriveHotWallet).not.toHaveBeenCalled();
  });

  it('disables derive button when no active campaign', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = { activeCampaign: null };

    render(<WalletStep />);
    expect(screen.getByRole('button', { name: /derive hot wallets/i })).toBeDisabled();
  });

  it('shows wallet count input when connected', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };

    render(<WalletStep />);
    const input = screen.getByLabelText('Wallet count');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(1);
  });

  it('shows offset input when connected', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };

    render(<WalletStep />);
    const input = screen.getByLabelText('Wallet offset');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(0);
  });

  it('calls deriveHotWallets when count > 1', async () => {
    mockDeriveHotWallets.mockResolvedValue(undefined);
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { name: 'Test', version: 1, rpcUrl: 'http://rpc.test' } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);

    const countInput = screen.getByLabelText('Wallet count');
    fireEvent.change(countInput, { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /derive hot wallets/i }));

    await waitFor(() => {
      expect(mockDeriveHotWallets).toHaveBeenCalledWith({
        campaignName: 'Test',
        version: 1,
        count: 3,
        offset: 0,
        rpcUrl: 'http://rpc.test',
      });
    });
  });

  it('shows per-wallet cards after derivation with multiple wallets', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x2222222222222222222222222222222222222222', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x3333333333333333333333333333333333333333', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);

    expect(screen.getByText('Wallet 0')).toBeInTheDocument();
    expect(screen.getByText('Wallet 1')).toBeInTheDocument();
    expect(screen.getByText('Wallet 2')).toBeInTheDocument();
    expect(screen.getByText('0x1111111111111111111111111111111111111111')).toBeInTheDocument();
    expect(screen.getByText('0x2222222222222222222222222222222222222222')).toBeInTheDocument();
    expect(screen.getByText('0x3333333333333333333333333333333333333333')).toBeInTheDocument();
  });

  it('shows per-wallet cards with correct offset', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x2222222222222222222222222222222222222222', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 5,
      },
    };

    render(<WalletStep />);

    expect(screen.getByText('Wallet 5')).toBeInTheDocument();
    expect(screen.getByText('Wallet 6')).toBeInTheDocument();
  });

  it('shows fund buttons for each wallet in multi-wallet mode', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x2222222222222222222222222222222222222222', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);

    const fundGasButtons = screen.getAllByRole('button', { name: /fund gas/i });
    const fundTokenButtons = screen.getAllByRole('button', { name: /fund tokens/i });

    expect(fundGasButtons).toHaveLength(2);
    expect(fundTokenButtons).toHaveLength(2);
  });

  it('shows fund buttons for single wallet in perry mode', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);

    expect(screen.getByRole('button', { name: /fund gas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fund tokens/i })).toBeInTheDocument();
  });

  it('disables fund buttons when cold wallet client is null', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };
    mockColdWalletClient = null;

    render(<WalletStep />);

    expect(screen.getByRole('button', { name: /fund gas/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /fund tokens/i })).toBeDisabled();
  });

  it('shows multi-wallet operating message with count', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [
          { address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x2222222222222222222222222222222222222222', privateKey: '0x' + '00'.repeat(32) },
          { address: '0x3333333333333333333333333333333333333333', privateKey: '0x' + '00'.repeat(32) },
        ],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };

    render(<WalletStep />);
    expect(screen.getByText(/operating with 3 derived hot wallets/i)).toBeInTheDocument();
  });

  it('loads stored highWaterMark on mount and sets offset', async () => {
    mockAppSettingsGet.mockResolvedValue(JSON.stringify({ highWaterMark: 4 }));
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { id: 'camp-1', name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);

    await waitFor(() => {
      expect(mockAppSettingsGet).toHaveBeenCalledWith('wallet-hwm-camp-1');
    });

    await waitFor(() => {
      const offsetInput = screen.getByLabelText('Wallet offset');
      expect(offsetInput).toHaveValue(5);
    });
  });

  it('saves highWaterMark after derivation', async () => {
    mockDeriveHotWallets.mockResolvedValue(undefined);
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { id: 'camp-2', name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);

    const countInput = screen.getByLabelText('Wallet count');
    fireEvent.change(countInput, { target: { value: '3' } });

    const offsetInput = screen.getByLabelText('Wallet offset');
    fireEvent.change(offsetInput, { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /derive hot wallets/i }));

    await waitFor(() => {
      expect(mockAppSettingsPut).toHaveBeenCalledWith(
        'wallet-hwm-camp-2',
        JSON.stringify({ highWaterMark: 4 }),
      );
    });
  });

  it('deletes stored highWaterMark on clear', async () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        wallets: [{ address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) }],
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        offset: 0,
      },
    };
    campaignOverrides = {
      activeCampaign: { id: 'camp-3', name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /clear perry mode/i }));

    await waitFor(() => {
      expect(mockClearPerryMode).toHaveBeenCalled();
      expect(mockAppSettingsDelete).toHaveBeenCalledWith('wallet-hwm-camp-3');
    });
  });

  it('shows next unused offset hint when highWaterMark is stored', async () => {
    mockAppSettingsGet.mockResolvedValue(JSON.stringify({ highWaterMark: 7 }));
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { id: 'camp-4', name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);

    await waitFor(() => {
      expect(screen.getByText(/last used: indices 0-7/i)).toBeInTheDocument();
      expect(screen.getByText(/next unused: 8/i)).toBeInTheDocument();
    });
  });

  it('ignores corrupt stored highWaterMark gracefully', async () => {
    mockAppSettingsGet.mockResolvedValue('not-valid-json{{{');
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { id: 'camp-5', name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);

    await waitFor(() => {
      expect(mockAppSettingsGet).toHaveBeenCalledWith('wallet-hwm-camp-5');
    });

    // Offset should remain at default (0) since the stored value was corrupt
    const offsetInput = screen.getByLabelText('Wallet offset');
    expect(offsetInput).toHaveValue(0);
  });
});
