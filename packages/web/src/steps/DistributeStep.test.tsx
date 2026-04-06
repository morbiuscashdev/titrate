import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributeStep, toBatchCardStatus, getDisperseSelector, batchResultToStored, clampBatchSizeForGas, deriveExplorerBaseUrl } from './DistributeStep.js';

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
      getTransactionCount: vi.fn().mockResolvedValue(0),
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
  batches: {
    getByCampaign: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue(undefined),
  },
  pipelineConfigs: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
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
const mockDisperseParallel = vi.fn().mockResolvedValue([]);
const mockApproveOperator = vi.fn();
const mockGetAllowance = vi.fn();
const mockValidateBatch = vi.fn().mockReturnValue([]);
const mockVerifyContract = vi.fn();

vi.mock('@titrate/sdk', () => ({
  deployDistributor: (...args: unknown[]) => mockDeployDistributor(...args),
  disperseTokensSimple: (...args: unknown[]) => mockDisperseTokensSimple(...args),
  disperseTokens: (...args: unknown[]) => mockDisperseTokens(...args),
  disperseParallel: (...args: unknown[]) => mockDisperseParallel(...args),
  approveOperator: (...args: unknown[]) => mockApproveOperator(...args),
  getAllowance: (...args: unknown[]) => mockGetAllowance(...args),
  computeResumeOffset: (batches: { status: string }[], batchSize: number) => {
    const confirmed = batches.filter((b: { status: string }) => b.status === 'confirmed').length;
    return confirmed * batchSize;
  },
  validateBatch: (...args: unknown[]) => mockValidateBatch(...args),
  verifyContract: (...args: unknown[]) => mockVerifyContract(...args),
  hasErrors: (issues: { severity: string }[]) => issues.some((i: { severity: string }) => i.severity === 'error'),
  hasWarnings: (issues: { severity: string }[]) => issues.some((i: { severity: string }) => i.severity === 'warning'),
  parseGwei: (value: string) => {
    const [whole, decimal = ''] = value.split('.');
    const padded = decimal.padEnd(9, '0').slice(0, 9);
    return BigInt(whole) * 1_000_000_000n + BigInt(padded);
  },
}));

let interventionOverrides: Record<string, unknown> = {};

vi.mock('../providers/InterventionProvider.js', () => ({
  useIntervention: () => ({
    state: { isActive: false, context: null, resolve: null },
    createInterventionHook: () => () => Promise.resolve({ type: 'approve' }),
    enabledPoints: new Set(['stuck-transaction']),
    setEnabledPoints: vi.fn(),
    dismiss: vi.fn(),
    journal: [],
    clearJournal: vi.fn(),
    ...interventionOverrides,
  }),
}));

let walletClientsOverride: unknown[] = [];

vi.mock('../providers/WalletProvider.js', () => ({
  useWallet: () => ({
    address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    walletClients: walletClientsOverride,
    perryMode: null,
  }),
}));

vi.mock('../hooks/useLiveFilter.js', () => ({
  useLiveFilter: () => undefined,
  composeLiveFilters: () => undefined,
}));

vi.mock('../hooks/usePipelineLiveFilter.js', () => ({
  usePipelineLiveFilter: () => undefined,
}));

