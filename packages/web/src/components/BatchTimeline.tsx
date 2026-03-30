import { BatchStatusCard } from './BatchStatusCard.js';
import type { BatchStatusCardProps } from './BatchStatusCard.js';

export type BatchTimelineProps = {
  readonly batches: readonly BatchStatusCardProps[];
};

export function BatchTimeline({ batches }: BatchTimelineProps) {
  if (batches.length === 0) {
    return <p className="text-sm text-gray-500">No batches yet</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <BatchStatusCard key={batch.batchIndex} {...batch} />
      ))}
    </div>
  );
}
