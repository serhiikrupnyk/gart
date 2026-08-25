import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-panel border border-dashed border-border-strong bg-surface px-6 py-14 text-center shadow-e1 sm:py-16">
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-20 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="mx-auto mb-5 block size-2 rounded-full bg-accent shadow-[0_0_0_7px_var(--color-accent-subtle)]"
      />
      <p className="text-base font-bold text-text">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
        {description}
      </p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
