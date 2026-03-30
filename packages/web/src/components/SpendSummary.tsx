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
    <div className="bg-gray-900 rounded-lg p-4 ring-1 ring-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

export function SpendSummary({ totalGasEstimate, totalTokensSent, uniqueRecipients, confirmedBatches, failedBatches }: SpendSummaryProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-4">Distribution Summary</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Tokens sent" value={totalTokensSent} />
        <Stat label="Gas (est.)" value={totalGasEstimate} />
        <Stat label="Recipients" value={uniqueRecipients} />
        <Stat label="Confirmed" value={confirmedBatches} />
      </div>
      {failedBatches > 0 && (
        <div className="mt-3 rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
          {failedBatches} batch{failedBatches > 1 ? 'es' : ''} failed
        </div>
      )}
    </div>
  );
}
