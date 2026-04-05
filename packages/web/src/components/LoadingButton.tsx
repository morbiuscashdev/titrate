import type { ReactNode } from 'react';

export type LoadingButtonProps = {
  readonly isLoading: boolean;
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly variant?: 'primary' | 'secondary';
};

/**
 * Button with an inline spinner shown during async operations.
 *
 * Automatically disables the button while loading to prevent double-submits.
 */
export function LoadingButton({
  isLoading,
  children,
  onClick,
  disabled,
  className,
  variant = 'primary',
}: LoadingButtonProps) {
  const base =
    variant === 'primary'
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-gray-800 hover:bg-gray-700 text-gray-300';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 ${base} ${className ?? ''}`}
    >
      {isLoading && <Spinner />}
      {children}
    </button>
  );
}

/** Animated SVG spinner matching the button text color. */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
    </svg>
  );
}
