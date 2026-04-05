export type WalletBadgeProps = {
  readonly address: string;
  readonly chainName: string;
  readonly balance?: string;
  readonly balanceSymbol?: string;
  readonly perryMode?: { readonly hotAddress: string; readonly coldAddress: string };
};

export function WalletBadge({ address, chainName, balance, balanceSymbol, perryMode }: WalletBadgeProps) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 px-4 py-3 ring-1 ring-gray-200 dark:ring-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{address}</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{chainName}</span>
      </div>
      {balance && balanceSymbol && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{balance} {balanceSymbol}</p>}
      {perryMode && (
        <div className="mt-2 rounded-md bg-purple-900/20 px-2 py-1 text-xs text-purple-400 ring-1 ring-purple-900/30">
          Perry mode — derived from {perryMode.coldAddress}
        </div>
      )}
    </div>
  );
}
