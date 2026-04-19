import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

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

  const handleRefresh = async () => {
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.error('[ReloadPrompt] SW update failed:', err);
    }
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 bg-[color:var(--bg-card)] border-2 border-[color:var(--edge)] shadow-[4px_4px_0_var(--shadow-color)] px-4 py-3 font-mono text-sm text-[color:var(--fg-primary)]">
      <span>New version available.</span>
      <Button variant="primary" size="sm" onClick={handleRefresh}>
        Refresh
      </Button>
    </div>
  );
}
