import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressesStep } from './AddressesStep.js';

const mockSetActiveStep = vi.fn();
const mockPutAddressSet = vi.fn().mockResolvedValue(undefined);
const mockPutBatch = vi.fn().mockResolvedValue(undefined);

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: {
      id: 'campaign-1',
      name: 'Test',
      version: 1,
      chainId: 1,
      rpcUrl: '',
      funder: '0x0000000000000000000000000000000000000000',
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    campaigns: [],
    activeStepId: 'addresses',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    createCampaign: vi.fn(),
    saveCampaign: vi.fn(),
    refreshCampaigns: vi.fn(),
    refreshActiveCampaign: vi.fn().mockResolvedValue(undefined),
    completeStep: vi.fn(),
  }),
}));

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: {
      addressSets: { put: mockPutAddressSet },
      addresses: { putBatch: mockPutBatch },
    },
    isUnlocked: true,
  }),
}));

vi.mock('@titrate/sdk', () => ({
  parseCSV: (content: string) => {
    const lines = content.split('\n').filter((l: string) => l.trim());
    const rows = lines
      .filter((l: string) => /^0x[0-9a-fA-F]{40}/.test(l.trim()))
      .map((l: string) => {
        const parts = l.split(',');
        return { address: parts[0].trim().toLowerCase(), amount: parts[1]?.trim() ?? null };
      });
    return { rows, hasAmounts: lines[0]?.includes(',') ?? false };
  },
}));

// Stable UUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `test-uuid-${uuidCounter++}`,
});

describe('AddressesStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
  });

  it('renders step panel with title', () => {
    render(<AddressesStep />);
    expect(screen.getByText('Addresses')).toBeInTheDocument();
  });

  it('renders upload area and manual entry', () => {
    render(<AddressesStep />);
    expect(screen.getByText(/Drop a CSV file/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste addresses/)).toBeInTheDocument();
  });

  it('parses manual addresses', () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
    });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.getByText('2 addresses loaded')).toBeInTheDocument();
  });

  it('shows error for invalid manual addresses', () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: 'not-an-address\nbad-data' } });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.getByText('No valid addresses found in text.')).toBeInTheDocument();
  });

  it('disables continue when no addresses loaded', () => {
    render(<AddressesStep />);
    const button = screen.getByText('Save & Continue');
    expect(button).toBeDisabled();
  });

  it('enables continue after parsing addresses', () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.click(screen.getByText('Parse Addresses'));
    const button = screen.getByText('Save & Continue');
    expect(button).not.toBeDisabled();
  });

  it('saves addresses to storage and advances', async () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.click(screen.getByText('Parse Addresses'));
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockSetActiveStep).toHaveBeenCalledWith('filters');
    });

    expect(mockPutAddressSet).toHaveBeenCalledTimes(1);
    expect(mockPutAddressSet.mock.calls[0][0]).toMatchObject({
      campaignId: 'campaign-1',
      name: 'Manual Entry',
      type: 'source',
      addressCount: 1,
    });

    expect(mockPutBatch).toHaveBeenCalledTimes(1);
  });

  it('shows address preview limited to 5', () => {
    render(<AddressesStep />);
    const addresses = Array.from({ length: 7 }, (_, i) =>
      `0x${(i + 1).toString().padStart(40, '0')}`,
    ).join('\n');
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: addresses } });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.getByText('7 addresses loaded')).toBeInTheDocument();
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });
});
