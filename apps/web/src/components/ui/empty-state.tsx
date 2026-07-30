import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">{description}</p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
