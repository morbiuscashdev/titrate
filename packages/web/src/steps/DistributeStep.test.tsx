import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributeStep, toBatchCardStatus, getDisperseSelector } from './DistributeStep.js';

// ---- Mock state ----

const mockSetActiveStep = vi.fn();
const mockSaveCampaign = vi.fn().mockResolvedValue(undefined);

const defaultCampaign = {
  activeCampaign: {
    id: 'test-1',
    name: 'Test Campaign',
    version: 1,
    chainId: 1,
    rpcUrl: 'https://rpc.example.com',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple' as const,
    contractName: 'USDC',
    amountMode: 'uniform' as const,
    amountFormat: 'integer' as const,
    uniformAmount: '1000',
    batchSize: 100,
    campaignId: null,
    pinnedBlock: null,
    funder: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Record<string, unknown> | null,
  campaigns: [],
  activeStepId: 'distribute' as const,
  stepStates: [],
  setActiveStep: mockSetActiveStep,
  setActiveCampaign: vi.fn(),
  createCampaign: vi.fn(),
  saveCampaign: mockSaveCampaign,
  completeStep: vi.fn(),
  refreshCampaigns: vi.fn(),
};

let campaignOverrides: Partial<typeof defaultCampaign> = {};

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({ ...defaultCampaign, ...campaignOverrides }),
}));

let chainOverrides: Record<string, unknown> = {};

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({
    publicClient: {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
      readContract: vi.fn().mockResolvedValue(0n),
    },
    explorerBus: null,
    rpcBus: null,
    chainConfig: null,
    ...chainOverrides,
  }),
}));

const mockStorage = {
  addressSets: {
    getByCampaign: vi.fn().mockResolvedValue([]),
  },
  addresses: {
    getBySet: vi.fn().mockResolvedValue([]),
  },
};

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: mockStorage,
    isUnlocked: false,
    unlock: vi.fn(),
  }),
}));

let walletClientData: Record<string, unknown> | null = {
  account: { address: '0x1234' },
  writeContract: vi.fn().mockResolvedValue('0xapprovehash'),
};

vi.mock('wagmi', () => ({
  useWalletClient: () => ({
    data: walletClientData,
  }),
}));

const mockDeployDistributor = vi.fn();
const mockDisperseTokensSimple = vi.fn();
const mockDisperseTokens = vi.fn();
const mockApproveOperator = vi.fn();
const mockGetAllowance = vi.fn();

