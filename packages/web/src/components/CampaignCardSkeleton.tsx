import { Skeleton } from './Skeleton.js';
import { Card } from './ui';

/**
 * Skeleton placeholder matching the CampaignCard layout.
 *
 * Renders pulse-animated rectangles in the same positions as
 * the campaign name, status badge, metadata row, and progress bar.
 */
export function CampaignCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="mt-3">
        <div className="flex justify-between mb-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
    </Card>
  );
}
