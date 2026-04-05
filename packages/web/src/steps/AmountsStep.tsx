import { useState, useEffect, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { AmountConfig } from '../components/AmountConfig.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import type { StoredCampaign } from '@titrate/sdk';

type AmountMode = 'uniform' | 'variable';
type AmountFormat = 'integer' | 'decimal';

/**
 * Determine whether the amounts form can be submitted.
 *
 * Variable mode is always submittable. Uniform mode requires a non-empty
 * (trimmed) amount string.
 */
export function canSubmitAmounts(mode: string, amount: string): boolean {
  if (mode === 'variable') return true;
  return amount.trim().length > 0;
}

/**
 * Step 4: Distribution amount configuration.
 *
 * Toggles between uniform (same amount per recipient) and variable
 * (amounts from CSV). Uses the AmountConfig component for the mode
 * and format toggles plus the amount input.
 */
export function AmountsStep() {
  const { activeCampaign, saveCampaign, setActiveStep } = useCampaign();

  const [mode, setMode] = useState<AmountMode>('uniform');
  const [format, setFormat] = useState<AmountFormat>('integer');
  const [uniformAmount, setUniformAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from active campaign
  useEffect(() => {
    if (!activeCampaign) {
      return;
    }
    setMode(activeCampaign.amountMode);
    setFormat(activeCampaign.amountFormat);
    setUniformAmount(activeCampaign.uniformAmount ?? '');
  }, [activeCampaign]);

  const handleContinue = useCallback(async () => {
    if (!activeCampaign) {
      return;
    }

    if (mode === 'uniform' && !uniformAmount.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const updated: StoredCampaign = {
        ...activeCampaign,
        amountMode: mode,
        amountFormat: format,
        uniformAmount: mode === 'uniform' ? uniformAmount.trim() : null,
      };
      await saveCampaign(updated);
      setActiveStep('wallet');
    } finally {
      setIsSaving(false);
    }
  }, [activeCampaign, mode, format, uniformAmount, saveCampaign, setActiveStep]);

  const canContinue = canSubmitAmounts(mode, uniformAmount);

  return (
    <StepPanel title="Amounts" description="Configure how much each recipient will receive.">
      <div className="space-y-6">
        {/* Amount Configuration */}
        <AmountConfig
          mode={mode}
          format={format}
          uniformAmount={uniformAmount}
          onModeChange={setMode}
          onFormatChange={setFormat}
          onAmountChange={setUniformAmount}
        />

        {/* Total display for uniform mode */}
        {mode === 'uniform' && uniformAmount.trim() && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Each recipient will receive{' '}
              <span className="font-medium text-gray-900 dark:text-white">{uniformAmount}</span>{' '}
              tokens ({format} format).
            </p>
          </div>
        )}

        {/* Continue */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || isSaving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </StepPanel>
  );
}
