import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeScript } from '@/components/theme/theme-script';
import { ToastProvider } from '@/components/ui';
import { parseThemePreference, resolvedOnServer, THEME_COOKIE } from '@/lib/theme';

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the cookie here is what removes the flash: an explicit light/dark
  // choice is already in the markup before any script runs. It costs dynamic
  // rendering for the whole app, which is the right trade for a signed-in
  // product. `system` cannot be resolved server-side — no request header
  // carries the OS preference — so ThemeScript settles that before first paint.
  const preference = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  const resolved = resolvedOnServer(preference);

  return (
    <html
      lang="uk"
      data-theme={preference}
      className={`${inter.variable}${resolved === 'dark' ? ' dark' : ''}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider initial={preference}>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
