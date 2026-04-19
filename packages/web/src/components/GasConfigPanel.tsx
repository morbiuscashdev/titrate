import { useState, useCallback, type ChangeEvent } from 'react';

export type GasConfigState = {
  readonly headroom: 'slow' | 'medium' | 'fast';
  readonly priority: 'slow' | 'medium' | 'fast';
  readonly maxBaseFeeGwei: string;
  readonly maxPriorityFeeGwei: string;
  readonly maxTotalGasCostEth: string;
  readonly feeBumpPercent: string;
  readonly nonceWindow: number;
  readonly enableRevalidation: boolean;
  readonly invalidThreshold: number;
};

export type GasConfigPanelProps = {
  readonly config: GasConfigState;
  readonly onChange: (config: GasConfigState) => void;
};

export const DEFAULT_GAS_CONFIG: GasConfigState = {
  headroom: 'medium',
  priority: 'medium',
  maxBaseFeeGwei: '',
  maxPriorityFeeGwei: '',
  maxTotalGasCostEth: '',
  feeBumpPercent: '12.5',
  nonceWindow: 1,
  enableRevalidation: false,
  invalidThreshold: 2,
};

/**
 * Converts a percentage string (e.g. "12.5") to a WAD-scaled bigint.
 * 12.5% becomes 0.125 * 1e18 = 125_000_000_000_000_000n.
 *
 * Returns the default 12.5% WAD if the input is invalid or non-positive.
 */
export function percentToFeeBumpWad(percent: string): bigint {
  const value = parseFloat(percent);
  if (isNaN(value) || value <= 0) return 125_000_000_000_000_000n;
  return BigInt(Math.round(value * 1e16));
}

const SPEED_OPTIONS = ['slow', 'medium', 'fast'] as const;

const INPUT_CLASS =
  'w-full rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] font-mono px-3 py-1.5 text-sm focus:outline-none focus:shadow-[0_0_0_3px_var(--color-pink-500)] placeholder:text-[color:var(--color-ink-500)]';

const SMALL_LABEL = 'block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5';
const SECTION_HEADING = 'font-mono text-sm font-semibold text-[color:var(--color-ink-100)]';

const SPEED_BASE = 'flex-1 rounded-md px-3 py-1.5 font-mono text-sm text-center transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const SPEED_ACTIVE = 'bg-[color:var(--color-pink-600)] text-white';
const SPEED_INACTIVE = 'bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] hover:border-[color:var(--color-ink-500)]';

/**
 * Collapsible advanced gas settings panel for the distribution step.
 *
 * Renders gas speed toggles, fee cap inputs, cost limit, fee bump,
 * nonce pipelining, and revalidation controls.
 */
