import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gart',
    short_name: 'Gart',
    description: 'Платформа для персональних тренерів',
    lang: 'uk',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0C0E0D',
    theme_color: '#0C0E0D',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
