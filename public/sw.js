// NexusAI Service Worker — v4.2.0
// Caches app shell for offline use + fast loading on iPhone

const CACHE = 'nexusai-v4.2.0';
const STATIC = [
  '/',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first for API, cache first for assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // Always network for API calls, WebSockets, external requests
  if (url.pathname.startsWith('/api/') ||
      e.request.url.includes('generativelanguage.googleapis.com') ||
      e.request.url.includes('api.anthropic.com') ||
      e.request.url.includes('ollama') ||
      url.hostname !== self.location.hostname) {
    return; // let browser handle it normally
  }

  // For navigation requests (HTML pages) — network first, fall back to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // For static assets — cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

// Background sync placeholder
self.addEventListener('sync', () => {});
