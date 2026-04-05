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

function ParamField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-blue-500 focus:outline-none" />
    </div>
  );
}

function SourceParams({ sourceType, params, onParamsChange }: { sourceType: string; params: Record<string, string>; onParamsChange?: (params: Record<string, string>) => void }) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });
  if (sourceType === 'csv') return <ParamField label="File name" value={params.fileName ?? ''} onChange={(v) => update('fileName', v)} />;
  if (sourceType === 'block-scan' || sourceType === 'explorer-scan') {
    return (
      <div className="space-y-3">
        <ParamField label="Start block" value={params.startBlock ?? ''} onChange={(v) => update('startBlock', v)} />
        <ParamField label="End block" value={params.endBlock ?? ''} onChange={(v) => update('endBlock', v)} />
      </div>
    );
  }
  return null;
}

function FilterParams({ filterType, params, onParamsChange }: { filterType: string; params: Record<string, string>; onParamsChange?: (params: Record<string, string>) => void }) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });
  if (filterType === 'min-balance') return <ParamField label="Minimum balance (ETH)" value={params.minBalance ?? ''} onChange={(v) => update('minBalance', v)} />;
  if (filterType === 'nonce-range') {
    return (
      <div className="space-y-3">
        <ParamField label="Min nonce" value={params.minNonce ?? ''} onChange={(v) => update('minNonce', v)} />
        <ParamField label="Max nonce" value={params.maxNonce ?? ''} onChange={(v) => update('maxNonce', v)} />
      </div>
    );
  }
  if (filterType === 'token-recipients') return <ParamField label="Token address" value={params.tokenAddress ?? ''} onChange={(v) => update('tokenAddress', v)} />;
  if (filterType === 'csv-exclusion') return <ParamField label="Exclusion CSV" value={params.fileName ?? ''} onChange={(v) => update('fileName', v)} />;
  return <p className="text-xs text-gray-400 dark:text-gray-500">No additional configuration needed.</p>;
}

export function PipelineStepEditor({ stepType, sourceType, filterType, params, onParamsChange, onTypeChange }: PipelineStepEditorProps) {
  const types = stepType === 'source' ? sourceTypes : filterTypes;
  const selectedType = stepType === 'source' ? sourceType : filterType;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t.value} type="button" onClick={() => onTypeChange?.(t.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              selectedType === t.value ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30' : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-800 hover:ring-gray-300 dark:hover:ring-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>
      {stepType === 'source' && sourceType && <SourceParams sourceType={sourceType} params={params} onParamsChange={onParamsChange} />}
      {stepType === 'filter' && filterType && <FilterParams filterType={filterType} params={params} onParamsChange={onParamsChange} />}
    </div>
  );
}
