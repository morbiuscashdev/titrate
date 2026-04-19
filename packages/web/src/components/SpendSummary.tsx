import { Card } from './ui';

export type SpendSummaryProps = {
  readonly totalGasEstimate: string;
  readonly totalTokensSent: string;
  readonly tokenSymbol: string;
  readonly uniqueRecipients: number;
  readonly batchCount: number;
  readonly confirmedBatches: number;
  readonly failedBatches: number;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-muted)]">{label}</p>
      <p className="mt-1 font-sans text-base sm:text-lg font-semibold text-[color:var(--fg-primary)] truncate">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </Card>
  );
}

export function SpendSummary({ totalGasEstimate, totalTokensSent, uniqueRecipients, confirmedBatches, failedBatches }: SpendSummaryProps) {
  return (
    <div>
      <h3 className="font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)] mb-4">Distribution Summary</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Stat label="Tokens sent" value={totalTokensSent} />
        <Stat label="Gas (est.)" value={totalGasEstimate} />
        <Stat label="Recipients" value={uniqueRecipients} />
        <Stat label="Confirmed" value={confirmedBatches} />
      </div>
      {failedBatches > 0 && (
        <div className="mt-3 border-2 border-[color:var(--color-err)]/40 bg-[color:var(--color-err)]/10 p-3 font-mono text-sm text-[color:var(--color-err)]">
          {failedBatches} batch{failedBatches > 1 ? 'es' : ''} failed
        </div>
      )}
    </div>
  );
}
