import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InterventionModal } from './InterventionModal.js';
import {
  InterventionProvider,
  useIntervention,
} from '../providers/InterventionProvider.js';
import type { InterventionContext, InterventionAction } from '@titrate/sdk';

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

  it('shows batch-result content with tx hash', async () => {
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
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
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
});
