import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Wordmark } from './wordmark';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** The centered card every unauthenticated screen sits in. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-subtle px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <div className="rounded-card border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold text-text">{title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>

          {children}
        </div>

        {footer !== undefined && (
          <p className="mt-6 text-center text-sm text-text-secondary">{footer}</p>
        )}
      </div>
    </main>
  );
}
