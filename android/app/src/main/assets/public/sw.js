const C = 'kx5';
const A = [
  'index.html', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'sounds/card.wav', 'sounds/cheer.wav', 'sounds/ft.wav', 'sounds/goal.wav',
  'sounds/ht.wav', 'sounds/kickoff.wav', 'sounds/news.wav', 'sounds/notif.wav',
  'sounds/penalty.wav', 'sounds/second.wav', 'sounds/sub.wav', 'sounds/var.wav'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(C);
    await cache.addAll(A);
    try { await cache.add('./'); } catch (_) { /* The Android asset virtual root may not expose a directory index. */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('kx') && key !== C).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(C).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
