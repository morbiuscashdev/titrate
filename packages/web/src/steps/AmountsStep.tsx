import { useState, useEffect, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { AmountConfig } from '../components/AmountConfig.js';
import { Button, Card } from '../components/ui';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { detectAmountFormat } from '@titrate/sdk';
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
/**
 * Detect whether stored address amounts conflict with the selected format.
 * Returns a warning message if decimal values exist but integer mode is selected.
 */
export function detectFormatConflict(
  amounts: readonly string[],
  selectedFormat: AmountFormat,
): string | null {
  if (amounts.length === 0) return null;
  const detected = detectAmountFormat(amounts);
  if (selectedFormat === 'integer' && detected === 'decimal') {
    return 'Some amounts contain decimal points but integer mode is selected. Values will be truncated.';
  }
  return null;
}

export function AmountsStep() {
  const { activeCampaign, saveCampaign, setActiveStep } = useCampaign();
  const { storage } = useStorage();

  const [mode, setMode] = useState<AmountMode>('uniform');
  const [format, setFormat] = useState<AmountFormat>('integer');
  const [uniformAmount, setUniformAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);
  const [storedAmounts, setStoredAmounts] = useState<readonly string[]>([]);

  // Initialize from active campaign
  useEffect(() => {
    if (!activeCampaign) {
      return;
    }
    setMode(activeCampaign.amountMode);
    setFormat(activeCampaign.amountFormat);
    setUniformAmount(activeCampaign.uniformAmount ?? '');
  }, [activeCampaign]);

  // Load stored amounts to detect format conflicts
  useEffect(() => {
    if (!storage || !activeCampaign) return;
    void (async () => {
      const sets = await storage.addressSets.getByCampaign(activeCampaign.id);
      const sourceSets = sets.filter((s: { type: string }) => s.type === 'source');
      const amounts: string[] = [];
      for (const set of sourceSets) {
        const addrs = await storage.addresses.getBySet(set.id);
        for (const a of addrs) {
          if (a.amount) amounts.push(a.amount);
        }
      }
      setStoredAmounts(amounts);
    })();
  }, [storage, activeCampaign]);

  // Check for format conflicts when format or stored amounts change
  useEffect(() => {
    if (mode === 'variable' && storedAmounts.length > 0) {
      setFormatWarning(detectFormatConflict(storedAmounts, format));
    } else {
      setFormatWarning(null);
    }
  }, [format, mode, storedAmounts]);

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

        {/* Format conflict warning */}
        {formatWarning && (
          <div className="border-2 border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn)]/10 p-3">
            <p className="font-mono text-sm text-[color:var(--color-warn)]">{formatWarning}</p>
          </div>
        )}

        {/* Total display for uniform mode */}
        {mode === 'uniform' && uniformAmount.trim() && (
          <Card>
            <p className="font-mono text-sm text-[color:var(--fg-muted)]">
              Each recipient will receive{' '}
              <span className="font-semibold text-[color:var(--fg-primary)]">{uniformAmount}</span>{' '}
              tokens ({format} format).
            </p>
          </Card>
        )}

        {/* Continue */}
        <Button variant="primary" onClick={handleContinue} disabled={!canContinue || isSaving}>
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </StepPanel>
  );
}