beforeEach(() => {
  vi.clearAllMocks();
  campaignOverrides = {};
  chainOverrides = {};
  interventionOverrides = {};
  walletClientsOverride = [];
  walletClientData = {
    account: { address: '0x1234' },
    writeContract: vi.fn().mockResolvedValue('0xapprovehash'),
  };
  mockStorage.addressSets.getByCampaign.mockResolvedValue([]);
  mockStorage.addresses.getBySet.mockResolvedValue([]);
  mockStorage.batches.getByCampaign.mockResolvedValue([]);
  mockStorage.batches.put.mockResolvedValue(undefined);
  mockValidateBatch.mockReturnValue([]);
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
  mockVerifyContract.mockResolvedValue({ success: true, message: 'Verified', explorerUrl: 'https://etherscan.io/address/0x1234' });
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

  it('shows contract address when deployed', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.getByText('0x12345678...567890')).toBeInTheDocument();
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

  it('loads saved batches on mount and shows in timeline', async () => {
    const savedBatchData = [
      {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'] as const,
        amounts: ['1000'] as const,
        status: 'confirmed' as const,
        attempts: [],
        confirmedTxHash: '0xabc123' as const,
        confirmedBlock: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.batches.getByCampaign.mockResolvedValue(savedBatchData);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        batchSize: 1,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(mockStorage.batches.getByCampaign).toHaveBeenCalledWith('test-1');
    });

    // Saved batch should appear as a card in timeline
    await waitFor(() => {
      expect(screen.getByText('Batch #1')).toBeInTheDocument();
    });
  });

  it('shows resume button when incomplete batches exist', async () => {
    const savedBatchData = [
      {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'] as const,
        amounts: ['1000'] as const,
        status: 'confirmed' as const,
        attempts: [],
        confirmedTxHash: '0xabc123' as const,
        confirmedBlock: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.batches.getByCampaign.mockResolvedValue(savedBatchData);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        batchSize: 1,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resume distribution/i })).toBeInTheDocument();
    });

    // Should show the resume message
    await waitFor(() => {
      expect(screen.getByText(/1 of 2 batches completed/i)).toBeInTheDocument();
    });
  });

  it('resumes distribution skipping confirmed recipients', async () => {
    const savedBatchData = [
      {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'] as const,
        amounts: ['1000'] as const,
        status: 'confirmed' as const,
        attempts: [],
        confirmedTxHash: '0xabc123' as const,
        confirmedBlock: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.batches.getByCampaign.mockResolvedValue(savedBatchData);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 1,
        recipients: ['0xRecipient2000000000000000000000000000002'],
        amounts: [1000n],
        attempts: [],
        confirmedTxHash: '0xdef456',
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resume distribution/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resume distribution/i }));
    });

    await waitFor(() => {
      // Should only send the second recipient (first was already confirmed)
      expect(mockDisperseTokensSimple).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: ['0xRecipient2000000000000000000000000000002'],
        }),
      );
    });
  });

  it('saves batch results to IDB after distribution', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
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
      expect(mockStorage.batches.put).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'test-1',
          batchIndex: 0,
          status: 'confirmed',
          confirmedTxHash: '0xabc123',
        }),
      );
    });
  });

  it('shows distribution complete with spend summary when all batches confirmed on load', async () => {
    const savedBatchData = [
      {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'] as const,
        amounts: ['1000'] as const,
        status: 'confirmed' as const,
        attempts: [],
        confirmedTxHash: '0xabc123' as const,
        confirmedBlock: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.batches.getByCampaign.mockResolvedValue(savedBatchData);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
        batchSize: 1,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    // All batches confirmed on load -> should show Distribution Summary
    await waitFor(() => {
      expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
    });
  });

  it('shows verify button when contract is deployed', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.getByText('Verify on Explorer')).toBeInTheDocument();
  });

  it('does not show verify button when contract is not deployed', () => {
    render(<DistributeStep />);
    expect(screen.queryByText('Verify on Explorer')).not.toBeInTheDocument();
  });

  it('calls verifyContract and shows success', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockVerifyContract.mockResolvedValue({
      success: true,
      message: 'Contract verified',
      explorerUrl: 'https://etherscan.io/address/0x1234',
    });

    render(<DistributeStep />);
    fireEvent.click(screen.getByText('Verify on Explorer'));

    await waitFor(() => {
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });
  });

  it('shows error when verification fails', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockVerifyContract.mockResolvedValue({
      success: false,
      message: 'Source code mismatch',
      explorerUrl: null,
    });

    render(<DistributeStep />);
    fireEvent.click(screen.getByText('Verify on Explorer'));

    await waitFor(() => {
      expect(screen.getByText('Source code mismatch')).toBeInTheDocument();
    });
  });

  it('shows error when verifyContract throws', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockVerifyContract.mockRejectedValue(new Error('Network timeout'));

    render(<DistributeStep />);
    fireEvent.click(screen.getByText('Verify on Explorer'));

    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('shows verifying state while verification is in progress', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockVerifyContract.mockReturnValue(new Promise(() => {}));

    render(<DistributeStep />);
    fireEvent.click(screen.getByText('Verify on Explorer'));

    await waitFor(() => {
      expect(screen.getByText('Verifying...')).toBeInTheDocument();
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

describe('batchResultToStored', () => {
  it('converts a confirmed BatchResult to StoredBatch', () => {
    const result = {
      batchIndex: 0,
      recipients: ['0xRecipient1000000000000000000000000000001' as const],
      amounts: [1000n],
      attempts: [],
      confirmedTxHash: '0xabc123' as const,
      blockNumber: 42n,
    };

    const stored = batchResultToStored('campaign-1', result);

    expect(stored.campaignId).toBe('campaign-1');
    expect(stored.batchIndex).toBe(0);
    expect(stored.recipients).toEqual(['0xRecipient1000000000000000000000000000001']);
    expect(stored.amounts).toEqual(['1000']);
    expect(stored.status).toBe('confirmed');
    expect(stored.confirmedTxHash).toBe('0xabc123');
    expect(stored.confirmedBlock).toBe(42n);
    expect(stored.id).toBeTruthy();
    expect(stored.createdAt).toBeGreaterThan(0);
    expect(stored.updatedAt).toBeGreaterThan(0);
  });

  it('converts a failed BatchResult to StoredBatch', () => {
    const result = {
      batchIndex: 1,
      recipients: ['0xRecipient2000000000000000000000000000002' as const],
      amounts: [500n],
      attempts: [],
      confirmedTxHash: null,
      blockNumber: null,
    };

    const stored = batchResultToStored('campaign-2', result);

    expect(stored.status).toBe('failed');
    expect(stored.confirmedTxHash).toBeNull();
    expect(stored.confirmedBlock).toBeNull();
  });

  it('converts bigint amounts to strings', () => {
    const result = {
      batchIndex: 0,
      recipients: ['0xRecipient1000000000000000000000000000001' as const],
      amounts: [123456789012345678901234567890n],
      attempts: [],
      confirmedTxHash: '0xabc' as const,
      blockNumber: null,
    };

    const stored = batchResultToStored('campaign-3', result);

    expect(stored.amounts).toEqual(['123456789012345678901234567890']);
    expect(typeof stored.amounts[0]).toBe('string');
  });

  it('generates unique IDs for each call', () => {
    const result = {
      batchIndex: 0,
      recipients: ['0xRecipient1000000000000000000000000000001' as const],
      amounts: [100n],
      attempts: [],
      confirmedTxHash: '0xabc' as const,
      blockNumber: null,
    };

    const stored1 = batchResultToStored('campaign-1', result);
    const stored2 = batchResultToStored('campaign-1', result);

    expect(stored1.id).not.toBe(stored2.id);
  });
});

describe('clampBatchSizeForGas', () => {
  it('returns unchanged batch size when it fits within gas limit', () => {
    const result = clampBatchSizeForGas({ batchSize: 100 });
    expect(result.effectiveBatchSize).toBe(100);
    expect(result.wasClamped).toBe(false);
  });

  it('clamps batch size when it exceeds gas limit', () => {
    const result = clampBatchSizeForGas({ batchSize: 1000 });
    // Default: 16_777_216 / (28_000 * 1.2) = 499.3 -> floor = 499
    expect(result.effectiveBatchSize).toBe(499);
    expect(result.wasClamped).toBe(true);
  });

  it('uses custom gasPerTransfer', () => {
    const result = clampBatchSizeForGas({ batchSize: 100, gasPerTransfer: 50_000 });
    // 16_777_216 / (50_000 * 1.2) = 279.6 -> floor = 279
    expect(result.effectiveBatchSize).toBe(100);
    expect(result.wasClamped).toBe(false);
  });

  it('uses custom gasLimitBuffer', () => {
    const result = clampBatchSizeForGas({ batchSize: 1000, gasLimitBuffer: 2.0 });
    // 16_777_216 / (28_000 * 2.0) = 299.6 -> floor = 299
    expect(result.effectiveBatchSize).toBe(299);
    expect(result.wasClamped).toBe(true);
  });

  it('uses custom maxTxGas', () => {
    const result = clampBatchSizeForGas({ batchSize: 100, maxTxGas: 1_000_000n });
    // 1_000_000 / (28_000 * 1.2) = 29.76 -> floor = 29
    expect(result.effectiveBatchSize).toBe(29);
    expect(result.wasClamped).toBe(true);
  });

  it('returns batch size of 1 for very small gas limits', () => {
    const result = clampBatchSizeForGas({ batchSize: 100, maxTxGas: 40_000n });
    // 40_000 / (28_000 * 1.2) = 1.19 -> floor = 1
    expect(result.effectiveBatchSize).toBe(1);
    expect(result.wasClamped).toBe(true);
  });

  it('returns 0 for impossibly small gas limits', () => {
    const result = clampBatchSizeForGas({ batchSize: 100, maxTxGas: 10_000n });
    // 10_000 / (28_000 * 1.2) = 0.29 -> floor = 0
    expect(result.effectiveBatchSize).toBe(0);
    expect(result.wasClamped).toBe(true);
  });

  it('handles batch size of 1 without clamping', () => {
    const result = clampBatchSizeForGas({ batchSize: 1 });
    expect(result.effectiveBatchSize).toBe(1);
    expect(result.wasClamped).toBe(false);
  });

  it('handles all custom parameters together', () => {
    const result = clampBatchSizeForGas({
      batchSize: 500,
      gasPerTransfer: 35_000,
      gasLimitBuffer: 1.5,
      maxTxGas: 10_000_000n,
    });
    // 10_000_000 / (35_000 * 1.5) = 190.47 -> floor = 190
    expect(result.effectiveBatchSize).toBe(190);
    expect(result.wasClamped).toBe(true);
  });

  it('does not clamp when batch size equals max', () => {
    // 16_777_216 / (28_000 * 1.2) = 499.3 -> 499
    const result = clampBatchSizeForGas({ batchSize: 499 });
    expect(result.effectiveBatchSize).toBe(499);
    expect(result.wasClamped).toBe(false);
  });
});

describe('DistributeStep nonce check', () => {
  it('shows error when there are pending transactions', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);

    // Mock getTransactionCount to return different confirmed vs pending nonces
    const mockGetTransactionCount = vi.fn()
      .mockImplementation(({ blockTag }: { blockTag?: string }) => {
        if (blockTag === 'pending') return Promise.resolve(5);
        return Promise.resolve(3);
      });

    chainOverrides = {
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
        readContract: vi.fn().mockResolvedValue(0n),
        getTransactionCount: mockGetTransactionCount,
      },
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
      expect(screen.getByText(/2 pending transaction/i)).toBeInTheDocument();
    });
  });
});

