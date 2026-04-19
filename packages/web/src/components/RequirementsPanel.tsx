import { Card } from './ui';

export type RequirementsPanelProps = {
  readonly gasTokenNeeded: string;
  readonly gasTokenBalance: string;
  readonly gasTokenSymbol: string;
  readonly erc20Needed: string;
  readonly erc20Balance: string;
  readonly tokenSymbol: string;
  readonly batchCount: number;
  readonly isSufficient: boolean;
};

function Requirement({ label, needed, balance }: { label: string; needed: string; balance: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[color:var(--edge)]/40">
      <span className="font-mono text-sm text-[color:var(--fg-muted)]">{label}</span>
      <div className="text-right">
        <span className="font-mono text-sm font-semibold text-[color:var(--fg-primary)]">{needed}</span>
        <span className="font-mono text-xs text-[color:var(--fg-muted)] ml-2">(have: {balance})</span>
      </div>
    </div>
  );
}

export function RequirementsPanel({ gasTokenNeeded, gasTokenBalance, gasTokenSymbol, erc20Needed, erc20Balance, tokenSymbol, batchCount, isSufficient }: RequirementsPanelProps) {
  const statusTone = isSufficient
    ? 'bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)] border-[color:var(--color-ok)]/30'
    : 'bg-[color:var(--color-err)]/10 text-[color:var(--color-err)] border-[color:var(--color-err)]/30';

  return (
    <Card>
      <h3 className="font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)] mb-3">Distribution Requirements</h3>
      <Requirement label={`${gasTokenSymbol} for gas`} needed={gasTokenNeeded} balance={gasTokenBalance} />
      <Requirement label={`${tokenSymbol} tokens`} needed={erc20Needed} balance={erc20Balance} />
      <div className="flex items-center justify-between py-2">
        <span className="font-mono text-sm text-[color:var(--fg-muted)]">Batches</span>
        <span className="font-mono text-sm font-semibold text-[color:var(--fg-primary)]">{batchCount}</span>
      </div>
      <div
        data-status={isSufficient ? 'ok' : 'err'}
        className={`mt-3 border-2 p-3 font-mono text-sm ${statusTone}`}
      >
        {isSufficient ? 'Ready to distribute' : 'Insufficient balance — fund wallet before proceeding'}
      </div>
    </Card>
  );
}
