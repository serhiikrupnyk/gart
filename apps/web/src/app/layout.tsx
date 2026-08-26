import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeScript } from '@/components/theme/theme-script';
import { ToastProvider } from '@/components/ui';

import './globals.css';

// Cyrillic is not optional here — the entire interface is Ukrainian.
const manrope = Manrope({
  // cyrillic-ext carries the glyphs Ukrainian text reaches for beyond the
  // basic cyrillic range, ₴ (U+20B4) among them.
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Gart',
  description: 'Платформа для персональних тренерів',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Gart', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F6F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0E0D' },
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
    <html lang="uk" className={manrope.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh overflow-x-hidden">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
