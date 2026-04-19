import type { ReactNode } from 'react';
import { TimelineRail } from './TimelineRail.js';
import type { TimelineStep } from './TimelineRail.js';

export type AppShellProps = {
  readonly steps: readonly TimelineStep[];
  readonly activeStepId: string;
  readonly onStepClick?: (stepId: string) => void;
  readonly children: ReactNode;
};

const mobileBarStyles: Record<TimelineStep['status'], string> = {
  complete: 'bg-[color:var(--color-pink-500)]',
  active: 'bg-[color:var(--color-pink-500)]/60',
  locked: 'bg-[color:var(--edge)]/20',
};

export function AppShell({ steps, onStepClick, children }: AppShellProps) {
  const completedCount = steps.filter((s) => s.status === 'complete').length;
  return (
    <div className="min-h-screen bg-[color:var(--bg-page)] text-[color:var(--fg-primary)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 lg:flex lg:gap-8">
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <TimelineRail steps={steps} onStepClick={onStepClick} />
        </aside>
        <div
          className="lg:hidden mb-6"
          role="progressbar"
          aria-label="Campaign step progress"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={steps.length}
        >
          <div className="flex gap-2">
            {steps.map((step) => (
              <div key={step.id} className={`h-1 flex-1 ${mobileBarStyles[step.status]}`} />
            ))}
          </div>
        </div>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
