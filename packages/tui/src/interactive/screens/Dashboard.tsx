import { useEffect, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import { deriveStepStates, type StepId, type StepState, type StepCounts } from '../step-status.js';
import { StepBadge } from '../components/StepBadge.js';

const STEP_LABELS: Record<StepId, string> = {
  campaign: '1. Campaign setup',
  addresses: '2. Addresses',
  filters: '3. Filters',
  amounts: '4. Amounts',
  wallet: '5. Hot wallets',
  distribute: '6. Distribute',
};

export type DashboardProps = {
  readonly onOpenStep: (step: StepId) => void;
  readonly onQuit: () => void;
};

export function Dashboard({ onOpenStep, onQuit }: DashboardProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const [counts, setCounts] = useState<StepCounts>({ addresses: 0, filtered: 0, wallets: 0, batches: 0 });
  const [focused, setFocused] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [addresses, filtered, wallets, batches] = await Promise.all([
        storage.addresses.count(),
        storage.filtered.count(),
        storage.wallets.count(),
        storage.batches.count(),
      ]);
      if (!cancelled) setCounts({ addresses, filtered, wallets, batches });
    })();
    return () => { cancelled = true; };
  }, [storage, manifest.updatedAt]);

  const steps = deriveStepStates(manifest, counts);

  useKeyboard((key) => {
    if (key.name === 'up') setFocused((i) => Math.max(0, i - 1));
    if (key.name === 'down') setFocused((i) => Math.min(steps.length - 1, i + 1));
    if (key.name === 'return') {
      const step = steps[focused];
      if (step.status === 'blocked') {
        setWarning('Complete prior steps first');
        setTimeout(() => setWarning(null), 2000);
      } else {
        onOpenStep(step.id);
      }
    }
    if (key.name === 'q') onQuit();
    if (key.name === 'r') refresh();
  });

  return (
    <box border padding={1} flexDirection="column">
      <text>
        <strong>{manifest.name}</strong>
        <span fg="gray"> · {manifest.status}</span>
      </text>
      <text>
        <span fg="gray">chain {manifest.chainId} · batch size {manifest.batchSize}</span>
      </text>
      <box marginTop={1} flexDirection="column">
        {steps.map((step: StepState, i: number) => (
          <box key={step.id} flexDirection="row">
            <StepBadge status={step.status} />
            <text>
              <span fg={i === focused ? 'cyan' : 'white'}> {STEP_LABELS[step.id]}</span>
              <span fg="gray">  {step.summary}</span>
            </text>
          </box>
        ))}
      </box>
      <box marginTop={1}>
        <text>
          <span fg="gray">↑/↓ navigate · Enter open · q quit · r refresh</span>
        </text>
      </box>
      {warning && (
        <box marginTop={1}>
          <text><span fg="yellow">{warning}</span></text>
        </box>
      )}
    </box>
  );
}
