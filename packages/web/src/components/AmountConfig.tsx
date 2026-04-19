import { Input } from './ui';

export type AmountConfigProps = {
  readonly mode: 'uniform' | 'variable';
  readonly format: 'integer' | 'decimal';
  readonly uniformAmount: string;
  readonly onModeChange?: (mode: 'uniform' | 'variable') => void;
  readonly onFormatChange?: (format: 'integer' | 'decimal') => void;
  readonly onAmountChange?: (amount: string) => void;
};

const TOGGLE_BASE = 'rounded-none border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const TOGGLE_ACTIVE = 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE = 'bg-[color:var(--bg-card)] text-[color:var(--fg-muted)] border-[color:var(--edge)] hover:text-[color:var(--fg-primary)]';

function Toggle({ options, selected, onChange }: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="inline-flex gap-0">
      {options.map((opt, i) => {
        const active = selected === opt.value;
        const positional = i === 0 ? '' : '-ml-[2px]';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            aria-pressed={active}
            className={`${TOGGLE_BASE} ${positional} ${active ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function AmountConfig({ mode, format, uniformAmount, onModeChange, onFormatChange, onAmountChange }: AmountConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          options={[{ value: 'uniform', label: 'Uniform' }, { value: 'variable', label: 'Variable' }]}
          selected={mode}
          onChange={(v) => onModeChange?.(v as 'uniform' | 'variable')}
        />
        <Toggle
          options={[{ value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' }]}
          selected={format}
          onChange={(v) => onFormatChange?.(v as 'integer' | 'decimal')}
        />
      </div>
      {mode === 'uniform' && (
        <Input
          id="uniform-amount"
          label="Amount per recipient"
          type="text"
          value={uniformAmount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          placeholder="Enter amount per recipient"
        />
      )}
      {mode === 'variable' && (
        <p className="font-mono text-xs text-[color:var(--fg-muted)]">Amounts will be read from the CSV file.</p>
      )}
    </div>
  );
}
