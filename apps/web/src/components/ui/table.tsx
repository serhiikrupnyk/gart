import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        {/* Every table needs a caption for screen readers; hidden visually. */}
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cx(onClick !== undefined && 'cursor-pointer transition-colors hover:bg-bg-subtle')}
    >
      {children}
    </tr>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="px-4 py-2.5 text-xs font-medium text-text-secondary">
      {children}
    </th>
  );
}

export function Td({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return <td className={cx('px-4 py-3 text-text', numeric && 'tabular')}>{children}</td>;
}