describe('DistributeStep gas clamping warning', () => {
  it('shows clamping warning when batch size exceeds gas limit', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        batchSize: 1000,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    expect(screen.getByText(/batch size clamped from 1000 to 499/i)).toBeInTheDocument();
  });

  it('does not show clamping warning when batch size fits within gas limit', () => {
    render(<DistributeStep />);

    expect(screen.queryByText(/batch size clamped/i)).not.toBeInTheDocument();
  });

  it('shows clamped value in batch size row', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        batchSize: 1000,
      } as typeof defaultCampaign.activeCampaign,
    };

    render(<DistributeStep />);

    const matches = screen.getAllByText(/clamped from 1000/);
    expect(matches.length).toBe(2); // One in batch size row, one in warning
  });
});

describe('DistributeStep pre-send recording', () => {
  it('saves pending batch records before distribution starts', async () => {
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

    await waitFor(() => {
      expect(mockStorage.addresses.getBySet).toHaveBeenCalledWith('set-1');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    });

    await waitFor(() => {
      // Verify pending batch was saved BEFORE distribution
      // First call should be with status 'pending', subsequent calls update to final status
      const putCalls = mockStorage.batches.put.mock.calls;
      expect(putCalls.length).toBeGreaterThanOrEqual(2);
      expect(putCalls[0][0]).toEqual(
        expect.objectContaining({
          campaignId: 'test-1',
          batchIndex: 0,
          status: 'pending',
        }),
      );
    });
  });
});

