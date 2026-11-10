// Pullman Cultural Trail service worker
// - The app page and hours.json: network first, so updates and live hours arrive
//   immediately; the cached copy is used only when offline.
// - Map library and map tiles: cache first, with a cap on stored tiles.
// - Everything else (routing, weather, calendar, analytics): never cached.
const VERSION = 'pct-v2';
const CORE = `${VERSION}-core`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 400;
const PRECACHE = [
  './', './index.html', './hours.json', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'
];
// Fetched best-effort: a CDN hiccup must not stop the app shell from installing.
const PRECACHE_OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.addAll(PRECACHE);
    await Promise.all(PRECACHE_OPTIONAL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req){
  const cache = await caches.open(CORE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if(res && res.ok) cache.put(req, res.clone());
    return res;
  } catch(err){
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || cache.match('./index.html');
  }
}

async function cacheFirst(req, name, limit){
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(res && (res.ok || res.type === 'opaque')){
    cache.put(req, res.clone());
    if(limit){
      const keys = await cache.keys();
      if(keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map(k => cache.delete(k)));
    }
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === location.origin){
    if(req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('hours.json')){
      e.respondWith(networkFirst(req));
    } else {
      e.respondWith(cacheFirst(req, CORE));
    }
    return;
  }
  if(url.hostname === 'cdn.jsdelivr.net'){ e.respondWith(cacheFirst(req, CORE)); return; }
  if(url.hostname.endsWith('basemaps.cartocdn.com')){ e.respondWith(cacheFirst(req, TILES, MAX_TILES)); return; }
  // Routing, weather, calendar, analytics: go straight to the network.
});
