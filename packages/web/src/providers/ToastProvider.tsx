import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ToastContainer } from '../components/ToastContainer.js';
import type { ReactNode } from 'react';

export type Toast = {
  readonly id: string;
  readonly message: string;
  readonly type: 'success' | 'error' | 'info';
};

export type ToastContextValue = {
  readonly toasts: readonly Toast[];
  readonly addToast: (message: string, type?: Toast['type']) => void;
  readonly removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Auto-dismiss delay in milliseconds. */
const AUTO_DISMISS_MS = 4_000;

export type ToastProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provides toast notification state to the component tree.
 *
 * Each toast auto-dismisses after 4 seconds. The provider renders a
 * `ToastContainer` overlay at the bottom-right of the viewport.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = crypto.randomUUID();
      const toast: Toast = { id, message, type };
      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        removeToast(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

/**
 * Access the toast notification context.
 *
 * @throws When called outside of a `<ToastProvider>`.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
