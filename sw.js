/* Plexo Neo · Service worker
   - Precarga la app (./ y ./index.html) para que abra sin conexión.
   - Navegación: red primero (con tiempo límite) y respaldo en caché,
     así las actualizaciones llegan solas cuando hay internet.
   - Tipografías de Google: caché en segundo plano (si faltan, usa fuentes del sistema).
   Para publicar una versión nueva, cambie VERSION. */
const VERSION = 'plexo-neo-v1.0.0';
const CORE = ['./', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Páginas (abrir la app): red primero, caché si no hay conexión
  if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.endsWith('/index.html'))) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await withTimeout(fetch(req), 4000);
        if (fresh && fresh.ok) {
          cache.put('./index.html', fresh.clone());
          return fresh;
        }
        throw new Error('bad response');
      } catch (e) {
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Tipografías de Google: caché primero, actualización en segundo plano
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION + '-fonts');
      const cached = await cache.match(req);
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    })());
    return;
  }

  // 3) Resto del mismo origen: caché primero
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(c => c || fetch(req).then(res => {
        if (res && res.ok) caches.open(VERSION).then(cache => cache.put(req, res.clone()));
        return res;
      }))
    );
  }
});
