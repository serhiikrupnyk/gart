import { Skeleton, SkeletonRegion } from './skeleton';

/**
 * Loading shapes for the app's data surfaces. Each mirrors the real layout it
 * stands in for — a table skeleton has the same row height and column rhythm
 * as the table that replaces it — so content lands in place instead of
 * shifting the page when the fetch resolves.
 */

export function TableSkeleton({
  rows = 6,
  columns = 4,
  label,
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  return (
    <SkeletonRegion label={label} className="overflow-hidden rounded-card border border-border">
      <div className="flex items-center gap-4 border-b border-border bg-bg-subtle px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={column === 0 ? 'h-4 flex-1' : 'h-4 flex-1 opacity-70'}
            />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function CardListSkeleton({ count = 3, label }: { count?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3.5 w-full" />
          <Skeleton className="mt-2 h-3.5 w-2/3" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Compact rows for panels inside a card — activity, habits, assignments. */
export function RowsSkeleton({ count = 4, label }: { count?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-control border border-border px-3 py-3"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2 opacity-70" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Alternating bubbles, so the conversation does not jump when history lands. */
export function ChatSkeleton({ count = 5, label }: { count?: number; label?: string }) {
  const WIDTHS = ['w-40', 'w-56', 'w-32', 'w-48', 'w-36'];

  return (
    <SkeletonRegion label={label ?? 'Завантаження листування'} className="space-y-3 py-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={index % 2 === 0 ? 'flex' : 'flex justify-end'}>
          <Skeleton className={`h-12 rounded-card ${WIDTHS[index % WIDTHS.length]}`} />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A chart area plus its surrounding controls. */
export function ChartSkeleton({ label }: { label?: string } = {}) {
  return (
    <SkeletonRegion label={label} className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-control" />
        <Skeleton className="h-8 w-24 rounded-control" />
      </div>
      <Skeleton className="h-48 rounded-card" />
      <div className="flex gap-4">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    </SkeletonRegion>
  );
}

/** A detail page: title, meta line, then panels. */
export function DetailSkeleton({ label }: { label?: string } = {}) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40 opacity-70" />
      </div>
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="rounded-card border border-border bg-surface p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}
