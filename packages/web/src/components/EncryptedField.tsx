/**
 * Props for the EncryptedField component.
 * @property ciphertext - The raw encrypted ciphertext string.
 * @property onUnlock - Called when the user clicks the lock icon to request decryption.
 */
export type EncryptedFieldProps = {
  readonly ciphertext: string;
  readonly onUnlock?: () => void;
};

/** Maximum visible characters before truncation. */
const TRUNCATE_LENGTH = 12;

/**
 * Renders encrypted ciphertext in a truncated, monospace display with a lock icon.
 * Clicking the lock triggers the `onUnlock` callback to request decryption.
 */
export function EncryptedField({ ciphertext, onUnlock }: EncryptedFieldProps) {
  const truncated = ciphertext.length > TRUNCATE_LENGTH
    ? `${ciphertext.slice(0, TRUNCATE_LENGTH)}...`
    : ciphertext;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm text-[color:var(--fg-muted)]">
      <span aria-label="Encrypted value">{truncated}</span>
      <button
        type="button"
        onClick={onUnlock}
        aria-label="Unlock"
        className="cursor-pointer text-[color:var(--fg-muted)] hover:text-[color:var(--color-pink-600)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </button>
    </span>
  );
}
