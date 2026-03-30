export type ChainOption = { readonly chainId: number; readonly name: string };

export type ChainSelectorProps = {
  readonly chains: readonly ChainOption[];
  readonly selectedChainId: number | null;
  readonly onSelect?: (chainId: number) => void;
};

export function ChainSelector({ chains, selectedChainId, onSelect }: ChainSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {chains.map((chain) => {
        const isSelected = chain.chainId === selectedChainId;
        return (
          <button key={chain.chainId} type="button" onClick={() => onSelect?.(chain.chainId)}
            className={`rounded-lg px-3 py-2 text-sm text-left transition-colors ring-1 ${
              isSelected ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30' : 'bg-gray-900 text-gray-300 ring-gray-800 hover:ring-gray-700'
            }`}>{chain.name}</button>
        );
      })}
    </div>
  );
}
