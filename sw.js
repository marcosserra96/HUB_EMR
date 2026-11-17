/* Hub EMR · Service worker: rede primeiro, cache como reserva para uso offline.
   Ao publicar uma versão, mude CACHE (e APP_VERSION em js/core.js) para renovar os arquivos. */
const CACHE = 'hub-emr-v6-1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './assets/energisa-logo.svg',
  './css/tokens.css', './css/base.css', './css/shell.css', './css/components.css',
  './css/screens.css', './css/workspace.css', './css/teams.css', './css/keyboard.css', './css/report.css',
  './js/core.js', './js/state.js', './js/history.js', './js/dialog.js', './js/domain.js',
  './js/layout.js', './js/render.js', './js/flow.js', './js/kanban.js', './js/pointers.js',
  './js/keyboard.js', './js/review.js', './js/transfer.js', './js/sessions.js',
  './js/commands.js', './js/boot.js'
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => (key.startsWith('hub-emr-') || key.startsWith('hub-emr-touch-')) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy))); }
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy))); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
