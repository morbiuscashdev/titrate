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

  it('shows preview addresses after manual parse', () => {
    render(<AddressesStep />);
    const addr1 = '0x1234567890abcdef1234567890abcdef12345678';
    const addr2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: `${addr1}\n${addr2}` } });
    fireEvent.click(screen.getByText('Parse Addresses'));
    // Preview renders addresses lowercased
    expect(screen.getByText(addr1.toLowerCase())).toBeInTheDocument();
    expect(screen.getByText(addr2.toLowerCase())).toBeInTheDocument();
  });

  it('disables Parse Addresses button when textarea is empty', () => {
    render(<AddressesStep />);
    const button = screen.getByText('Parse Addresses');
    expect(button).toBeDisabled();
  });

  it('enables Parse Addresses button when textarea has content', () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: 'some text' } });
    const button = screen.getByText('Parse Addresses');
    expect(button).not.toBeDisabled();
  });

  it('clears error when valid addresses are parsed after failure', () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);

    // First: invalid parse
    fireEvent.change(textarea, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.getByText('No valid addresses found in text.')).toBeInTheDocument();

    // Second: valid parse
    fireEvent.change(textarea, {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.queryByText('No valid addresses found in text.')).not.toBeInTheDocument();
    expect(screen.getByText('1 addresses loaded')).toBeInTheDocument();
  });

  it('handles CSV file upload via file input', async () => {
    render(<AddressesStep />);
    const csvContent = '0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const file = new File([csvContent], 'addresses.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('2 addresses loaded')).toBeInTheDocument();
    });
    expect(screen.getByText('addresses.csv')).toBeInTheDocument();
  });

  it('shows error when CSV has no valid addresses', async () => {
    render(<AddressesStep />);
    const csvContent = 'not-an-address\nbad-data';
    const file = new File([csvContent], 'bad.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('No valid addresses found in file.')).toBeInTheDocument();
    });
  });

  it('handles drag over styling', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });

    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.className).toContain('border-blue-500');

    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain('border-blue-500');
  });

  it('handles file drop', async () => {
    render(<AddressesStep />);
    const csvContent = '0x1234567890abcdef1234567890abcdef12345678';
    const file = new File([csvContent], 'dropped.csv', { type: 'text/csv' });
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('1 addresses loaded')).toBeInTheDocument();
    });
    expect(screen.getByText('dropped.csv')).toBeInTheDocument();
  });

  it('clears manual text when file is uploaded', async () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: 'some manual text' } });

    const csvContent = '0x1234567890abcdef1234567890abcdef12345678';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('1 addresses loaded')).toBeInTheDocument();
    });
    // After file upload, the textarea value is cleared
    expect(textarea).toHaveValue('');
  });

  it('shows "Includes amounts" when CSV has amounts', async () => {
    render(<AddressesStep />);
    const csvContent = '0x1234567890abcdef1234567890abcdef12345678,100';
    const file = new File([csvContent], 'with-amounts.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('Includes amounts')).toBeInTheDocument();
    });
  });

  it('saves with file name when addresses came from CSV', async () => {
    render(<AddressesStep />);
    const csvContent = '0x1234567890abcdef1234567890abcdef12345678';
    const file = new File([csvContent], 'my-addresses.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('1 addresses loaded')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockPutAddressSet).toHaveBeenCalledTimes(1);
    });
    expect(mockPutAddressSet.mock.calls[0][0]).toMatchObject({
      name: 'my-addresses.csv',
    });
  });

  it('does not advance when no file is selected on input change', () => {
    render(<AddressesStep />);
    const fileInput = screen.getByTestId('file-input');
    // Trigger change with no files
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(screen.queryByText(/addresses loaded/)).not.toBeInTheDocument();
  });

  it('sets fileName to null for manual entry addresses', async () => {
    render(<AddressesStep />);
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.click(screen.getByText('Parse Addresses'));
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockPutAddressSet).toHaveBeenCalledTimes(1);
    });
    expect(mockPutAddressSet.mock.calls[0][0]).toMatchObject({
      name: 'Manual Entry',
    });
  });
});
