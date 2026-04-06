import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressesStep } from './AddressesStep.js';

const mockSetActiveStep = vi.fn();
const mockPutAddressSet = vi.fn().mockResolvedValue(undefined);
const mockPutBatch = vi.fn().mockResolvedValue(undefined);

const mockPublicClient = { type: 'publicClient' } as unknown;
const mockChainConfig = {
  id: 'chain-1',
  chainId: 1,
  name: 'Mainnet',
  rpcUrl: 'https://rpc.example.com',
  rpcBusKey: 'rpc-1',
  explorerApiUrl: 'https://api.etherscan.io/api',
  explorerApiKey: 'test-key',
  explorerBusKey: 'explorer-1',
  trueBlocksUrl: '',
  trueBlocksBusKey: '',
};

let mockUseChainValue = {
  publicClient: mockPublicClient,
  explorerBus: null,
  rpcBus: null,
  chainConfig: mockChainConfig,
};

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
      addressSets: { put: mockPutAddressSet, getByCampaign: vi.fn().mockResolvedValue([]) },
      addresses: { putBatch: mockPutBatch, getBySet: vi.fn().mockResolvedValue([]) },
    },
    isUnlocked: true,
  }),
}));

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => mockUseChainValue,
}));

let parseCSVShouldThrow = false;
const mockAddSource = vi.fn();
const mockExecute = vi.fn();

