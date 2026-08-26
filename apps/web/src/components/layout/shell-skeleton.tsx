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
      <div className="flex min-h-dvh flex-col bg-bg-subtle">
        <header className="border-b border-border bg-bg/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
            <Skeleton className="size-8 rounded-control lg:hidden" />
            <Skeleton className="h-5 w-20" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="size-8 rounded-control" />
              <Skeleton className="size-8 rounded-control" />
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-[17rem] shrink-0 border-r border-border bg-surface/65 p-5 lg:block">
            <div className="space-y-1.5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          </aside>

          <SkeletonRegion className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
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
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-border bg-bg/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Skeleton className="size-8 rounded-control" />
          <Skeleton className="h-5 w-20" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-8 rounded-control" />
            <Skeleton className="size-8 rounded-control" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-8 px-4 sm:px-6">
        <aside className="hidden w-52 shrink-0 py-6 sm:block">
          <div className="space-y-1.5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        </aside>

        <SkeletonRegion className="min-w-0 flex-1 pb-28 pt-6 sm:py-8">
          <Skeleton className="h-7 w-48" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-card" />
            ))}
          </div>
        </SkeletonRegion>
      </div>

      <div className="fixed inset-x-3 bottom-3 grid grid-cols-3 gap-2 rounded-panel border border-border bg-surface p-2 shadow-e4 sm:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    </div>
  );
}
