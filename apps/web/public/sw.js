/*
 * Gart's service worker. Deliberately minimal: it exists to receive push and
 * to open the right page when one is tapped — no caching, no offline strategy,
 * no framework. It is registered only after a person explicitly asks for
 * notifications, never on page load.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    // A push without a readable body still deserves to surface.
    payload = { title: 'Gart' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Gart', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Focus an open tab rather than piling up new ones.
      for (const client of windows) {
        if (client.url.includes(target) && 'focus' in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});
