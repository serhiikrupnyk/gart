import { Skeleton, SkeletonRegion } from '@/components/ui';

/**
 * What the shells show while the session is being checked.
 *
 * It mirrors the real chrome of each shell — container width, header, and the
 * sidebar column — so the page does not shift sideways when the session
 * resolves. The two shells genuinely differ: the trainer app is `max-w-6xl`
 * with a `w-52` nav, the client app `max-w-4xl` with a `w-48` one.
 */
const SHELLS = {
  trainer: { container: 'max-w-6xl', aside: 'w-52', links: 4 },
  client: { container: 'max-w-4xl', aside: 'w-48', links: 3 },
} as const;

export function ShellSkeleton({ variant }: { variant: keyof typeof SHELLS }) {
  const shell = SHELLS[variant];

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 ${shell.container}`}>
          <Skeleton className="size-8 rounded-control" />
          <Skeleton className="h-5 w-20" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-8 rounded-control" />
            <Skeleton className="size-8 rounded-control" />
          </div>
        </div>
      </header>

      <div className={`mx-auto flex gap-8 px-4 sm:px-6 ${shell.container}`}>
        <aside className={`hidden shrink-0 py-6 sm:block ${shell.aside}`}>
          <div className="space-y-1.5">
            {Array.from({ length: shell.links }, (_, index) => (
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
