import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChainConfigsList = vi.fn().mockResolvedValue([]);
const mockChainConfigsPut = vi.fn().mockResolvedValue(undefined);
const mockChainConfigsDelete = vi.fn().mockResolvedValue(undefined);

const mockStorage = {
  campaigns: { list: vi.fn().mockResolvedValue([]), put: vi.fn(), get: vi.fn(), delete: vi.fn() },
  addressSets: { list: vi.fn().mockResolvedValue([]) },
  addresses: { list: vi.fn().mockResolvedValue([]) },
  batches: { list: vi.fn().mockResolvedValue([]) },
  wallets: { list: vi.fn().mockResolvedValue([]) },
  pipelineConfigs: { list: vi.fn().mockResolvedValue([]) },
  chainConfigs: {
    list: mockChainConfigsList,
    put: mockChainConfigsPut,
    delete: mockChainConfigsDelete,
    get: vi.fn(),
  },
  appSettings: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
};

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({ storage: mockStorage, isUnlocked: true, unlock: vi.fn() }),
}));

vi.mock('../hooks/useUnlockStorage.js', () => ({
  useUnlockStorage: () => ({ isUnlocked: true, requestUnlock: vi.fn() }),
}));

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    campaigns: [],
    activeCampaign: null,
    refreshCampaigns: vi.fn(),
  }),
}));

vi.mock('@titrate/sdk', () => {
  const chains = [
    { chainId: 1, name: 'Ethereum', category: 'mainnet', rpcUrls: ['https://eth.llamarpc.com'], explorerApiUrl: 'https://api.etherscan.io/api' },
    { chainId: 369, name: 'PulseChain', category: 'mainnet', rpcUrls: ['https://rpc.pulsechain.com'] },
  ];
  return {
    SUPPORTED_CHAINS: chains,
    getChains: (category?: string) => category ? chains.filter((c: { category: string }) => c.category === category) : chains,
  };
});

import { SettingsPage } from './SettingsPage.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockChainConfigsList.mockResolvedValue([]);
});

describe('SettingsPage', () => {
  it('renders TrueBlocks URL field in the form', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText('Add Chain'));
    expect(screen.getByLabelText(/TrueBlocks URL/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('http://localhost:8080')).toBeInTheDocument();
  });

  it('saves TrueBlocks URL in chain config', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText('Add Chain'));

    // Select a preset chain
    fireEvent.click(screen.getByText('Ethereum'));

    // Fill TrueBlocks URL
    fireEvent.change(screen.getByPlaceholderText('http://localhost:8080'), {
      target: { value: 'http://localhost:8080' },
    });

    // Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockChainConfigsPut).toHaveBeenCalledTimes(1);
    });

    const savedConfig = mockChainConfigsPut.mock.calls[0][0];
    expect(savedConfig.trueBlocksUrl).toBe('http://localhost:8080');
    expect(savedConfig.trueBlocksBusKey).toBe('localhost');
    expect(savedConfig.chainId).toBe(1);
    expect(savedConfig.name).toBe('Ethereum');
  });

  it('saves empty TrueBlocks fields when URL is not provided', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText('Add Chain'));

    fireEvent.click(screen.getByText('Ethereum'));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockChainConfigsPut).toHaveBeenCalledTimes(1);
    });

    const savedConfig = mockChainConfigsPut.mock.calls[0][0];
    expect(savedConfig.trueBlocksUrl).toBe('');
    expect(savedConfig.trueBlocksBusKey).toBe('');
  });

  it('displays TrueBlocks URL in config list when set', async () => {
    mockChainConfigsList.mockResolvedValue([
      {
        id: 'cfg-1',
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcBusKey: 'eth.llamarpc.com',
        explorerApiUrl: '',
        explorerApiKey: '',
        explorerBusKey: '',
        trueBlocksUrl: 'http://localhost:8080',
        trueBlocksBusKey: 'localhost',
      },
    ]);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('TrueBlocks:')).toBeInTheDocument();
    });

    expect(screen.getByText('http://localhost:8080')).toBeInTheDocument();
  });

  it('does not display TrueBlocks row in config list when URL is empty', async () => {
    mockChainConfigsList.mockResolvedValue([
      {
        id: 'cfg-2',
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcBusKey: 'eth.llamarpc.com',
        explorerApiUrl: '',
        explorerApiKey: '',
        explorerBusKey: '',
        trueBlocksUrl: '',
        trueBlocksBusKey: '',
      },
    ]);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Ethereum')).toBeInTheDocument();
    });

    expect(screen.queryByText('TrueBlocks:')).not.toBeInTheDocument();
  });

  it('trims whitespace from TrueBlocks URL before saving', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText('Add Chain'));
    fireEvent.click(screen.getByText('Ethereum'));

    fireEvent.change(screen.getByPlaceholderText('http://localhost:8080'), {
      target: { value: '  http://localhost:9090  ' },
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockChainConfigsPut).toHaveBeenCalledTimes(1);
    });

    const savedConfig = mockChainConfigsPut.mock.calls[0][0];
    expect(savedConfig.trueBlocksUrl).toBe('http://localhost:9090');
    expect(savedConfig.trueBlocksBusKey).toBe('localhost');
  });
});
