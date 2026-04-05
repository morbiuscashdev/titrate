import type { Toast } from '../providers/ToastProvider.js';

const colorsByType: Record<Toast['type'], string> = {
  success: 'bg-green-100 dark:bg-green-900/90 text-green-700 dark:text-green-300 ring-green-300 dark:ring-green-800',
  error: 'bg-red-100 dark:bg-red-900/90 text-red-700 dark:text-red-300 ring-red-300 dark:ring-red-800',
  info: 'bg-gray-100 dark:bg-gray-900/90 text-gray-700 dark:text-gray-300 ring-gray-300 dark:ring-gray-700',
};

export type ToastContainerProps = {
  readonly toasts: readonly Toast[];
};

/**
 * Renders a stack of toast notifications in the bottom-right corner.
 */
export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ${colorsByType[toast.type]}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
