import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Sits beside the title — a count, a status, anything short. */
  meta?: ReactNode;
}

export function PageHeader({ title, description, actions, meta }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between lg:pb-8">
      <div className="min-w-0">
        {meta === undefined ? (
          <h1 className="text-2xl font-bold tracking-[-0.035em] text-text sm:text-3xl">{title}</h1>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-[-0.035em] text-text sm:text-3xl">
              {title}
            </h1>
            {meta}
          </div>
        )}
        {description !== undefined && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {description}
          </p>
        )}
      </div>

      {actions !== undefined && (
        <div className="flex w-full shrink-0 gap-2 [&>*]:w-full sm:w-auto sm:[&>*]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