vi.mock('@titrate/sdk', () => ({
  parseCSV: (content: string) => {
    if (parseCSVShouldThrow) {
      throw new Error('CSV parse explosion');
    }
    const lines = content.split('\n').filter((l: string) => l.trim());
    const rows = lines
      .filter((l: string) => /^0x[0-9a-fA-F]{40}/.test(l.trim()))
      .map((l: string) => {
        const parts = l.split(',');
        return { address: parts[0].trim().toLowerCase(), amount: parts[1]?.trim() ?? null };
      });
    return { rows, hasAmounts: lines[0]?.includes(',') ?? false };
  },
  createPipeline: () => {
    const pipeline = {
      addSource: (...args: unknown[]) => {
        mockAddSource(...args);
        return pipeline;
      },
      execute: (...args: unknown[]) => mockExecute(...args),
    };
    return pipeline;
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
    parseCSVShouldThrow = false;
    mockUseChainValue = {
      publicClient: mockPublicClient,
      explorerBus: null,
      rpcBus: null,
      chainConfig: mockChainConfig,
    };
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

  it('shows error when FileReader triggers onerror for file input', async () => {
    const OriginalFileReader = globalThis.FileReader;
    let capturedReader: { onload: (() => void) | null; onerror: (() => void) | null; readAsText: ReturnType<typeof vi.fn>; result: string | null };
    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsText = vi.fn(() => {
        // Trigger onerror instead of onload
        setTimeout(() => this.onerror?.(), 0);
      });
      constructor() {
        capturedReader = this;
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    render(<AddressesStep />);
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('Failed to read file.')).toBeInTheDocument();
    });

    vi.stubGlobal('FileReader', OriginalFileReader);
  });

  it('shows error when FileReader triggers onerror for dropped file', async () => {
    const OriginalFileReader = globalThis.FileReader;
    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsText = vi.fn(() => {
        setTimeout(() => this.onerror?.(), 0);
      });
    }
    vi.stubGlobal('FileReader', MockFileReader);

    render(<AddressesStep />);
    const file = new File(['content'], 'dropped.csv', { type: 'text/csv' });
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('Failed to read file.')).toBeInTheDocument();
    });

    vi.stubGlobal('FileReader', OriginalFileReader);
  });

  it('does not save when no addresses are loaded', () => {
    render(<AddressesStep />);
    const button = screen.getByText('Save & Continue');
    fireEvent.click(button);
    // handleContinue early-returns because addresses.length === 0
    expect(mockPutAddressSet).not.toHaveBeenCalled();
    expect(mockSetActiveStep).not.toHaveBeenCalled();
  });

  it('opens file input when Enter key is pressed on drop zone', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });
    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.keyDown(dropZone, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('opens file input when Space key is pressed on drop zone', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });
    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.keyDown(dropZone, { key: ' ' });

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('does not open file input when other keys are pressed on drop zone', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });
    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.keyDown(dropZone, { key: 'Tab' });

    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('applies drag over styling class when dragging and removes on leave', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });

    // Drag over adds the class
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.className).toContain('bg-blue-500/5');

    // Drag leave removes the class
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain('bg-blue-500/5');
  });

  it('shows error when parseCSV throws an Error', async () => {
    parseCSVShouldThrow = true;

    render(<AddressesStep />);
    const csvContent = '0x1234567890abcdef1234567890abcdef12345678';
    const file = new File([csvContent], 'boom.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText('CSV parse explosion')).toBeInTheDocument();
    });
  });

  it('does nothing when drop has no file', () => {
    render(<AddressesStep />);
    const dropZone = screen.getByRole('button', { name: /Drop a CSV/i });
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } });
    expect(screen.queryByText(/addresses loaded/)).not.toBeInTheDocument();
  });

  // --- On-Chain Collection Tests ---

  it('shows on-chain collection toggle', () => {
    render(<AddressesStep />);
    expect(screen.getByText('Collect from chain')).toBeInTheDocument();
  });

  it('shows block scan params when on-chain collection is expanded', () => {
    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    expect(screen.getByText('Block Scan')).toBeInTheDocument();
    expect(screen.getByText('Explorer Scan')).toBeInTheDocument();
    expect(screen.getByText('Start Block')).toBeInTheDocument();
    expect(screen.getByText('End Block')).toBeInTheDocument();
  });

  it('shows explorer scan params with contract address field', () => {
    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Explorer Scan'));
    expect(screen.getByText('Contract Address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
  });

  it('toggles back to hide text when expanded', () => {
    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    expect(screen.getByText('Hide on-chain collection')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide on-chain collection'));
    expect(screen.getByText('Collect from chain')).toBeInTheDocument();
  });

  it('resets source params when switching source type', () => {
    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));

    // Switch to explorer-scan and enter a contract address
    fireEvent.click(screen.getByText('Explorer Scan'));
    const contractInput = screen.getByPlaceholderText('0x...');
    fireEvent.change(contractInput, { target: { value: '0xabc' } });
    expect(contractInput).toHaveValue('0xabc');

    // Switch back to block-scan — params should be reset
    fireEvent.click(screen.getByText('Block Scan'));
    expect(screen.queryByPlaceholderText('0x...')).not.toBeInTheDocument();
  });

  it('collects addresses from pipeline and merges with existing', async () => {
    const addr1 = '0x1111111111111111111111111111111111111111';
    const addr2 = '0x2222222222222222222222222222222222222222';

    mockExecute.mockImplementation(async function* () {
      yield [addr1, addr2];
    });

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('2 addresses collected')).toBeInTheDocument();
    });

    expect(screen.getByText('2 addresses loaded')).toBeInTheDocument();
    expect(screen.getByText(addr1)).toBeInTheDocument();
    expect(screen.getByText(addr2)).toBeInTheDocument();
  });

  it('deduplicates collected addresses against existing ones', async () => {
    const existingAddr = '0x1234567890abcdef1234567890abcdef12345678';
    const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    mockExecute.mockImplementation(async function* () {
      yield [existingAddr, newAddr];
    });

    render(<AddressesStep />);

    // First: load an address manually
    const textarea = screen.getByPlaceholderText(/Paste addresses/);
    fireEvent.change(textarea, { target: { value: existingAddr } });
    fireEvent.click(screen.getByText('Parse Addresses'));
    expect(screen.getByText('1 addresses loaded')).toBeInTheDocument();

    // Then: collect from chain (includes the same address + a new one)
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('2 addresses collected')).toBeInTheDocument();
    });

    // Should have 2 total (deduped), not 3
    expect(screen.getByText('2 addresses loaded')).toBeInTheDocument();
  });

  it('shows error when collection fails', async () => {
    mockExecute.mockImplementation(async function* () {
      throw new Error('RPC connection failed');
    });

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('RPC connection failed')).toBeInTheDocument();
    });
  });

  it('shows error when pipeline yields no addresses', async () => {
    mockExecute.mockImplementation(async function* () {
      // yields nothing
    });

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('No addresses found.')).toBeInTheDocument();
    });
  });

  it('disables collect button when no publicClient', () => {
    mockUseChainValue = {
      publicClient: null as unknown,
      explorerBus: null,
      rpcBus: null,
      chainConfig: null,
    };

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));

    const collectButton = screen.getByText('Collect Addresses');
    expect(collectButton).toBeDisabled();
    expect(screen.getByText('Connect to a chain to use on-chain collection.')).toBeInTheDocument();
  });

  it('shows generic error when non-Error is thrown', async () => {
    mockExecute.mockImplementation(async function* () {
      throw 'string error';
    });

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('Collection failed')).toBeInTheDocument();
    });
  });

  it('passes explorer config from chain config for explorer-scan', async () => {
    const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    mockExecute.mockImplementation(async function* () {
      yield [addr];
    });

    render(<AddressesStep />);
    fireEvent.click(screen.getByText('Collect from chain'));
    fireEvent.click(screen.getByText('Explorer Scan'));

    const contractInput = screen.getByPlaceholderText('0x...');
    fireEvent.change(contractInput, { target: { value: '0xtoken' } });

    fireEvent.click(screen.getByText('Collect Addresses'));

    await waitFor(() => {
      expect(screen.getByText('1 addresses collected')).toBeInTheDocument();
    });

    expect(mockAddSource).toHaveBeenCalledWith('explorer-scan', expect.objectContaining({
      explorerApiUrl: 'https://api.etherscan.io/api',
      apiKey: 'test-key',
      tokenAddress: '0xtoken',
    }));
    // contractAddress should be removed
    expect(mockAddSource.mock.calls[0][1]).not.toHaveProperty('contractAddress');
  });
});
