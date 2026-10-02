// Offline cache: the whole game is saved on the phone on first open
const CACHE = 'fpv-kamikaze-v4';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'lib/three.min.js', 'data.js', 'audio.js', 'world.js', 'fx.js', 'flight.js', 'tank.js', 'ui.js',
  'fonts/russo-one-cyrillic-400-normal.woff2', 'fonts/russo-one-latin-400-normal.woff2',
  'fonts/pt-sans-narrow-cyrillic-400-normal.woff2', 'fonts/pt-sans-narrow-latin-400-normal.woff2',
  'fonts/pt-sans-narrow-cyrillic-700-normal.woff2', 'fonts/pt-sans-narrow-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-cyrillic-500-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'fonts/ibm-plex-mono-cyrillic-700-normal.woff2', 'fonts/ibm-plex-mono-latin-700-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// cache first, then network; new versions arrive when CACHE name changes
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true}).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
