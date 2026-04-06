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
  'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

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
    <div className="rounded-lg ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span>Advanced Gas Settings</span>
        <svg
          className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 space-y-5">
          {/* Gas Speed */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-900 dark:text-white">Gas Speed</legend>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">Headroom</label>
              <div className="flex gap-2" role="radiogroup" aria-label="Headroom speed">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={`headroom-${speed}`}
                    type="button"
                    role="radio"
                    aria-checked={config.headroom === speed}
                    onClick={() => updateField('headroom', speed)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm text-center transition-colors ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      config.headroom === speed
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/30'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 ring-gray-200 dark:ring-gray-700 hover:ring-gray-300 dark:hover:ring-gray-600'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">Priority</label>
              <div className="flex gap-2" role="radiogroup" aria-label="Priority speed">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={`priority-${speed}`}
                    type="button"
                    role="radio"
                    aria-checked={config.priority === speed}
                    onClick={() => updateField('priority', speed)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm text-center transition-colors ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      config.priority === speed
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/30'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 ring-gray-200 dark:ring-gray-700 hover:ring-gray-300 dark:hover:ring-gray-600'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Fee Caps */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Fee Caps</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="max-base-fee" className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
                    gwei
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="max-priority-fee" className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
                    gwei
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Limit */}
          <div className="space-y-2">
            <label htmlFor="max-total-gas-cost" className="text-sm font-medium text-gray-900 dark:text-white block">
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
                ETH
              </span>
            </div>
          </div>

          {/* Fee Bump */}
          <div className="space-y-2">
            <label htmlFor="fee-bump-percent" className="text-sm font-medium text-gray-900 dark:text-white block">
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
                %
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Percentage increase applied when replacing a stuck transaction.
            </p>
          </div>

          {/* Pipelining */}
          <div className="space-y-2">
            <label htmlFor="nonce-window" className="text-sm font-medium text-gray-900 dark:text-white block">
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
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
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="enable-revalidation" className="text-sm font-medium text-gray-900 dark:text-white">
                Revalidation
              </label>
            </div>

            {config.enableRevalidation && (
              <div className="ml-7 space-y-2">
                <label htmlFor="invalid-threshold" className="text-xs text-gray-500 dark:text-gray-400 block">
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
                <p className="text-xs text-gray-500 dark:text-gray-400">
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
