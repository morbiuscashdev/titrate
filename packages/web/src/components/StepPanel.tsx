import type { ReactNode } from 'react';

export type StepPanelProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

export function StepPanel({ title, description, children }: StepPanelProps) {
  return (
    <div className="flex-1 p-6">
      <h2 className="font-sans text-lg font-extrabold tracking-tight text-[color:var(--fg-primary)]">{title}</h2>
      {description && <p className="mt-1 font-mono text-sm text-[color:var(--fg-muted)]">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
