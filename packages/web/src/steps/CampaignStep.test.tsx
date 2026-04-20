import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignStep, clampBatchSize, deriveCampaignId } from './CampaignStep.js';

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

const mockChainConfigsPut = vi.fn().mockResolvedValue(undefined);
const mockAppSettingsGet = vi.fn().mockResolvedValue(null);
const mockAppSettingsPut = vi.fn().mockResolvedValue(undefined);
const mockStorage = {
  chainConfigs: { put: mockChainConfigsPut },
  appSettings: {
    get: mockAppSettingsGet,
    put: mockAppSettingsPut,
  },
};

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({ storage: mockStorage, isUnlocked: false, unlock: vi.fn() }),
}));

let tokenMetadataMock: { data: unknown; isLoading: boolean; error: unknown } = {
  data: undefined,
  isLoading: false,
  error: null,
};

vi.mock('../hooks/useTokenMetadata.js', () => ({
  useTokenMetadata: () => tokenMetadataMock,
}));

vi.mock('@titrate/sdk', () => {
  const chains = [
    { chainId: 1, name: 'Ethereum', category: 'mainnet', rpcUrls: ['https://eth.llamarpc.com'] },
    { chainId: 369, name: 'PulseChain', category: 'mainnet', rpcUrls: ['https://rpc.pulsechain.com'] },
  ];
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
  return {
    SUPPORTED_CHAINS: chains,
    getChains: (category?: string) => category ? chains.filter((c: { category: string }) => c.category === category) : chains,
    getChainConfig: (chainId: number) => chains.find((c: { chainId: number }) => c.chainId === chainId) ?? null,
    validateContractName: (input: string) => {
      const trimmed = input.trim();
      if (trimmed.length === 0) return { ok: false, reason: 'Contract name is required.' };
      if (!IDENTIFIER.test(trimmed)) return { ok: false, reason: 'invalid identifier' };
      return { ok: true, value: trimmed };
    },
    getProvider: (id: 'valve' | 'alchemy' | 'infura' | 'public' | 'custom') => {
      const names: Record<string, string> = {
        valve: 'valve.city',
        alchemy: 'Alchemy',
        infura: 'Infura',
        public: 'Public',
        custom: 'Custom URL',
      };
      return {
        id,
        name: names[id] ?? id,
        helpUrl: '',
        requiresKey: id === 'valve' || id === 'alchemy' || id === 'infura',
        buildUrl: (chainId: number, key: string) => {
          if (id === 'valve') return `https://evm${chainId}.rpc.valve.city/v1/${key}`;
          if (id === 'alchemy' && chainId === 1) return `https://eth-mainnet.g.alchemy.com/v2/${key}`;
          if (id === 'infura' && chainId === 1) return `https://mainnet.infura.io/v3/${key}`;
          return null;
        },
      };
    },
    splitTemplate: (id: 'valve' | 'alchemy' | 'infura' | 'public' | 'custom', chainId: number) => {
      if (id === 'valve') return { prefix: `https://evm${chainId}.rpc.valve.city/v1/`, suffix: '' };
      if (id === 'alchemy' && chainId === 1) return { prefix: 'https://eth-mainnet.g.alchemy.com/v2/', suffix: '' };
      if (id === 'infura' && chainId === 1) return { prefix: 'https://mainnet.infura.io/v3/', suffix: '' };
      return { prefix: '', suffix: '' };
    },
  };
});

