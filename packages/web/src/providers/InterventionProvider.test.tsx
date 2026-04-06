import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  InterventionProvider,
  useIntervention,
} from './InterventionProvider.js';
import type { ReactNode } from 'react';
import type { InterventionContext, InterventionAction } from '@titrate/sdk';

const wrapper = ({ children }: { children: ReactNode }) => (
  <InterventionProvider>{children}</InterventionProvider>
);

describe('InterventionProvider', () => {
  it('renders children', () => {
    render(
      <InterventionProvider>
        <div data-testid="child">hello</div>
      </InterventionProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('provides initial inactive state', () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });
    expect(result.current.state.isActive).toBe(false);
    expect(result.current.state.context).toBeNull();
    expect(result.current.state.resolve).toBeNull();
  });

  it('createInterventionHook returns a function', () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });
    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });
    expect(typeof hook!).toBe('function');
  });

  it('auto-approves when point is not enabled', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    // 'batch-preview' is not in the default enabled set
    const context: InterventionContext = {
      point: 'batch-preview',
      campaignId: 'test-campaign',
    };

    const action = await hook!(context);
    expect(action).toEqual({ type: 'approve' });
    // State should remain inactive since it was auto-approved
    expect(result.current.state.isActive).toBe(false);
  });

  it('pauses and waits when point is enabled', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    // 'stuck-transaction' is enabled by default
    const context: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
      txHash: '0xabc123',
    };

    let resolved = false;
    let resolvedAction: InterventionAction | null = null;

    const promise = hook!(context).then((action) => {
      resolved = true;
      resolvedAction = action;
    });

    // Wait for React state update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should now be active
    expect(result.current.state.isActive).toBe(true);
    expect(result.current.state.context?.point).toBe('stuck-transaction');
    expect(resolved).toBe(false);

    // Resolve the intervention
    act(() => {
      result.current.dismiss({ type: 'abort' });
    });

    await promise;
    expect(resolved).toBe(true);
    expect(resolvedAction).toEqual({ type: 'abort' });
  });

  it('clears state after dismiss', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    const context: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
    };

    const promise = hook!(context);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.state.isActive).toBe(true);

    act(() => {
      result.current.dismiss({ type: 'approve' });
    });

    await promise;

    expect(result.current.state.isActive).toBe(false);
    expect(result.current.state.context).toBeNull();
    expect(result.current.state.resolve).toBeNull();
  });

  it('setEnabledPoints updates which points are active', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    // Enable batch-preview
    act(() => {
      result.current.setEnabledPoints(new Set(['batch-preview', 'stuck-transaction']));
    });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    const context: InterventionContext = {
      point: 'batch-preview',
      campaignId: 'test-campaign',
    };

    const promise = hook!(context);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should pause because batch-preview is now enabled
    expect(result.current.state.isActive).toBe(true);

    act(() => {
      result.current.dismiss({ type: 'approve' });
    });

    await promise;
  });
});

describe('useIntervention', () => {
  it('throws when called outside InterventionProvider', () => {
    expect(() => {
      renderHook(() => useIntervention());
    }).toThrow('useIntervention must be used within an InterventionProvider');
  });

  it('returns context when called inside InterventionProvider', () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });
    expect(result.current).toHaveProperty('state');
    expect(result.current).toHaveProperty('createInterventionHook');
    expect(result.current).toHaveProperty('enabledPoints');
    expect(result.current).toHaveProperty('setEnabledPoints');
    expect(result.current).toHaveProperty('dismiss');
    expect(result.current).toHaveProperty('journal');
    expect(result.current).toHaveProperty('clearJournal');
  });
});

describe('Intervention journal', () => {
  it('starts with an empty journal', () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });
    expect(result.current.journal).toEqual([]);
  });

  it('records a journal entry when an intervention is dismissed', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    const context: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
      txHash: '0xabc123',
    };

    const promise = hook!(context);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.state.isActive).toBe(true);

    act(() => {
      result.current.dismiss({ type: 'abort' });
    });

    await promise;

    expect(result.current.journal).toHaveLength(1);
    expect(result.current.journal[0]).toMatchObject({
      campaignId: 'test-campaign',
      point: 'stuck-transaction',
      action: 'abort',
      issueCount: 0,
    });
    expect(result.current.journal[0]!.timestamp).toBeGreaterThan(0);
  });

  it('records issueCount from context issues', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    // Enable validation-warning point
    act(() => {
      result.current.setEnabledPoints(new Set(['validation-warning']));
    });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    const context: InterventionContext = {
      point: 'validation-warning',
      campaignId: 'test-campaign',
      issues: [
        { code: 'W001', severity: 'warning' as const, message: 'Something', field: 'address', index: 0 },
        { code: 'W002', severity: 'warning' as const, message: 'Other', field: 'amount', index: 1 },
      ],
    };

    const promise = hook!(context);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.dismiss({ type: 'overrideWarnings' });
    });

    await promise;

    expect(result.current.journal).toHaveLength(1);
    expect(result.current.journal[0]!.issueCount).toBe(2);
  });

  it('accumulates multiple journal entries', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    // First intervention
    const context1: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
      txHash: '0x111',
    };
    const promise1 = hook!(context1);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      result.current.dismiss({ type: 'retry' });
    });
    await promise1;

    // Re-create hook after state clears (enabledPoints unchanged so hook is stable)
    act(() => {
      hook = result.current.createInterventionHook();
    });

    // Second intervention
    const context2: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
      txHash: '0x222',
    };
    const promise2 = hook!(context2);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      result.current.dismiss({ type: 'abort' });
    });
    await promise2;

    expect(result.current.journal).toHaveLength(2);
    expect(result.current.journal[0]!.action).toBe('retry');
    expect(result.current.journal[1]!.action).toBe('abort');
  });

  it('clears journal with clearJournal', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    const context: InterventionContext = {
      point: 'stuck-transaction',
      campaignId: 'test-campaign',
    };
    const promise = hook!(context);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      result.current.dismiss({ type: 'approve' });
    });
    await promise;

    expect(result.current.journal).toHaveLength(1);

    act(() => {
      result.current.clearJournal();
    });

    expect(result.current.journal).toEqual([]);
  });

  it('does not record journal entry for auto-approved interventions', async () => {
    const { result } = renderHook(() => useIntervention(), { wrapper });

    let hook: ReturnType<typeof result.current.createInterventionHook>;
    act(() => {
      hook = result.current.createInterventionHook();
    });

    // batch-preview is not enabled by default, so it auto-approves
    const context: InterventionContext = {
      point: 'batch-preview',
      campaignId: 'test-campaign',
    };

    const action = await hook!(context);
    expect(action).toEqual({ type: 'approve' });
    expect(result.current.journal).toEqual([]);
  });
});
