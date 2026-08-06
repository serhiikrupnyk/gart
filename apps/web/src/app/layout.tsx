import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeScript } from '@/components/theme/theme-script';
import { ToastProvider } from '@/components/ui';

import './globals.css';

// Cyrillic is not optional here — the entire interface is Ukrainian.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Gart',
  description: 'Платформа для персональних тренерів',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Gart', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0F14' },
  ],
};

/**
 * Deliberately static: no cookie read here. ThemeScript — a blocking inline
 * script in <head> — reads the theme cookie and sets the class before first
 * paint, which covers every case including `system` (the one the server never
 * could resolve). Reading the cookie server-side would only duplicate that
 * work, at the price of forcing every route — including the public landing —
 * into dynamic rendering.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