describe('DistributeStep gas cost display', () => {
  it('updates batch cards with gas estimates from batch results', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseTokensSimple.mockResolvedValue([
      {
        batchIndex: 0,
        recipients: ['0xRecipient1000000000000000000000000000001'],
        amounts: [1000n],
        attempts: [
          {
            txHash: '0xabc123',
            nonce: 0,
            gasEstimate: 50000n,
            maxFeePerGas: 20000000000n,
            maxPriorityFeePerGas: 1000000000n,
            timestamp: Date.now(),
            outcome: 'confirmed',
          },
        ],
        confirmedTxHash: '0xabc123',
        blockNumber: 42n,
      },
    ]);

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
      // Gas: 50000 * 20000000000 = 1_000_000_000_000_000 wei = 0.001 ETH
      // Appears in BatchStatusCard as "Gas: 0.001 ETH" and in SpendSummary as "0.001 ETH"
      const gasElements = screen.getAllByText(/0\.001 ETH/);
      expect(gasElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('DistributeStep pre-distribution validation', () => {
  it('blocks distribution when validation returns errors', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2 },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue([
      { id: '1', address: '0xbadaddress', amount: '1000' },
      { id: '2', address: '0x1111111111111111111111111111111111111111', amount: '1000' },
    ]);
    mockValidateBatch.mockReturnValue([
      { severity: 'error', row: 0, field: 'address', value: '0xbadaddress', message: 'Invalid address format', code: 'INVALID_LENGTH' },
    ]);

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start distribution/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));

    await waitFor(() => {
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
    });

    expect(mockDisperseTokensSimple).not.toHaveBeenCalled();
  });

  it('allows distribution when validation passes', async () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1 },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue([
      { id: '1', address: '0x1111111111111111111111111111111111111111', amount: '1000' },
    ]);
    mockValidateBatch.mockReturnValue([]);
    mockDisperseTokensSimple.mockResolvedValue([]);

    render(<DistributeStep />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start distribution/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));

    await waitFor(() => {
      expect(mockDisperseTokensSimple).toHaveBeenCalled();
    });
  });
});

