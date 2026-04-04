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
        <p className="text-gray-500">No campaign selected.</p>
      </div>
    );
  }

  if (!activeCampaign) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">Loading campaign...</p>
      </div>
    );
  }

  return (
    <AppShell
      steps={timelineSteps}
      activeStepId={activeStepId}
      onStepClick={handleStepClick}
    >
      {STEP_COMPONENTS[activeStepId]()}
    </AppShell>
  );
}
