// Minimal service worker: lets phones install the scorecard as an app, and shows
// a friendly page instead of a browser error if the app is opened with no signal.
// It never caches scores or app code, so updates always arrive straight away.
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => { e.waitUntil(caches.open('shell-v1').then((c) => c.add(OFFLINE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