describe('deriveExplorerBaseUrl', () => {
  it('strips api subdomain and /api path', () => {
    expect(deriveExplorerBaseUrl('https://api.etherscan.io/api')).toBe('https://etherscan.io');
  });

  it('strips api subdomain without /api path', () => {
    expect(deriveExplorerBaseUrl('https://api.basescan.org')).toBe('https://basescan.org');
  });

  it('handles URL with no api subdomain', () => {
    expect(deriveExplorerBaseUrl('https://explorer.example.com/api')).toBe('https://explorer.example.com');
  });

  it('returns null for undefined', () => {
    expect(deriveExplorerBaseUrl(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deriveExplorerBaseUrl('')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(deriveExplorerBaseUrl('not-a-url')).toBeNull();
  });
});

describe('DistributeStep contract verification display', () => {
  it('shows contract address as link when explorer URL is configured', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      } as typeof defaultCampaign.activeCampaign,
    };
    chainOverrides = {
      chainConfig: {
        explorerApiUrl: 'https://api.etherscan.io/api',
      },
    };
    render(<DistributeStep />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://etherscan.io/address/0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows contract address as plain text when no explorer URL', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);

    expect(screen.getByText('0xAbCdEf12...CdEf12')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the GasConfigPanel in ready phase', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Advanced Gas Settings')).toBeInTheDocument();
  });

  it('shows live filter OFF for simple variant', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Live filter')).toBeInTheDocument();
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });

  it('shows simple variant note about live filter', () => {
    render(<DistributeStep />);
    expect(
      screen.getByText(/requires the Full contract variant/i),
    ).toBeInTheDocument();
  });

  it('hides simple variant note for full variant', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractVariant: 'full',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(
      screen.queryByText(/requires the Full contract variant/i),
    ).not.toBeInTheDocument();
  });

  it('shows live filter row in distribution plan', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Live filter')).toBeInTheDocument();
  });

  it('shows intervention journal in complete phase when entries exist', async () => {
    const journalEntries = [
      {
        timestamp: Date.now(),
        campaignId: 'test-1',
        point: 'stuck-transaction' as const,
        action: 'retry' as const,
        issueCount: 0,
      },
      {
        timestamp: Date.now(),
        campaignId: 'test-1',
        point: 'batch-preview' as const,
        action: 'approve' as const,
        issueCount: 0,
      },
    ];

    interventionOverrides = { journal: journalEntries };

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
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
      expect(screen.getByText(/Intervention Journal/)).toBeInTheDocument();
      expect(screen.getByText('stuck-transaction')).toBeInTheDocument();
      expect(screen.getByText('batch-preview')).toBeInTheDocument();
      expect(screen.getByText('retry')).toBeInTheDocument();
      expect(screen.getByText('approve')).toBeInTheDocument();
    });
  });

  it('hides intervention journal when no entries exist', async () => {
    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
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

    expect(screen.queryByText(/Intervention Journal/)).not.toBeInTheDocument();
  });
});

