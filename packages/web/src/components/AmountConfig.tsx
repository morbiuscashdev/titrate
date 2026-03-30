export type AmountConfigProps = {
  readonly mode: 'uniform' | 'variable';
  readonly format: 'integer' | 'decimal';
  readonly uniformAmount: string;
  readonly onModeChange?: (mode: 'uniform' | 'variable') => void;
  readonly onFormatChange?: (format: 'integer' | 'decimal') => void;
  readonly onAmountChange?: (amount: string) => void;
};

function Toggle({ options, selected, onChange }: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-800 p-0.5">
      {options.map((opt) => (
        <button key={opt.value} type="button" onClick={() => onChange?.(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            selected === opt.value ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
          }`}>{opt.label}</button>
      ))}
    </div>
  );
}

export function AmountConfig({ mode, format, uniformAmount, onModeChange, onFormatChange, onAmountChange }: AmountConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Toggle options={[{ value: 'uniform', label: 'Uniform' }, { value: 'variable', label: 'Variable' }]} selected={mode} onChange={(v) => onModeChange?.(v as 'uniform' | 'variable')} />
        <Toggle options={[{ value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' }]} selected={format} onChange={(v) => onFormatChange?.(v as 'integer' | 'decimal')} />
      </div>
      {mode === 'uniform' && (
        <input type="text" value={uniformAmount} onChange={(e) => onAmountChange?.(e.target.value)} placeholder="Enter amount per recipient"
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white ring-1 ring-gray-800 placeholder:text-gray-600 focus:ring-blue-500 focus:outline-none" />
      )}
      {mode === 'variable' && <p className="text-xs text-gray-500">Amounts will be read from the CSV file.</p>}
    </div>
  );
}
