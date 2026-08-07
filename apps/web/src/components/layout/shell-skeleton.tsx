import { Skeleton, SkeletonRegion } from '@/components/ui';

/**
 * What the shells show while the session is being checked.
 *
 * It mirrors the real chrome of each shell, because anything it gets wrong
 * becomes a visible jump the moment the session resolves. The two shells
 * genuinely differ: the trainer app is full-width with a `w-60` rail that
 * appears at `lg`, the client app a centred `max-w-4xl` column with a `w-48`
 * nav from `sm`.
 */
export function ShellSkeleton({ variant }: { variant: 'trainer' | 'client' }) {
  if (variant === 'trainer') {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="border-b border-border bg-surface">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Skeleton className="size-8 rounded-control lg:hidden" />
            <Skeleton className="h-5 w-20" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="size-8 rounded-control" />
              <Skeleton className="size-8 rounded-control" />
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-60 shrink-0 border-r border-border p-4 lg:block">
            <div className="space-y-1.5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-9" />
              ))}
            </div>
          </aside>

          <SkeletonRegion className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Skeleton className="h-7 w-48" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-20 rounded-card" />
              ))}
            </div>
          </SkeletonRegion>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Skeleton className="size-8 rounded-control" />
          <Skeleton className="h-5 w-20" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-8 rounded-control" />
            <Skeleton className="size-8 rounded-control" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-4xl gap-8 px-4 sm:px-6">
        <aside className="hidden w-48 shrink-0 py-6 sm:block">
          <div className="space-y-1.5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-9" />
            ))}
          </div>
        </aside>

        <SkeletonRegion className="min-w-0 flex-1 py-8">
          <Skeleton className="h-7 w-48" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-card" />
            ))}
          </div>
        </SkeletonRegion>
      </div>
    </div>
  );
}
