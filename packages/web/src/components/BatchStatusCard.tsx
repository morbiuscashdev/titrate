import { StatusBadge } from './StatusBadge.js';

export type BatchStatusCardProps = {
  readonly batchIndex: number;
  readonly recipientCount: number;
  readonly status: 'pending' | 'confirmed' | 'failed';
  readonly txHash?: string;
  readonly explorerUrl?: string;
  readonly gasEstimate?: string;
};

const statusToBadge: Record<BatchStatusCardProps['status'], 'pending' | 'complete' | 'error'> = {
  pending: 'pending',
  confirmed: 'complete',
  failed: 'error',
};

export function BatchStatusCard({ batchIndex, recipientCount, status, txHash, explorerUrl, gasEstimate }: BatchStatusCardProps) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 ring-1 ring-gray-200 dark:ring-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-white">Batch #{batchIndex + 1}</span>
        <StatusBadge status={statusToBadge[status]} label={status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{recipientCount} recipients</span>
        {gasEstimate && <span>Gas: {gasEstimate}</span>}
        {txHash && explorerUrl && (
          <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-mono">{txHash.slice(0, 10)}…</a>
        )}
        {txHash && !explorerUrl && <span className="font-mono">{txHash.slice(0, 10)}…</span>}
      </div>
    </div>
  );
}
