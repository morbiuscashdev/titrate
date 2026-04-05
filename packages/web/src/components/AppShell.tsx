import type { ReactNode } from 'react';
import { TimelineRail } from './TimelineRail.js';
import type { TimelineStep } from './TimelineRail.js';

export type AppShellProps = {
  readonly steps: readonly TimelineStep[];
  readonly activeStepId: string;
  readonly onStepClick?: (stepId: string) => void;
  readonly children: ReactNode;
};

export function AppShell({ steps, onStepClick, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 lg:flex lg:gap-8">
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <TimelineRail steps={steps} onStepClick={onStepClick} />
        </aside>
        <div className="lg:hidden mb-6" role="progressbar" aria-label="Campaign step progress" aria-valuenow={steps.filter((s) => s.status === 'complete').length} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className="flex gap-2">
            {steps.map((step) => (
              <div key={step.id} className={`h-1 flex-1 rounded-full ${
                step.status === 'complete' ? 'bg-green-500' : step.status === 'active' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'
              }`} />
            ))}
          </div>
        </div>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
