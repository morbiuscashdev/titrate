import { StatusBadge } from './StatusBadge.js';
import { Card } from './ui';

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
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-[color:var(--fg-primary)]">Batch #{batchIndex + 1}</span>
        <StatusBadge status={statusToBadge[status]} label={status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[color:var(--fg-muted)]">
        <span>{recipientCount} recipients</span>
        {gasEstimate && <span>Gas: {gasEstimate}</span>}
        {txHash && explorerUrl && (
          <a
            href={`${explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--color-pink-400)] hover:text-[color:var(--color-pink-300)] underline decoration-dotted"
          >
            {txHash.slice(0, 10)}…
          </a>
        )}
        {txHash && !explorerUrl && <span>{txHash.slice(0, 10)}…</span>}
      </div>
    </Card>
  );
}