export function GasConfigPanel({ config, onChange }: GasConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const updateField = useCallback(
    <K extends keyof GasConfigState>(field: K, value: GasConfigState[K]) => {
      onChange({ ...config, [field]: value });
    },
    [config, onChange],
  );

  const handleTextChange = useCallback(
    (field: 'maxBaseFeeGwei' | 'maxPriorityFeeGwei' | 'maxTotalGasCostEth' | 'feeBumpPercent') =>
      (e: ChangeEvent<HTMLInputElement>) => {
        updateField(field, e.target.value);
      },
    [updateField],
  );

  const handleNonceWindowChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = parseInt(e.target.value, 10);
      if (isNaN(raw)) return;
      const clamped = Math.max(1, Math.min(10, raw));
      updateField('nonceWindow', clamped);
    },
    [updateField],
  );

  const handleInvalidThresholdChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = parseInt(e.target.value, 10);
      if (isNaN(raw)) return;
      updateField('invalidThreshold', Math.max(1, raw));
    },
    [updateField],
  );

  return (
    <div className="rounded-lg border border-[color:var(--color-ink-800)] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 font-mono text-sm font-semibold text-[color:var(--color-ink-100)] bg-[color:var(--color-ink-900)] hover:bg-[color:var(--color-ink-800)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]"
      >
        <span>Advanced Gas Settings</span>
        <svg
          className={`h-4 w-4 text-[color:var(--color-ink-500)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-[color:var(--color-ink-800)] bg-[color:var(--color-ink-900)]/60 p-4 space-y-5">
          {/* Gas Speed */}
          <fieldset className="space-y-3">
            <legend className={SECTION_HEADING}>Gas Speed</legend>

            <div className="space-y-2">
              <label className={SMALL_LABEL}>Headroom</label>
              <div className="flex gap-2" role="radiogroup" aria-label="Headroom speed">
                {SPEED_OPTIONS.map((speed) => {
                  const active = config.headroom === speed;
                  return (
                    <button
                      key={`headroom-${speed}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateField('headroom', speed)}
                      className={`${SPEED_BASE} ${active ? SPEED_ACTIVE : SPEED_INACTIVE}`}
                    >
                      {speed}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className={SMALL_LABEL}>Priority</label>
              <div className="flex gap-2" role="radiogroup" aria-label="Priority speed">
                {SPEED_OPTIONS.map((speed) => {
                  const active = config.priority === speed;
                  return (
                    <button
                      key={`priority-${speed}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateField('priority', speed)}
                      className={`${SPEED_BASE} ${active ? SPEED_ACTIVE : SPEED_INACTIVE}`}
                    >
                      {speed}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {/* Fee Caps */}
          <div className="space-y-3">
            <h4 className={SECTION_HEADING}>Fee Caps</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="max-base-fee" className={SMALL_LABEL}>
                  Max Base Fee
                </label>
                <div className="relative">
                  <input
                    id="max-base-fee"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 50"
                    value={config.maxBaseFeeGwei}
                    onChange={handleTextChange('maxBaseFeeGwei')}
                    className={`${INPUT_CLASS} pr-14`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[color:var(--color-ink-500)] pointer-events-none">
                    gwei
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="max-priority-fee" className={SMALL_LABEL}>
                  Max Priority Fee
                </label>
                <div className="relative">
                  <input
                    id="max-priority-fee"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 2"
                    value={config.maxPriorityFeeGwei}
                    onChange={handleTextChange('maxPriorityFeeGwei')}
                    className={`${INPUT_CLASS} pr-14`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[color:var(--color-ink-500)] pointer-events-none">
                    gwei
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Limit */}
          <div className="space-y-2">
            <label htmlFor="max-total-gas-cost" className={SECTION_HEADING + ' block'}>
              Cost Limit
            </label>
            <div className="relative">
              <input
                id="max-total-gas-cost"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 0.5"
                value={config.maxTotalGasCostEth}
                onChange={handleTextChange('maxTotalGasCostEth')}
                className={`${INPUT_CLASS} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[color:var(--color-ink-500)] pointer-events-none">
                ETH
              </span>
            </div>
          </div>

          {/* Fee Bump */}
          <div className="space-y-2">
            <label htmlFor="fee-bump-percent" className={SECTION_HEADING + ' block'}>
              Fee Bump
            </label>
            <div className="relative">
              <input
                id="fee-bump-percent"
                type="text"
                inputMode="decimal"
                placeholder="12.5"
                value={config.feeBumpPercent}
                onChange={handleTextChange('feeBumpPercent')}
                className={`${INPUT_CLASS} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[color:var(--color-ink-500)] pointer-events-none">
                %
              </span>
            </div>
            <p className="font-mono text-xs text-[color:var(--color-ink-500)]">
              Percentage increase applied when replacing a stuck transaction.
            </p>
          </div>

          {/* Pipelining */}
          <div className="space-y-2">
            <label htmlFor="nonce-window" className={SECTION_HEADING + ' block'}>
              Pipelining
            </label>
            <input
              id="nonce-window"
              type="number"
              min={1}
              max={10}
              value={config.nonceWindow}
              onChange={handleNonceWindowChange}
              className={`${INPUT_CLASS} max-w-24`}
            />
            <p className="font-mono text-xs text-[color:var(--color-ink-500)]">
              Submit N batches before waiting for confirmation.
            </p>
          </div>

          {/* Revalidation */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                id="enable-revalidation"
                type="checkbox"
                checked={config.enableRevalidation}
                onChange={(e) => updateField('enableRevalidation', e.target.checked)}
                style={{ accentColor: 'var(--color-pink-500)' }}
                className="h-4 w-4"
              />
              <label htmlFor="enable-revalidation" className={SECTION_HEADING}>
                Revalidation
              </label>
            </div>

            {config.enableRevalidation && (
              <div className="ml-7 space-y-2">
                <label htmlFor="invalid-threshold" className={SMALL_LABEL}>
                  Invalid threshold
                </label>
                <input
                  id="invalid-threshold"
                  type="number"
                  min={1}
                  value={config.invalidThreshold}
                  onChange={handleInvalidThresholdChange}
                  className={`${INPUT_CLASS} max-w-24`}
                />
                <p className="font-mono text-xs text-[color:var(--color-ink-500)]">
                  Re-check pending batches and replace if addresses become invalid.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