vi.mock('@titrate/sdk', () => ({
  deployDistributor: (...args: unknown[]) => mockDeployDistributor(...args),
  disperseTokensSimple: (...args: unknown[]) => mockDisperseTokensSimple(...args),
  disperseTokens: (...args: unknown[]) => mockDisperseTokens(...args),
  approveOperator: (...args: unknown[]) => mockApproveOperator(...args),
  getAllowance: (...args: unknown[]) => mockGetAllowance(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  campaignOverrides = {};
  chainOverrides = {};
  walletClientData = {
    account: { address: '0x1234' },
    writeContract: vi.fn().mockResolvedValue('0xapprovehash'),
  };
  mockStorage.addressSets.getByCampaign.mockResolvedValue([]);
  mockStorage.addresses.getBySet.mockResolvedValue([]);
  mockDeployDistributor.mockResolvedValue({
    address: '0xDeployedContractAddress1234567890123456',
    txHash: '0xabc123',
    variant: 'simple',
    name: 'USDC',
  });
  mockDisperseTokensSimple.mockResolvedValue([]);
  mockDisperseTokens.mockResolvedValue([]);
  mockApproveOperator.mockResolvedValue('0xapprovehash');
  mockGetAllowance.mockResolvedValue(0n);
});

describe('DistributeStep', () => {
  it('renders step panel with title', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Distribute')).toBeInTheDocument();
  });

  it('shows no campaign message when none is active', () => {
    campaignOverrides = { activeCampaign: null };
    render(<DistributeStep />);
    expect(screen.getByText(/no active campaign selected/i)).toBeInTheDocument();
  });

  it('shows distribution plan in ready state', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Distribution Plan')).toBeInTheDocument();
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('uniform')).toBeInTheDocument();
  });

  it('shows deploy button when contract is not deployed', () => {
    render(<DistributeStep />);
    expect(screen.getByRole('button', { name: /deploy contract/i })).toBeInTheDocument();
  });

  it('hides deploy button when contract is deployed', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.queryByRole('button', { name: /deploy contract/i })).not.toBeInTheDocument();
  });

  it('shows start distribution button', () => {
    render(<DistributeStep />);
    expect(screen.getByRole('button', { name: /start distribution/i })).toBeInTheDocument();
  });

  it('shows deploying state when deploy is clicked', async () => {
    // Make deploy hang so we can observe the deploying state
    mockDeployDistributor.mockReturnValue(new Promise(() => {}));

    render(<DistributeStep />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    });
    expect(screen.getByText(/deploying distribution contract/i)).toBeInTheDocument();
  });

  it('saves contract address after successful deploy', async () => {
    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    });

    await waitFor(() => {
      expect(mockSaveCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0xDeployedContractAddress1234567890123456',
        }),
      );
    });
  });

  it('shows error when deploy fails', async () => {
    mockDeployDistributor.mockRejectedValue(new Error('User rejected'));

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('User rejected')).toBeInTheDocument();
    });
  });

  it('shows error when distributing with no recipients', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/no recipients loaded/i)).toBeInTheDocument();
    });
  });

  it('calls disperseTokensSimple for uniform mode', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: mockAddresses.map((a) => a.address),
        amounts: [1000n, 1000n],
        attempts: [],
        confirmedTxHash: '0xabc123',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    // Wait for recipients to load
    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(mockDisperseTokensSimple).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0x1234567890123456789012345678901234567890',
          variant: 'simple',
          amount: 1000n,
        }),
      );
    });
  });

  it('shows spend summary on completion', async () => {
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: '0xabc123',
        blockNumber: null,
      },
    ]);

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    // Wait for recipients to load
    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
    });
  });

  it('shows uniform amount when set', () => {
    render(<DistributeStep />);
    expect(screen.getByText(/1000 USDC/)).toBeInTheDocument();
  });

  it('shows contract status as not deployed', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Not deployed')).toBeInTheDocument();
  });

  it('shows contract status as deployed when address exists', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  it('shows approving token spend message during approval phase', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    // Make writeContract hang so we can observe the approving state
    walletClientData = {
      account: { address: '0x1234' },
      writeContract: vi.fn().mockReturnValue(new Promise(() => {})),
    };

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/approving token spend/i)).toBeInTheDocument();
    });
  });

  it('shows error when wallet is not connected and Start Distribution clicked', async () => {
    walletClientData = null;

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/wallet not connected/i)).toBeInTheDocument();
    });
  });

  it('shows error when chain is not configured', async () => {
    chainOverrides = { publicClient: null };

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/chain not configured/i)).toBeInTheDocument();
    });
  });

  it('shows error when contract is not deployed', async () => {
    render(<DistributeStep />);

    // Default campaign has contractAddress: null
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/contract not deployed/i)).toBeInTheDocument();
    });
  });

  it('shows error and completes when distribution throws', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseTokensSimple.mockRejectedValue(new Error('RPC timeout'));

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('RPC timeout')).toBeInTheDocument();
    });

    // Phase should be complete — SpendSummary should be visible
    expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
  });

  it('counts failed batches in spend summary', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    // One batch succeeds, one fails (null confirmedTxHash)
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: null,
        blockNumber: null,
      },
      {
        batchIndex: 1,
        recipients: ['0xRecipient2000000000000000000000000000002'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: '0xabc123',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        batchSize: 1,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
    });

    // SpendSummary should show "1 batch failed"
    expect(screen.getByText('1 batch failed')).toBeInTheDocument();
  });

  it('calls disperseTokens for per-recipient amount mode', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: '500' },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: '750' },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseTokens.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: mockAddresses.map((a) => a.address),
        amounts: [500n, 750n],
        attempts: [],
        confirmedTxHash: '0xdef456',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        amountMode: 'per-recipient',
        uniformAmount: null,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(mockDisperseTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0x1234567890123456789012345678901234567890',
          amounts: [500n, 750n],
        }),
      );
    });

    expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
  });

  it('shows error when wallet is not connected and deploy is clicked', async () => {
    walletClientData = null;

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/wallet not connected/i)).toBeInTheDocument();
    });
  });

  it('shows error when chain is not configured and deploy is clicked', async () => {
    chainOverrides = { publicClient: null };

    render(<DistributeStep />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/chain not configured/i)).toBeInTheDocument();
    });
  });

  it('shows error when token approval fails', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    // Make writeContract (approve) throw
    walletClientData = {
      account: { address: '0x1234' },
      writeContract: vi.fn().mockRejectedValue(new Error('Approval rejected by user')),
    };

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Approval rejected by user')).toBeInTheDocument();
    });
  });

  it('invokes onProgress callback during distribution', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    // Capture and invoke onProgress inside the mock
    mockDisperseTokensSimple.mockImplementation(async (opts: Record<string, unknown>) => {
      const onProgress = opts.onProgress as (event: Record<string, unknown>) => void;
      onProgress({ type: 'batch', batchIndex: 0, status: 'confirmed' });
      return [
        {
          batchIndex: 0,
          recipients: ['0xRecipient1000000000000000000000000000001'],
          amounts: [1000n],
          attempts: [],
          confirmedTxHash: '0xabc123',
          blockNumber: null,
        },
      ];
    });

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
    });
  });

  it('shows error when storage.addresses.getBySet rejects', async () => {
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockRejectedValue(new Error('IDB read failed'));

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByText('IDB read failed')).toBeInTheDocument();
    });
  });

  it('shows generic error when storage.addresses.getBySet rejects with non-Error', async () => {
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockRejectedValue('some string error');

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load recipients')).toBeInTheDocument();
    });
  });

  it('shows recipient count in distribution plan', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
      { setId: 'set-1', address: '0xRecipient3000000000000000000000000000003', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 3, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('uses selector-scoped approval for full variant with uniform mode', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockGetAllowance.mockResolvedValue(0n);
    mockApproveOperator.mockResolvedValue('0xapprovehash');
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: '0xabc123',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        contractVariant: 'full',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(mockGetAllowance).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0x1234567890123456789012345678901234567890',
          selector: getDisperseSelector('uniform'),
        }),
      );
    });

    expect(mockApproveOperator).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: '0x1234567890123456789012345678901234567890',
        selector: getDisperseSelector('uniform'),
        amount: 1000n,
      }),
    );
  });

  it('uses selector-scoped approval for full variant with variable mode', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: '500' },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: '750' },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockGetAllowance.mockResolvedValue(0n);
    mockApproveOperator.mockResolvedValue('0xapprovehash');
    mockDisperseTokens.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: mockAddresses.map((a) => a.address),
        amounts: [500n, 750n],
        attempts: [],
        confirmedTxHash: '0xdef456',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        contractVariant: 'full',
        amountMode: 'per-recipient',
        uniformAmount: null,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(mockApproveOperator).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0x1234567890123456789012345678901234567890',
          selector: getDisperseSelector('variable'),
          amount: 1250n,
        }),
      );
    });
  });

  it('skips selector-scoped approval when full variant allowance is sufficient', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    // Allowance already exceeds totalNeeded
    mockGetAllowance.mockResolvedValue(2000n);
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: '0xabc123',
        blockNumber: null,
      },
    ]);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        contractVariant: 'full',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(mockGetAllowance).toHaveBeenCalled();
    });

    expect(mockApproveOperator).not.toHaveBeenCalled();
  });

  it('shows error when full variant approval fails', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockGetAllowance.mockResolvedValue(0n);
    mockApproveOperator.mockRejectedValue(new Error('Operator approval rejected'));

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        contractVariant: 'full',
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Operator approval rejected')).toBeInTheDocument();
    });
  });
});

describe('getDisperseSelector', () => {
  it('returns disperseSimple selector for uniform mode', () => {
    const selector = getDisperseSelector('uniform');
    expect(selector).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it('returns disperse selector for variable mode', () => {
    const selector = getDisperseSelector('variable');
    expect(selector).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it('returns different selectors for uniform and variable', () => {
    const uniform = getDisperseSelector('uniform');
    const variable = getDisperseSelector('variable');
    expect(uniform).not.toBe(variable);
  });
});

describe('toBatchCardStatus', () => {
  it('maps confirmed to confirmed', () => {
    expect(toBatchCardStatus('confirmed')).toBe('confirmed');
  });

  it('maps failed to failed', () => {
    expect(toBatchCardStatus('failed')).toBe('failed');
  });

  it('maps signing to pending', () => {
    expect(toBatchCardStatus('signing')).toBe('pending');
  });

  it('maps unknown status to pending', () => {
    expect(toBatchCardStatus('anything-else')).toBe('pending');
  });

  it('maps empty string to pending', () => {
    expect(toBatchCardStatus('')).toBe('pending');
  });
});
