// Forces every same-origin request to always revalidate with the network instead of
// trusting the browser's HTTP cache. Without this, GitHub Pages' ~10 min CDN cache
// combined with normal browser caching means users can be stuck on stale JS/CSS for
// a while after every deploy, even with a normal refresh.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'reload' }));
});
