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
    <div className="flex items-center justify-between py-2 border-b border-gray-800">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-white">{needed}</span>
        <span className="text-xs text-gray-500 ml-2">(have: {balance})</span>
      </div>
    </div>
  );
}

export function RequirementsPanel({ gasTokenNeeded, gasTokenBalance, gasTokenSymbol, erc20Needed, erc20Balance, tokenSymbol, batchCount, isSufficient }: RequirementsPanelProps) {
  return (
    <div className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800">
      <h3 className="text-sm font-semibold text-white mb-3">Distribution Requirements</h3>
      <Requirement label={`${gasTokenSymbol} for gas`} needed={gasTokenNeeded} balance={gasTokenBalance} />
      <Requirement label={`${tokenSymbol} tokens`} needed={erc20Needed} balance={erc20Balance} />
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-gray-400">Batches</span>
        <span className="text-sm font-medium text-white">{batchCount}</span>
      </div>
      <div className={`mt-3 rounded-md p-3 text-sm ${
        isSufficient ? 'bg-green-900/20 text-green-400 ring-1 ring-green-900/30' : 'bg-red-900/20 text-red-400 ring-1 ring-red-900/30'
      }`}>
        {isSufficient ? 'Ready to distribute' : 'Insufficient balance — fund wallet before proceeding'}
      </div>
    </div>
  );
}
