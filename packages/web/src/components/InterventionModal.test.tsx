import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InterventionModal } from './InterventionModal.js';
import {
  InterventionProvider,
  useIntervention,
} from '../providers/InterventionProvider.js';
import type { InterventionContext, InterventionAction } from '@titrate/sdk';

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: {
      appSettings: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    isUnlocked: false,
    unlock: vi.fn(),
  }),
}));

vi.mock('@titrate/sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@titrate/sdk');
  return {
    ...actual,
    createSpotCheck: (
      addresses: string[],
      explorerUrl: string,
      options?: { sampleSize?: number; amounts?: bigint[] },
    ) => {
      const baseUrl = explorerUrl.endsWith('/') ? explorerUrl.slice(0, -1) : explorerUrl;
      const size = Math.min(options?.sampleSize ?? 5, addresses.length);
      return {
        samples: addresses.slice(0, size).map((addr, i) => ({
          index: i,
          address: addr,
          amount: options?.amounts?.[i],
          explorerUrl: `${baseUrl}/address/${addr}`,
        })),
        totalCount: addresses.length,
        sampleSize: size,
      };
    },
  };
});

/**
 * Helper that renders the InterventionModal inside its provider
 * and provides a way to trigger an intervention via the hook.
 */
function TestHarness() {
  const { createInterventionHook, enabledPoints, setEnabledPoints } = useIntervention();
  return (
    <div>
      <button
        data-testid="enable-all"
        onClick={() =>
          setEnabledPoints(
            new Set([
              'batch-preview',
              'batch-result',
              'stuck-transaction',
              'validation-warning',
              'validation-error',
              'address-review',
              'filter-review',
              'amount-review',
            ]),
          )
        }
      >
        Enable All
      </button>
      <button
        data-testid="trigger-batch-preview"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'batch-preview',
            campaignId: 'test',
            batchIndex: 3,
            addresses: ['0x1111111111111111111111111111111111111111' as const],
            amounts: [1000n],
          });
        }}
      >
        Trigger Batch Preview
      </button>
      <button
        data-testid="trigger-batch-preview-multi"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'batch-preview',
            campaignId: 'test',
            batchIndex: 2,
            addresses: [
              '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as const,
              '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as const,
              '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as const,
            ],
            amounts: [500n, 300n, 200n],
          });
        }}
      >
        Trigger Batch Preview Multi
      </button>
      <button
        data-testid="trigger-stuck"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'stuck-transaction',
            campaignId: 'test',
            txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          });
        }}
      >
        Trigger Stuck
      </button>
      <button
        data-testid="trigger-validation-warning"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'validation-warning',
            campaignId: 'test',
            issues: [
              { severity: 'warning', row: 0, field: 'address', value: '0x...', message: 'Duplicate address found', code: 'DUPLICATE_ADDRESS' },
              { severity: 'warning', row: 1, field: 'amount', value: '0', message: 'Zero amount detected', code: 'ZERO_AMOUNT' },
            ],
          });
        }}
      >
        Trigger Warning
      </button>
      <button
        data-testid="trigger-validation-error"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'validation-error',
            campaignId: 'test',
            issues: [
              { severity: 'error', row: 0, field: 'address', value: 'bad', message: 'Invalid hex format', code: 'INVALID_HEX' },
            ],
          });
        }}
      >
        Trigger Error
      </button>
      <button
        data-testid="trigger-batch-result"
        onClick={() => {
          const hook = createInterventionHook();
          void hook({
            point: 'batch-result',
            campaignId: 'test',
            batchIndex: 1,
            txHash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          });
        }}
      >
        Trigger Result
      </button>
      <InterventionModal />
    </div>
  );
}

function renderWithProvider() {
  return render(
    <InterventionProvider>
      <TestHarness />
    </InterventionProvider>,
  );
}

describe('InterventionModal', () => {
  it('shows nothing when not active', () => {
    renderWithProvider();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows batch-preview content when triggered', async () => {
    renderWithProvider();

    // Enable all points first
    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-batch-preview').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Batch Preview')).toBeInTheDocument();
    expect(screen.getByText(/Batch #3/)).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Skip')).toBeInTheDocument();
    expect(screen.getByText('Abort')).toBeInTheDocument();
  });

  it('shows stuck-transaction content', async () => {
    renderWithProvider();

    // stuck-transaction is enabled by default
    act(() => {
      screen.getByTestId('trigger-stuck').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Stuck Transaction')).toBeInTheDocument();
    expect(screen.getByText(/appears to be stuck/)).toBeInTheDocument();
    expect(screen.getByText('Bump Gas (1.5x)')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Abort')).toBeInTheDocument();
  });

  it('shows validation-warning content', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-validation-warning').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Validation Warnings')).toBeInTheDocument();
    expect(screen.getByText(/2 warnings found/)).toBeInTheDocument();
    expect(screen.getByText('Duplicate address found')).toBeInTheDocument();
    expect(screen.getByText('Zero amount detected')).toBeInTheDocument();
    expect(screen.getByText('Override')).toBeInTheDocument();
  });

  it('shows validation-error content', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-validation-error').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Validation Errors')).toBeInTheDocument();
    expect(screen.getByText(/1 error found/)).toBeInTheDocument();
    expect(screen.getByText('Invalid hex format')).toBeInTheDocument();
    expect(screen.getByText('Abort')).toBeInTheDocument();
    // Should not have an Approve button for errors
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('shows batch-result content with tx hash explorer link', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-batch-result').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Batch Result')).toBeInTheDocument();
    expect(screen.getByText(/Batch #1 confirmed/)).toBeInTheDocument();

    // Tx hash should be a clickable explorer link
    const txLink = screen.getByRole('link');
    expect(txLink).toHaveAttribute(
      'href',
      'https://etherscan.io/tx/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );

    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('shows stuck-transaction tx hash as explorer link', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('trigger-stuck').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const txLink = screen.getByRole('link');
    expect(txLink).toHaveAttribute(
      'href',
      'https://etherscan.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    );
  });

  it('Approve button resolves action and closes modal', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-batch-preview').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      screen.getByText('Approve').click();
    });

    // Modal should be dismissed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Abort button resolves abort action and closes modal', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('trigger-stuck').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      screen.getByText('Abort').click();
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows spot check samples in batch-preview modal', async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId('enable-all').click();
    });

    act(() => {
      screen.getByTestId('trigger-batch-preview-multi').click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Spot check header
    expect(screen.getByText('Spot Check (3 of 3)')).toBeInTheDocument();

    // Truncated addresses: first 10 chars + "..." + last 6 chars
    expect(screen.getByText('0xAAAAAAAA...AAAAAA')).toBeInTheDocument();
    expect(screen.getByText('0xBBBBBBBB...BBBBBB')).toBeInTheDocument();
    expect(screen.getByText('0xCCCCCCCC...CCCCCC')).toBeInTheDocument();

    // Token amounts
    expect(screen.getByText('500 tokens')).toBeInTheDocument();
    expect(screen.getByText('300 tokens')).toBeInTheDocument();
    expect(screen.getByText('200 tokens')).toBeInTheDocument();

    // Explorer links
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://etherscan.io/address/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(links[1]).toHaveAttribute(
      'href',
      'https://etherscan.io/address/0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    );
    expect(links[2]).toHaveAttribute(
      'href',
      'https://etherscan.io/address/0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    );
  });
});
