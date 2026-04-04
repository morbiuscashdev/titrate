import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignStep, clampBatchSize } from './CampaignStep.js';

const mockSaveCampaign = vi.fn().mockResolvedValue(undefined);
const mockCreateCampaign = vi.fn().mockResolvedValue('new-id');
const mockSetActiveStep = vi.fn();

let activeCampaignOverride: Record<string, unknown> | null = null;

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: activeCampaignOverride,
    campaigns: [],
    activeStepId: 'campaign',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    createCampaign: mockCreateCampaign,
    saveCampaign: mockSaveCampaign,
    refreshCampaigns: vi.fn(),
  }),
}));

let tokenMetadataMock: { data: unknown; isLoading: boolean; error: unknown } = {
  data: undefined,
  isLoading: false,
  error: null,
};

vi.mock('../hooks/useTokenMetadata.js', () => ({
  useTokenMetadata: () => tokenMetadataMock,
}));

vi.mock('@titrate/sdk', () => ({
  SUPPORTED_CHAINS: [
    { chainId: 1, name: 'Ethereum', rpcUrls: ['https://eth.llamarpc.com'] },
    { chainId: 369, name: 'PulseChain', rpcUrls: ['https://rpc.pulsechain.com'] },
  ],
  getChainConfig: (chainId: number) => {
    const chains: Record<number, { chainId: number; rpcUrls: string[] }> = {
      1: { chainId: 1, rpcUrls: ['https://eth.llamarpc.com'] },
      369: { chainId: 369, rpcUrls: ['https://rpc.pulsechain.com'] },
    };
    return chains[chainId] ?? null;
  },
}));