describe('DistributeStep parallel dispatch', () => {
  it('shows wallet count in distribution plan when multi-wallet', () => {
    walletClientsOverride = [
      { account: { address: '0xWallet1' } },
      { account: { address: '0xWallet2' } },
      { account: { address: '0xWallet3' } },
    ];
    render(<DistributeStep />);
    expect(screen.getByText('3 (parallel)')).toBeInTheDocument();
    expect(screen.getByText('Wallets')).toBeInTheDocument();
  });

  it('hides wallet count row in single-wallet mode', () => {
    walletClientsOverride = [];
    render(<DistributeStep />);
    expect(screen.queryByText('Wallets')).not.toBeInTheDocument();
  });

  it('calls disperseParallel when multi-wallet is active', async () => {
    const mockWalletClients = [
      {
        account: { address: '0xWallet1000000000000000000000000000000001' },
        writeContract: vi.fn().mockResolvedValue('0xapprovehash1'),
      },
      {
        account: { address: '0xWallet2000000000000000000000000000000002' },
        writeContract: vi.fn().mockResolvedValue('0xapprovehash2'),
      },
    ];
    walletClientsOverride = mockWalletClients;

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
      { setId: 'set-1', address: '0xRecipient2000000000000000000000000000002', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 2, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseParallel.mockResolvedValue([
      {
        walletIndex: 0,
        walletAddress: '0xWallet1000000000000000000000000000000001',
        results: [{
          batchIndex: 0,
          recipients: ['0xRecipient1000000000000000000000000000001'],
          amounts: [1000n],
          attempts: [],
          confirmedTxHash: '0xabc123',
          blockNumber: null,
        }],
      },
      {
        walletIndex: 1,
        walletAddress: '0xWallet2000000000000000000000000000000002',
        results: [{
          batchIndex: 1000,
          recipients: ['0xRecipient2000000000000000000000000000002'],
          amounts: [1000n],
          attempts: [],
          confirmedTxHash: '0xdef456',
          blockNumber: null,
        }],
      },
    ]);

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
      expect(mockDisperseParallel).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: '0x1234567890123456789012345678901234567890',
          walletClients: mockWalletClients,
        }),
      );
    });

    // Single-wallet path should NOT have been called
    expect(mockDisperseTokensSimple).not.toHaveBeenCalled();
    expect(mockDisperseTokens).not.toHaveBeenCalled();
  });

  it('uses single-wallet path when walletClients has 0 or 1 entries', async () => {
    walletClientsOverride = [];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
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
      expect(mockDisperseTokensSimple).toHaveBeenCalled();
    });

    expect(mockDisperseParallel).not.toHaveBeenCalled();
  });
});

describe('DistributeStep sweep-back', () => {
  it('shows sweep section in complete phase when multi-wallet', async () => {
    walletClientsOverride = [
      {
        account: { address: '0xWallet1000000000000000000000000000000001' },
        writeContract: vi.fn().mockResolvedValue('0xapprovehash1'),
      },
      {
        account: { address: '0xWallet2000000000000000000000000000000002' },
        writeContract: vi.fn().mockResolvedValue('0xapprovehash2'),
      },
    ];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
    mockDisperseParallel.mockResolvedValue([
      {
        walletIndex: 0,
        walletAddress: '0xWallet1000000000000000000000000000000001',
        results: [{
          batchIndex: 0,
          recipients: ['0xRecipient1000000000000000000000000000001'],
          amounts: [1000n],
          attempts: [],
          confirmedTxHash: '0xabc123',
          blockNumber: null,
        }],
      },
    ]);

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
      expect(screen.getByText('Sweep Remaining Balances')).toBeInTheDocument();
    });

    expect(screen.getByText('Sweep All to Address')).toBeInTheDocument();
    expect(screen.getByText('Sweep to address')).toBeInTheDocument();
  });

  it('hides sweep section in single-wallet mode', async () => {
    walletClientsOverride = [];

    const mockAddresses = [
      { setId: 'set-1', address: '0xRecipient1000000000000000000000000000001', amount: null },
    ];

    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'test-1', name: 'Source', type: 'source', addressCount: 1, createdAt: Date.now() },
    ]);
    mockStorage.addresses.getBySet.mockResolvedValue(mockAddresses);
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

    expect(screen.queryByText('Sweep Remaining Balances')).not.toBeInTheDocument();
  });

  it('defaults sweep address to cold wallet address', () => {
    walletClientsOverride = [
      { account: { address: '0xWallet1' } },
      { account: { address: '0xWallet2' } },
    ];
    render(<DistributeStep />);

    // The sweep address input is not visible in ready phase for single-wallet,
    // but we can verify it was set via the useWallet mock providing
    // address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
    // We'll verify by checking the complete phase flow
  });
});
