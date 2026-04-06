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
  });
});
