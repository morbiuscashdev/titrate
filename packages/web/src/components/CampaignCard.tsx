import { StatusBadge } from './StatusBadge.js';

export type CampaignCardProps = {
  readonly name: string;
  readonly chainName: string;
  readonly tokenSymbol: string;
  readonly addressCount: number;
  readonly batchProgress: { readonly completed: number; readonly total: number };
  readonly status: 'draft' | 'ready' | 'distributing' | 'complete';
  readonly onClick?: () => void;
};

const statusMap: Record<CampaignCardProps['status'], 'pending' | 'active' | 'complete' | 'error' | 'locked'> = {
  draft: 'pending',
  ready: 'active',
  distributing: 'active',
  complete: 'complete',
};

export function CampaignCard({ name, chainName, tokenSymbol, addressCount, batchProgress, status, onClick }: CampaignCardProps) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick?.()} className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800 hover:ring-gray-700 cursor-pointer transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white min-w-0 truncate">{name}</h3>
        <StatusBadge status={statusMap[status]} label={status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        <span>{chainName}</span>
        <span>&middot;</span>
        <span>{tokenSymbol}</span>
        <span>&middot;</span>
        <span>{addressCount.toLocaleString()} addresses</span>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Batches</span>
          <span>{batchProgress.completed} / {batchProgress.total}</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full">
          <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: batchProgress.total > 0 ? `${(batchProgress.completed / batchProgress.total) * 100}%` : '0%' }} />
        </div>
      </div>
    </div>
  );
}
