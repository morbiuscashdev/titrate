import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Persistent banner shown when a new service worker is waiting to activate.
 *
 * Rendered in App.tsx. Does not use the toast system because toasts
 * auto-dismiss — this must stay visible until the user acts.
 */
export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
      <span>New version available.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}
