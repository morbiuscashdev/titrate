import { Input } from './ui';

export type PipelineStepEditorProps = {
  readonly stepType: 'source' | 'filter';
  readonly sourceType?: 'csv' | 'block-scan' | 'explorer-scan';
  readonly filterType?: 'contract-check' | 'min-balance' | 'nonce-range' | 'token-recipients' | 'csv-exclusion';
  readonly params: Record<string, string>;
  readonly onParamsChange?: (params: Record<string, string>) => void;
  readonly onTypeChange?: (type: string) => void;
};

const sourceTypes = [
  { value: 'csv', label: 'CSV' },
  { value: 'block-scan', label: 'Block Scan' },
  { value: 'explorer-scan', label: 'Explorer' },
];

const filterTypes = [
  { value: 'contract-check', label: 'Exclude Contracts' },
  { value: 'min-balance', label: 'Min Balance' },
  { value: 'nonce-range', label: 'Nonce Range' },
  { value: 'token-recipients', label: 'Token Recipients' },
  { value: 'csv-exclusion', label: 'CSV Exclusion' },
];

const TOGGLE_BASE = 'rounded-none border-2 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const TOGGLE_ACTIVE = 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE = 'bg-[color:var(--bg-card)] text-[color:var(--fg-muted)] border-[color:var(--edge)] hover:text-[color:var(--fg-primary)]';

function SourceParams({ sourceType, params, onParamsChange }: { sourceType: string; params: Record<string, string>; onParamsChange?: (params: Record<string, string>) => void }) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });
  if (sourceType === 'csv') {
    return <Input label="File name" value={params.fileName ?? ''} onChange={(e) => update('fileName', e.target.value)} />;
  }
  if (sourceType === 'block-scan' || sourceType === 'explorer-scan') {
    return (
      <div className="space-y-3">
        <Input label="Start block" value={params.startBlock ?? ''} onChange={(e) => update('startBlock', e.target.value)} />
        <Input label="End block" value={params.endBlock ?? ''} onChange={(e) => update('endBlock', e.target.value)} />
      </div>
    );
  }
  return null;
}

function FilterParams({ filterType, params, onParamsChange }: { filterType: string; params: Record<string, string>; onParamsChange?: (params: Record<string, string>) => void }) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });
  if (filterType === 'min-balance') {
    return <Input label="Minimum balance (ETH)" value={params.minBalance ?? ''} onChange={(e) => update('minBalance', e.target.value)} />;
  }
  if (filterType === 'nonce-range') {
    return (
      <div className="space-y-3">
        <Input label="Min nonce" value={params.minNonce ?? ''} onChange={(e) => update('minNonce', e.target.value)} />
        <Input label="Max nonce" value={params.maxNonce ?? ''} onChange={(e) => update('maxNonce', e.target.value)} />
      </div>
    );
  }
  if (filterType === 'token-recipients') {
    return (
      <div className="space-y-3">
        <Input label="Token address" value={params.tokenAddress ?? ''} onChange={(e) => update('tokenAddress', e.target.value)} />
        <Input label="Start block" value={params.startBlock ?? ''} onChange={(e) => update('startBlock', e.target.value)} />
        <Input label="End block" value={params.endBlock ?? ''} onChange={(e) => update('endBlock', e.target.value)} />
      </div>
    );
  }
  if (filterType === 'csv-exclusion') {
    return <Input label="Exclusion CSV" value={params.fileName ?? ''} onChange={(e) => update('fileName', e.target.value)} />;
  }
  return <p className="font-mono text-xs text-[color:var(--fg-muted)]">No additional configuration needed.</p>;
}

export function PipelineStepEditor({ stepType, sourceType, filterType, params, onParamsChange, onTypeChange }: PipelineStepEditorProps) {
  const types = stepType === 'source' ? sourceTypes : filterTypes;
  const selectedType = stepType === 'source' ? sourceType : filterType;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => {
          const active = selectedType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onTypeChange?.(t.value)}
              aria-pressed={active}
              className={`${TOGGLE_BASE} ${active ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {stepType === 'source' && sourceType && <SourceParams sourceType={sourceType} params={params} onParamsChange={onParamsChange} />}
      {stepType === 'filter' && filterType && <FilterParams filterType={filterType} params={params} onParamsChange={onParamsChange} />}
    </div>
  );
}
