import type { ReactNode } from 'react';

export type StepPanelProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

export function StepPanel({ title, description, children }: StepPanelProps) {
  return (
    <div className="flex-1 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
