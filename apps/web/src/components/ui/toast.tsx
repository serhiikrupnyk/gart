'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { cx } from '@/lib/cx';

export type ToastTone = 'neutral' | 'success' | 'danger';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DISMISS_AFTER_MS = 4000;

const TONES: Record<ToastTone, string> = {
  neutral: 'border-border bg-surface-raised text-text',
  success: 'border-success/40 bg-surface-raised text-text',
  danger: 'border-danger/40 bg-surface-raised text-text',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = Date.now() + Math.random();

    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, DISMISS_AFTER_MS);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext value={value}>
      {children}

      {/* Polite, so it never interrupts what a screen reader is already saying. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex flex-col items-center gap-2 p-4 sm:bottom-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto rounded-card border px-4 py-3 text-sm font-medium shadow-e3',
              TONES[toast.tone],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error('useToast must be used inside a ToastProvider');
  }

  return context;
}
