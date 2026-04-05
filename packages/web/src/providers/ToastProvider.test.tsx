import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider.js';
import type { ReactNode } from 'react';

// Stub crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `toast-${++uuidCounter}`,
});

beforeEach(() => {
  vi.useFakeTimers();
  uuidCounter = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">hello</div>
      </ToastProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('addToast adds a toast', () => {
    function Consumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast('Test message', 'success')}>Add</button>
          <span data-testid="count">{toasts.length}</span>
        </div>
      );
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');

    act(() => {
      screen.getByText('Add').click();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('removeToast removes a toast', () => {
    function Consumer() {
      const { toasts, addToast, removeToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast('Remove me', 'error')}>Add</button>
          <button onClick={() => { if (toasts.length > 0) removeToast(toasts[0].id); }}>Remove</button>
          <span data-testid="count">{toasts.length}</span>
        </div>
      );
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText('Add').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      screen.getByText('Remove').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('auto-removes toast after timeout', () => {
    function Consumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast('Temporary')}>Add</button>
          <span data-testid="count">{toasts.length}</span>
        </div>
      );
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText('Add').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('defaults toast type to info', () => {
    function Consumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast('Info toast')}>Add</button>
          <span data-testid="type">{toasts[0]?.type ?? 'none'}</span>
        </div>
      );
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText('Add').click();
    });
    expect(screen.getByTestId('type')).toHaveTextContent('info');
  });
});

describe('useToast', () => {
  it('throws when called outside ToastProvider', () => {
    expect(() => {
      renderHook(() => useToast());
    }).toThrow('useToast must be used within a ToastProvider');
  });

  it('returns context when called inside ToastProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    );

    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current).toHaveProperty('toasts');
    expect(result.current).toHaveProperty('addToast');
    expect(result.current).toHaveProperty('removeToast');
  });
});
