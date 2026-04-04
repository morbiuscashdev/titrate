import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletStep } from './WalletStep.js';

const mockSetActiveStep = vi.fn();
const mockDeriveHotWallet = vi.fn();
const mockClearPerryMode = vi.fn();

const defaultWallet = {
  isConnected: false,
  address: undefined as string | undefined,
  chainId: undefined as number | undefined,
  perryMode: null as { isActive: true; hotAddress: string; coldAddress: string } | null,
  deriveHotWallet: mockDeriveHotWallet,
  clearPerryMode: mockClearPerryMode,
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

vi.mock('../providers/WalletProvider.js', () => ({
  useWallet: () => ({ ...defaultWallet, ...walletOverrides }),
}));

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({ ...defaultCampaign, ...campaignOverrides }),
}));

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({ ...defaultChain, ...chainOverrides }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  walletOverrides = {};
  campaignOverrides = {};
  chainOverrides = {};
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
    expect(screen.getByRole('button', { name: /derive hot wallet/i })).toBeInTheDocument();
  });

  it('calls deriveHotWallet on derive button click', async () => {
    mockDeriveHotWallet.mockResolvedValue(undefined);
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    };
    campaignOverrides = {
      activeCampaign: { name: 'Test', version: 1 } as typeof defaultCampaign['activeCampaign'],
    };

    render(<WalletStep />);
    fireEvent.click(screen.getByRole('button', { name: /derive hot wallet/i }));

    await waitFor(() => {
      expect(mockDeriveHotWallet).toHaveBeenCalledWith('Test', 1);
    });
  });

  it('shows perry mode info when active', () => {
    walletOverrides = {
      isConnected: true,
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      perryMode: {
        isActive: true,
        hotAddress: '0x1111111111111111111111111111111111111111',
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
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
        hotAddress: '0x1111111111111111111111111111111111111111',
        coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
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
    fireEvent.click(screen.getByRole('button', { name: /derive hot wallet/i }));

    await waitFor(() => {
      expect(screen.getByText('User rejected')).toBeInTheDocument();
    });
  });

  it('renders step panel with title', () => {
    render(<WalletStep />);
    expect(screen.getByText('Wallet')).toBeInTheDocument();
  });
});
