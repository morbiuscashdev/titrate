import { StatusBadge } from './StatusBadge.js';
import { Card } from './ui';

export type CampaignCardProps = {
  readonly name: string;
  readonly chainName: string;
  readonly tokenSymbol: string;
  readonly addressCount: number;
  readonly batchProgress: { readonly completed: number; readonly total: number };
  readonly status: 'draft' | 'ready' | 'distributing' | 'complete' | 'resumable';
  readonly onClick?: () => void;
};

const statusMap: Record<CampaignCardProps['status'], 'pending' | 'active' | 'complete' | 'error' | 'locked'> = {
  draft: 'pending',
  ready: 'active',
  distributing: 'active',
  resumable: 'error',
  complete: 'complete',
};

export function CampaignCard({ name, chainName, tokenSymbol, addressCount, batchProgress, status, onClick }: CampaignCardProps) {
  const percent = batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className="cursor-pointer transition-[transform,box-shadow] duration-[80ms] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--shadow-color)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)] min-w-0 truncate">{name}</h3>
        {/* Fades out when the card wrapper (which carries the `group` class
            in HomePage) is hovered, so the floating action buttons don't
            stack on top of the status tag. */}
        <span className="transition-opacity group-hover:opacity-0 group-hover:pointer-events-none group-focus-within:opacity-0 group-focus-within:pointer-events-none">
          <StatusBadge status={statusMap[status]} label={status} />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[color:var(--fg-muted)]">
        <span>{chainName}</span>
        <span>&middot;</span>
        <span>{tokenSymbol}</span>
        <span>&middot;</span>
        <span>{addressCount.toLocaleString()} addresses</span>
      </div>
      <div className="mt-3">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-muted)] mb-1">
          <span>Batches</span>
          <span>{batchProgress.completed} / {batchProgress.total}</span>
        </div>
        <div className="h-1.5 bg-[color:var(--edge)]/40">
          <div
            data-progress-bar
            className="h-1.5 bg-[color:var(--color-pink-500)] transition-[width] duration-[240ms]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
