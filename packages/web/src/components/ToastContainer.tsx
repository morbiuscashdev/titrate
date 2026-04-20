import type { Toast } from '../providers/ToastProvider.js';
import { useMode } from '../theme/index.js';

/**
 * Maps a toast type to its brand accent token. The stripe/border picks this
 * colour up; body text always reads `--fg-primary` so contrast stays WCAG-safe
 * on both cream and ink backgrounds.
 */
const ACCENT_BY_TYPE: Record<Toast['type'], string> = {
  success: 'var(--color-ok)',
  error: 'var(--color-err)',
  info: 'var(--color-info)',
};

export type ToastContainerProps = {
  readonly toasts: readonly Toast[];
};

/**
 * Renders a stack of toast notifications in the bottom-right corner.
 * Chrome switches between the brutalist 2px-border + hard-shadow look and
 * the operator lg-rounded ring+shadow look based on the current mode.
 */
export function ToastContainer({ toasts }: ToastContainerProps) {
  const mode = useMode();
  const chrome = mode === 'brutalist'
    ? 'rounded-none border-2 border-[color:var(--edge)] shadow-[4px_4px_0_var(--shadow-color)]'
    : 'rounded-lg ring-1 ring-[color:var(--edge)]/30 shadow-xl';

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          data-toast-type={toast.type}
          className={`flex items-center gap-3 bg-[color:var(--bg-card)] px-4 py-3 font-mono text-sm text-[color:var(--fg-primary)] ${chrome}`}
        >
          <span
            aria-hidden="true"
            className="inline-block h-full w-1 self-stretch"
            style={{ backgroundColor: ACCENT_BY_TYPE[toast.type] }}
          />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