describe('CampaignStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCampaignOverride = null;
    tokenMetadataMock = { data: undefined, isLoading: false, error: null };
    mockChainConfigsPut.mockClear();
    mockAppSettingsGet.mockClear();
    mockAppSettingsGet.mockResolvedValue(null);
    mockAppSettingsPut.mockClear();
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
    expect(fullButton.getAttribute('aria-pressed')).toBe('true');
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
    expect(config.campaignId).toBeNull();
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
    // Manual fallback inputs should appear
    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Decimals')).toBeInTheDocument();
  });

  it('uses manual symbol and decimals when probe fails', async () => {
    tokenMetadataMock = { data: undefined, isLoading: false, error: new Error('RPC error') };
    render(<CampaignStep />);

    // Select chain
    fireEvent.click(screen.getByText('Ethereum'));

    // Enter token address
    fireEvent.change(screen.getByPlaceholderText('0x...'), {
      target: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    });

    // Fill manual fallback fields
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'USDC' } });
    fireEvent.change(screen.getByLabelText('Decimals'), { target: { value: '6' } });

    // Enter campaign name and save
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Manual Token Test' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenSymbol: 'USDC',
          tokenDecimals: 6,
        }),
      );
    });
  });

  it('switches contract variant between Simple and Full', () => {
    render(<CampaignStep />);
    const simpleButton = screen.getByText('Simple');
    const fullButton = screen.getByText('Full');

    // Default is Simple (active)
    expect(simpleButton.getAttribute('aria-pressed')).toBe('true');

    // Click Full
    fireEvent.click(fullButton);
    expect(fullButton.getAttribute('aria-pressed')).toBe('true');

    // Click Simple back
    fireEvent.click(simpleButton);
    expect(simpleButton.getAttribute('aria-pressed')).toBe('true');
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
    expect(saved.campaignId).toBeNull();
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
    expect(saved.tokenSymbol).toBe('USDC');
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
    expect(config.campaignId).toMatch(/^0x[0-9a-f]{64}$/);
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

  it('renders Custom button', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows chain ID and chain name inputs when Custom is clicked', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByPlaceholderText('e.g. 42161')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. My Custom Chain')).toBeInTheDocument();
  });

  it('clears RPC URL when switching to custom chain', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    const rpcInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    expect(rpcInput.value).toBe('https://eth.llamarpc.com');

    fireEvent.click(screen.getByText('Custom'));
    expect(rpcInput.value).toBe('');
  });

  it('hides custom fields when a preset chain is selected after Custom', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByPlaceholderText('e.g. 42161')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ethereum'));
    expect(screen.queryByPlaceholderText('e.g. 42161')).not.toBeInTheDocument();
  });

  it('allows saving with a custom chain ID and name', async () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Custom'));

    // Set custom chain ID
    fireEvent.change(screen.getByPlaceholderText('e.g. 42161'), {
      target: { value: '42161' },
    });
    // Set chain name
    fireEvent.change(screen.getByPlaceholderText('e.g. My Custom Chain'), {
      target: { value: 'Arbitrum One' },
    });
    // Set RPC URL
    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://arb1.arbitrum.io/rpc' },
    });
    // Set campaign name
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Custom Chain Campaign' },
    });

    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    });

    const config = mockCreateCampaign.mock.calls[0][0];
    expect(config.chainId).toBe(42161);
    expect(config.rpcUrl).toBe('https://arb1.arbitrum.io/rpc');
    expect(config.name).toBe('Custom Chain Campaign');
  });

  it('renders Show advanced toggle and hides explorer fields by default', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Show advanced')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('https://api.etherscan.io/api')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your API key')).not.toBeInTheDocument();
  });

  it('shows explorer fields when Show advanced is clicked', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Show advanced'));
    expect(screen.getByText('Hide advanced')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://api.etherscan.io/api')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your API key')).toBeInTheDocument();
  });

  it('hides explorer fields when Hide advanced is clicked', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Show advanced'));
    fireEvent.click(screen.getByText('Hide advanced'));
    expect(screen.getByText('Show advanced')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('https://api.etherscan.io/api')).not.toBeInTheDocument();
  });

  it('renders rate limit group field', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Rate limit group')).toBeInTheDocument();
  });

  it('saves chain config when explorer fields are filled', async () => {
    mockCreateCampaign.mockResolvedValue('campaign-123');
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Explorer Campaign' },
    });

    // Open advanced and fill explorer fields
    fireEvent.click(screen.getByText('Show advanced'));
    fireEvent.change(screen.getByPlaceholderText('https://api.etherscan.io/api'), {
      target: { value: 'https://api.etherscan.io/api' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your API key'), {
      target: { value: 'MYKEY123' },
    });

    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockChainConfigsPut).toHaveBeenCalledTimes(1);
    });

    const chainConfig = mockChainConfigsPut.mock.calls[0][0];
    expect(chainConfig.explorerApiUrl).toBe('https://api.etherscan.io/api');
    expect(chainConfig.explorerApiKey).toBe('MYKEY123');
    expect(chainConfig.chainId).toBe(1);
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

  // ------------------------------------------------------------------------
  // RPC URL auto-load (provider buttons)
  // ------------------------------------------------------------------------

  describe('provider auto-load buttons', () => {
    it('renders "Load from:" label and three provider buttons', () => {
      render(<CampaignStep />);
      expect(screen.getByText('Load from:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /valve\.city/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Alchemy$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Infura$/i })).toBeInTheDocument();
    });

    it('disables all provider buttons when no chain is selected', () => {
      render(<CampaignStep />);
      for (const name of [/valve\.city/i, /^Alchemy$/i, /^Infura$/i]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
    });

    it('enables all provider buttons after a supported chain is picked', () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      for (const name of [/valve\.city/i, /^Alchemy$/i, /^Infura$/i]) {
        expect(screen.getByRole('button', { name })).not.toBeDisabled();
      }
    });

    it('keeps Alchemy and Infura disabled for chains they do not template', () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^PulseChain$/i, pressed: false }));
      expect(screen.getByRole('button', { name: /valve\.city/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /^Alchemy$/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^Infura$/i })).toBeDisabled();
    });

    it('reveals an inline key editor with prefix/suffix spans when a provider is picked', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));

      await vi.waitFor(() => {
        expect(screen.getByLabelText('Alchemy API Key')).toBeInTheDocument();
      });
      // Prefix visible in the editor row; suffix is empty for these providers.
      expect(screen.getByText('https://eth-mainnet.g.alchemy.com/v2/')).toBeInTheDocument();
    });

    it('pre-fills the editor and fills RPC URL when a key was already saved', async () => {
      mockAppSettingsGet.mockImplementation(async (k: string) =>
        k === 'provider-key-valve' ? 'stored-key-abc' : null,
      );

      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /valve\.city/i }));

      await vi.waitFor(() => {
        const keyInput = screen.getByLabelText('valve.city API Key') as HTMLInputElement;
        expect(keyInput.value).toBe('stored-key-abc');
      });
      const rpcInput = screen.getByLabelText('RPC URL') as HTMLInputElement;
      expect(rpcInput.value).toBe('https://evm1.rpc.valve.city/v1/stored-key-abc');
    });

    it('updates the RPC URL live as the user types the key', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));

      const keyInput = await screen.findByLabelText('Alchemy API Key') as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: 'typed-key-1' } });

      const rpcInput = screen.getByLabelText('RPC URL') as HTMLInputElement;
      expect(rpcInput.value).toBe('https://eth-mainnet.g.alchemy.com/v2/typed-key-1');
    });

    it('extracts the key when the user pastes a full provider URL', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Infura$/i }));

      const keyInput = await screen.findByLabelText('Infura API Key') as HTMLInputElement;
      fireEvent.change(keyInput, {
        target: { value: 'https://mainnet.infura.io/v3/pasted-project-id' },
      });

      // Input collapses to just the key.
      expect(keyInput.value).toBe('pasted-project-id');
      // And RPC URL is rebuilt from the extracted key (no double-prefix).
      expect(
        (screen.getByLabelText('RPC URL') as HTMLInputElement).value,
      ).toBe('https://mainnet.infura.io/v3/pasted-project-id');
    });

    it('persists the key to appSettings on blur', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /valve\.city/i }));

      const keyInput = await screen.findByLabelText('valve.city API Key') as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: 'fresh-valve-key' } });
      fireEvent.blur(keyInput);

      await vi.waitFor(() => {
        expect(mockAppSettingsPut).toHaveBeenCalledWith(
          'provider-key-valve',
          'fresh-valve-key',
        );
      });
    });

    it('closes the editor on Done without committing an empty key', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));

      await screen.findByLabelText('Alchemy API Key');
      fireEvent.click(screen.getByRole('button', { name: /close provider key editor/i }));

      await vi.waitFor(() => {
        expect(screen.queryByLabelText('Alchemy API Key')).not.toBeInTheDocument();
      });
      expect(mockAppSettingsPut).not.toHaveBeenCalled();
    });

    it('commits and closes the editor when Done is clicked after typing a key', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));

      const keyInput = await screen.findByLabelText('Alchemy API Key') as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: 'done-path-key' } });
      fireEvent.click(screen.getByRole('button', { name: /close provider key editor/i }));

      await vi.waitFor(() => {
        expect(mockAppSettingsPut).toHaveBeenCalledWith(
          'provider-key-alchemy',
          'done-path-key',
        );
        expect(screen.queryByLabelText('Alchemy API Key')).not.toBeInTheDocument();
      });
    });

    it('Enter blurs the input and triggers commit', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Infura$/i }));

      const keyInput = await screen.findByLabelText('Infura API Key') as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: 'enter-key' } });
      fireEvent.keyDown(keyInput, { key: 'Enter' });

      await vi.waitFor(() => {
        expect(mockAppSettingsPut).toHaveBeenCalledWith('provider-key-infura', 'enter-key');
      });
      // Editor stays open — Enter commits but doesn't close (matches text-input conventions).
      expect(screen.getByLabelText('Infura API Key')).toBeInTheDocument();
    });

    it('Escape closes the editor', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /valve\.city/i }));

      const keyInput = await screen.findByLabelText('valve.city API Key') as HTMLInputElement;
      fireEvent.keyDown(keyInput, { key: 'Escape' });

      await vi.waitFor(() => {
        expect(screen.queryByLabelText('valve.city API Key')).not.toBeInTheDocument();
      });
    });

    it('switches the editor to another provider when its button is clicked mid-edit', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));

      // Open Alchemy editor, then switch to Infura without closing.
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));
      await screen.findByLabelText('Alchemy API Key');

      fireEvent.click(screen.getByRole('button', { name: /^Infura$/i }));
      await vi.waitFor(() => {
        expect(screen.queryByLabelText('Alchemy API Key')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Infura API Key')).toBeInTheDocument();
      });
    });

    it('marks the active provider button as aria-pressed while its editor is open', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /valve\.city/i }));

      await screen.findByLabelText('valve.city API Key');
      expect(
        screen.getByRole('button', { name: /valve\.city/i }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByRole('button', { name: /^Alchemy$/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('paste-URL extraction also works when the pasted value has surrounding whitespace', async () => {
      render(<CampaignStep />);
      fireEvent.click(screen.getByRole('button', { name: /^Ethereum$/i, pressed: false }));
      fireEvent.click(screen.getByRole('button', { name: /^Alchemy$/i }));

      const keyInput = await screen.findByLabelText('Alchemy API Key') as HTMLInputElement;
      fireEvent.change(keyInput, {
        target: { value: '  https://eth-mainnet.g.alchemy.com/v2/whitespace-key  ' },
      });

      expect(keyInput.value).toBe('whitespace-key');
      expect(
        (screen.getByLabelText('RPC URL') as HTMLInputElement).value,
      ).toBe('https://eth-mainnet.g.alchemy.com/v2/whitespace-key');
    });
  });
});

describe('deriveCampaignId', () => {
  it('returns null for simple variant', () => {
    expect(deriveCampaignId('My Campaign', 'simple')).toBeNull();
  });

  it('returns keccak256 hash for full variant', () => {
    const result = deriveCampaignId('My Campaign', 'full');
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('returns same hash for same name', () => {
    const a = deriveCampaignId('Test', 'full');
    const b = deriveCampaignId('Test', 'full');
    expect(a).toBe(b);
  });

  it('returns different hash for different names', () => {
    const a = deriveCampaignId('Alpha', 'full');
    const b = deriveCampaignId('Beta', 'full');
    expect(a).not.toBe(b);
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
