import { useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useCampaign, type StepId } from '../providers/CampaignProvider.js';
import { AppShell } from '../components/AppShell.js';
import { CampaignStep } from '../steps/CampaignStep.js';
import { AddressesStep } from '../steps/AddressesStep.js';
import { FiltersStep } from '../steps/FiltersStep.js';
import { AmountsStep } from '../steps/AmountsStep.js';
import { WalletStep } from '../steps/WalletStep.js';
import { RequirementsStep } from '../steps/RequirementsStep.js';
import { DistributeStep } from '../steps/DistributeStep.js';
import type { TimelineStep } from '../components/TimelineRail.js';
import { ModeProvider, type Mode } from '../theme';

const STEP_COMPONENTS: Record<StepId, () => ReactNode> = {
  campaign: () => <CampaignStep />,
  addresses: () => <AddressesStep />,
  filters: () => <FiltersStep />,
  amounts: () => <AmountsStep />,
  wallet: () => <WalletStep />,
  requirements: () => <RequirementsStep />,
  distribute: () => <DistributeStep />,
};

/** Step flow orchestrator — renders AppShell with the active step form. */
export function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const {
    activeCampaign,
    activeStepId,
    stepStates,
    setActiveCampaign,
    setActiveStep,
  } = useCampaign();

  useEffect(() => {
    if (!id) return;
    setActiveCampaign(id);
    return () => setActiveCampaign(null);
  }, [id, setActiveCampaign]);

  useEffect(() => {
    document.title = activeCampaign ? `${activeCampaign.name} — Titrate` : 'Campaign — Titrate';
  }, [activeCampaign]);

  const timelineSteps: readonly TimelineStep[] = stepStates.map((state) => ({
    id: state.id,
    label: state.label,
    status: state.status,
  }));

  const handleStepClick = (stepId: string) => {
    const targetState = stepStates.find((s) => s.id === stepId);
    if (!targetState || targetState.status === 'locked') return;
    setActiveStep(stepId as StepId);
  };

  if (!id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-sm text-[color:var(--fg-muted)]">No campaign selected.</p>
      </div>
    );
  }

  if (!activeCampaign) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-sm text-[color:var(--fg-muted)]">Loading campaign…</p>
      </div>
    );
  }

  // Distribute is an observation surface (operator mode); every other step is
  // a decision surface (brutalist). Publishing the mode here lets step
  // components branch their JSX via useMode() as they migrate to brand
  // primitives, without each one needing its own provider.
  const stepMode: Mode = activeStepId === 'distribute' ? 'operator' : 'brutalist';

  return (
    <AppShell
      steps={timelineSteps}
      activeStepId={activeStepId}
      onStepClick={handleStepClick}
    >
      <ModeProvider mode={stepMode}>
        {STEP_COMPONENTS[activeStepId]()}
      </ModeProvider>
    </AppShell>
  );
}
