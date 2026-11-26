// Still 2: keeps the app working offline. Your entries live in the phone's storage and in Supabase, not in this cache.
const CACHE = 'still2-v8';
const V = '?v=8';
// The page asks for every script and style with the version on the end, so a phone can never mix old and new files.
const CORE = ['./', './index.html', './app.css' + V, './app.js' + V, './icons.js' + V, './eclipse.js' + V, './vendor/supabase.js' + V, './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('still2-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') { return; }
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (fonts) {
    // Fonts: use the saved copy, fetch and save it the first time.
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) { return; }
  // The app's own files: always ask the network first (checking past any saved browser copy), fall back to the saved copy offline.
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(new Request(req, { cache: 'no-cache' }));
  event.respondWith(
    fresh.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then((hit) => hit || caches.match('./index.html')))
  );
});

// Reminders: Supabase sends a Web Push message; show it as a notification.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Still';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'What are you grateful for right now?',
    icon: './icon-192.png',
    badge: './badge-96.png',
    tag: d.tag || 'still-reminder',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// Tapping a reminder opens Still on Write (or brings the open app to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        c.postMessage({ type: 'still-reminder' });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
