import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </div>

      {actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
