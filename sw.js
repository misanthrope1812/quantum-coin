/* Service worker: приложение открывается без сети (кроме запроса к ANU — он всегда идёт в сеть).
   Свои файлы берутся сначала из сети, поэтому правки видны сразу; кэш нужен на случай офлайна.
   После правок всё же увеличьте VERSION — так старый кэш удалится. */
const VERSION = 'qc-v5';
const FONTS = 'qc-fonts';
const SHELL = [
  './', './index.html', './app.js', './manifest.webmanifest', './img/heads.webp', './img/tails.webp',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './sounds/flick.mp3', './sounds/land.mp3'
];

self.addEventListener('install', e => {
  // cache: 'reload' — мимо HTTP-кэша браузера, иначе GitHub Pages ещё 10 минут отдаёт старые файлы
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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

  // своё: сначала сеть (с проверкой свежести), без сети или через 3 с тишины — из кэша
  e.respondWith(caches.open(VERSION).then(c => {
    const cached = () => c.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? c.match('./index.html') : undefined));
    const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    });
    const slow = new Promise(r => setTimeout(r, 3000)).then(cached);
    return Promise.race([net, slow.then(hit => hit || net)])
      .catch(() => cached().then(hit => hit || Response.error()));
  }));
});
