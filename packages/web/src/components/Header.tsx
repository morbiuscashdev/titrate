import type { ReactNode } from 'react';
import { Mark } from './ui/Mark.js';
import { ThemeToggle } from './ui/ThemeToggle.js';

/**
 * Props for the global Header component.
 * @property children - Wallet badge slot; WalletProvider injects the badge here.
 */
export type HeaderProps = {
  readonly children?: ReactNode;
};

/**
 * Global header bar present on all routes.
 *
 * Left side: brand mark + "Titrate" wordmark linking to `/`.
 * Right side: theme toggle, settings gear link, and a wallet badge slot via `children`.
 */
export function Header({ children }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b-2 border-[color:var(--edge)] bg-[color:var(--bg-page)] px-4 py-3">
      <a
        href="/"
        className="flex items-center gap-2 font-sans font-extrabold tracking-[-0.02em] text-lg text-[color:var(--fg-primary)] hover:text-[color:var(--color-pink-600)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-info)] rounded-md"
      >
        <span className="text-[color:var(--mark-color,#d63384)]">
          <Mark size={24} />
        </span>
        Titrate
      </a>
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <ThemeToggle />
        <a
          href="/settings"
          aria-label="Settings"
          className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-info)] rounded-md"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <circle cx={12} cy={12} r={3} />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
          </svg>
        </a>
        {children}
      </div>
    </header>
  );
}
