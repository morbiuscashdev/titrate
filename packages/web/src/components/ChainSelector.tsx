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
          <button
            key={chain.chainId}
            type="button"
            onClick={() => onSelect?.(chain.chainId)}
            aria-pressed={isSelected}
            className={`rounded-none border-2 px-3 py-2 font-mono text-sm text-left transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] ${
              isSelected
                ? 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]'
                : 'bg-[color:var(--bg-card)] text-[color:var(--fg-primary)] border-[color:var(--edge)] hover:border-[color:var(--color-pink-500)]'
            }`}
          >
            {chain.name}
          </button>
        );
      })}
    </div>
  );
}