describe('CampaignStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCampaignOverride = null;
    tokenMetadataMock = { data: undefined, isLoading: false, error: null };
  });

  it('renders step panel with title', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Campaign Setup')).toBeInTheDocument();
  });

  it('renders chain selector with supported chains', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('PulseChain')).toBeInTheDocument();
  });

  it('renders form fields', () => {
    render(<CampaignStep />);
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Airdrop Campaign')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('auto-fills RPC URL when chain is selected', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    const rpcInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    expect(rpcInput.value).toBe('https://eth.llamarpc.com');
  });

  it('toggles contract variant', () => {
    render(<CampaignStep />);
    const fullButton = screen.getByText('Full');
    fireEvent.click(fullButton);
    expect(fullButton.className).toContain('ring-blue');
  });

  it('disables save button when form is incomplete', () => {
    render(<CampaignStep />);
    const saveButton = screen.getByText('Save & Continue');
    expect(saveButton).toBeDisabled();
  });

  it('enables save button when chain and name are set', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Test Campaign' },
    });
    const saveButton = screen.getByText('Save & Continue');
    expect(saveButton).not.toBeDisabled();
  });

  it('calls createCampaign on save when no active campaign', async () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Test Campaign' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    });

    const config = mockCreateCampaign.mock.calls[0][0];
    expect(config.chainId).toBe(1);
    expect(config.name).toBe('Test Campaign');
    expect(config.contractVariant).toBe('simple');
    expect(config.batchSize).toBe(100);
  });

  it('renders batch size input with default value', () => {
    render(<CampaignStep />);
    const batchInput = screen.getByDisplayValue('100') as HTMLInputElement;
    expect(batchInput).toBeInTheDocument();
  });

  it('shows "Probing token..." when token address is valid and loading', () => {
    tokenMetadataMock = { data: undefined, isLoading: true, error: null };
    render(<CampaignStep />);
    fireEvent.change(screen.getByPlaceholderText('0x...'), {
      target: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    });
    expect(screen.getByText('Probing token...')).toBeInTheDocument();
  });

  it('shows token metadata when probe succeeds', () => {
    tokenMetadataMock = {
      data: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      isLoading: false,
      error: null,
    };
    render(<CampaignStep />);
    fireEvent.change(screen.getByPlaceholderText('0x...'), {
      target: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    });
    expect(screen.getByText('USD Coin')).toBeInTheDocument();
    expect(screen.getByText('(USDC)')).toBeInTheDocument();
    expect(screen.getByText('6 decimals')).toBeInTheDocument();
  });

  it('shows "Not a valid ERC-20" when probe returns null', () => {
    tokenMetadataMock = { data: null, isLoading: false, error: null };
    render(<CampaignStep />);
    fireEvent.change(screen.getByPlaceholderText('0x...'), {
      target: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    });
    expect(screen.getByText(/not a valid ERC-20/i)).toBeInTheDocument();
  });

  it('shows "Failed to probe" when probe errors', () => {
    tokenMetadataMock = { data: undefined, isLoading: false, error: new Error('RPC error') };
    render(<CampaignStep />);
    fireEvent.change(screen.getByPlaceholderText('0x...'), {
      target: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    });
    expect(screen.getByText(/failed to probe token/i)).toBeInTheDocument();
  });

  it('switches contract variant between Simple and Full', () => {
    render(<CampaignStep />);
    const simpleButton = screen.getByText('Simple');
    const fullButton = screen.getByText('Full');

    // Default is Simple (active)
    expect(simpleButton.className).toContain('ring-blue');

    // Click Full
    fireEvent.click(fullButton);
    expect(fullButton.className).toContain('ring-blue');

    // Click Simple back
    fireEvent.click(simpleButton);
    expect(simpleButton.className).toContain('ring-blue');
  });

  it('calls saveCampaign when editing an existing campaign', async () => {
    activeCampaignOverride = {
      id: 'existing-1',
      name: 'Existing Campaign',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://eth.llamarpc.com',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: '',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: null,
      batchSize: 100,
      campaignId: null,
      pinnedBlock: null,
      funder: '0x0000000000000000000000000000000000000000',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<CampaignStep />);

    // The form should be pre-filled with existing campaign data
    // Update the campaign name and save
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Updated Campaign' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockSaveCampaign).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveCampaign.mock.calls[0][0];
    expect(saved.id).toBe('existing-1');
    expect(saved.name).toBe('Updated Campaign');
    expect(saved.chainId).toBe(1);
    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(mockSetActiveStep).toHaveBeenCalledWith('addresses');
  });

  it('uses token metadata decimals and symbol when saving existing campaign', async () => {
    tokenMetadataMock = {
      data: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      isLoading: false,
      error: null,
    };

    activeCampaignOverride = {
      id: 'existing-2',
      name: 'Token Campaign',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://eth.llamarpc.com',
      tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: '',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: null,
      batchSize: 50,
      campaignId: null,
      pinnedBlock: null,
      funder: '0x0000000000000000000000000000000000000000',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockSaveCampaign).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveCampaign.mock.calls[0][0];
    expect(saved.tokenDecimals).toBe(6);
    expect(saved.contractName).toBe('USDC');
  });

  it('creates new campaign with correct data when no active campaign', async () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('PulseChain'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'New Drop' },
    });
    fireEvent.click(screen.getByText('Full'));
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    });

    const config = mockCreateCampaign.mock.calls[0][0];
    expect(config.chainId).toBe(369);
    expect(config.rpcUrl).toBe('https://rpc.pulsechain.com');
    expect(config.name).toBe('New Drop');
    expect(config.contractVariant).toBe('full');
  });

  it('does not save when chainId is null', () => {
    render(<CampaignStep />);
    // Only fill campaign name, not chain — chainId remains null
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Test Campaign' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));
    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(mockSaveCampaign).not.toHaveBeenCalled();
  });

  it('does not save when campaign name is blank', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    // Leave name empty
    fireEvent.click(screen.getByText('Save & Continue'));
    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(mockSaveCampaign).not.toHaveBeenCalled();
  });

  it('updates RPC URL when typing in the input', () => {
    render(<CampaignStep />);
    const rpcInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    fireEvent.change(rpcInput, { target: { value: 'https://custom-rpc.io' } });
    expect(rpcInput.value).toBe('https://custom-rpc.io');
  });

  it('updates batch size input value', () => {
    render(<CampaignStep />);
    const batchInput = screen.getByDisplayValue('100') as HTMLInputElement;
    fireEvent.change(batchInput, { target: { value: '50' } });
    expect(batchInput.value).toBe('50');
  });

  it('clamps batch size to 1 when set to 0', () => {
    render(<CampaignStep />);
    const batchInput = screen.getByDisplayValue('100') as HTMLInputElement;
    fireEvent.change(batchInput, { target: { value: '0' } });
    expect(batchInput.value).toBe('1');
  });

  it('clamps batch size to 1 when set to non-numeric', () => {
    render(<CampaignStep />);
    const batchInput = screen.getByDisplayValue('100') as HTMLInputElement;
    fireEvent.change(batchInput, { target: { value: 'abc' } });
    expect(batchInput.value).toBe('1');
  });
});

describe('clampBatchSize', () => {
  it('returns 1 for zero', () => {
    expect(clampBatchSize('0')).toBe(1);
  });

  it('returns 1 for non-numeric string', () => {
    expect(clampBatchSize('abc')).toBe(1);
  });

  it('returns 1 for empty string', () => {
    expect(clampBatchSize('')).toBe(1);
  });

  it('returns 1 for negative value', () => {
    expect(clampBatchSize('-5')).toBe(1);
  });

  it('returns the number for valid positive values', () => {
    expect(clampBatchSize('50')).toBe(50);
  });

  it('returns 1 for NaN-producing input', () => {
    expect(clampBatchSize('NaN')).toBe(1);
  });
});
