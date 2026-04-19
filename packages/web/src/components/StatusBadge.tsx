import { useMode } from '../theme';

export type StatusBadgeProps = {
  readonly status: 'pending' | 'active' | 'complete' | 'error' | 'locked';
  readonly label?: string;
};

const OPERATOR_TONE: Record<StatusBadgeProps['status'], string> = {
  pending: 'bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-500)] border border-[color:var(--color-ink-700)]',
  active: 'bg-[color:var(--color-info)]/10 text-[color:var(--color-info)] border border-[color:var(--color-info)]/30',
  complete: 'bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)] border border-[color:var(--color-ok)]/30',
  error: 'bg-[color:var(--color-err)]/10 text-[color:var(--color-err)] border border-[color:var(--color-err)]/30',
  locked: 'bg-[color:var(--color-ink-800)]/60 text-[color:var(--color-ink-500)]/70 border border-[color:var(--color-ink-700)]/50',
};

const BRUTALIST_TONE: Record<StatusBadgeProps['status'], string> = {
  pending: 'bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]',
  active: 'bg-[color:var(--color-chip-yellow)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]',
  complete: 'bg-[color:var(--color-chip-green)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]',
  error: 'bg-[color:var(--color-chip-pink)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]',
  locked: 'bg-[color:var(--color-cream-100)] text-[color:var(--color-cream-700)] border-2 border-[color:var(--edge)]',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const mode = useMode();
  const base = mode === 'brutalist'
    ? 'inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5'
    : 'inline-flex items-center font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full';
  const toneClass = mode === 'brutalist' ? BRUTALIST_TONE[status] : OPERATOR_TONE[status];
  return (
    <span data-status={status} className={`${base} ${toneClass}`}>
      {label ?? status}
    </span>
  );
}
