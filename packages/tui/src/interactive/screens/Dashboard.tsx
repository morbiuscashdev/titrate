import type { StepId } from '../step-status.js';

export type DashboardProps = {
  readonly onOpenStep: (step: StepId) => void;
  readonly onQuit: () => void;
};

export function Dashboard(_: DashboardProps) {
  return <text>Dashboard placeholder</text>;
}
