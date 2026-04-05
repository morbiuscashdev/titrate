import { Skeleton } from './Skeleton.js';

/**
 * Skeleton placeholder matching the CampaignCard layout.
 *
 * Renders pulse-animated rectangles in the same positions as
 * the campaign name, status badge, metadata row, and progress bar.
 */
export function CampaignCardSkeleton() {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
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
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}
