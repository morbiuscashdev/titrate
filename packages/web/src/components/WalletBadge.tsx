export type WalletBadgeProps = {
  readonly address: string;
  readonly chainName: string;
  readonly balance?: string;
  readonly balanceSymbol?: string;
  readonly perryMode?: { readonly hotAddress: string; readonly coldAddress: string };
};

export function WalletBadge({ address, chainName, balance, balanceSymbol, perryMode }: WalletBadgeProps) {
  return (
    <div className="rounded-md bg-[color:var(--bg-card)] px-4 py-2 border border-[color:var(--edge)]/40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-[color:var(--color-ok)] shrink-0" aria-hidden="true" />
          <span className="font-mono text-sm text-[color:var(--fg-primary)] truncate">{address}</span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--fg-muted)] shrink-0">{chainName}</span>
      </div>
      {balance && balanceSymbol && (
        <p className="mt-1 font-mono text-xs text-[color:var(--fg-muted)]">{balance} {balanceSymbol}</p>
      )}
      {perryMode && (
        <div className="mt-2 bg-[color:var(--color-warn)]/10 px-2 py-1 font-mono text-[11px] text-[color:var(--color-warn)] border border-[color:var(--color-warn)]/30">
          Perry mode — derived from {perryMode.coldAddress}
        </div>
      )}
    </div>
  );
}
