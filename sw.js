/* Service worker: приложение открывается без сети (кроме запроса к ANU — он всегда идёт в сеть).
   После правок в файлах увеличьте VERSION, чтобы телефоны забрали новую версию. */
const VERSION = 'qc-v3';
const FONTS = 'qc-fonts';
const SHELL = [
  './', './index.html', './app.js', './coin.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './sounds/flick.mp3', './sounds/land.mp3'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'qrng.anu.edu.au') return; // квантовые байты не кэшируем

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }

  if (url.origin !== location.origin) return;

  // своё: сразу из кэша, а в фоне обновляем из сети
  e.respondWith(caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()));
    return hit || net;
  })));
});
