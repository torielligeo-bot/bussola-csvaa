// Service worker: l'app si apre anche senza rete, i dati si aggiornano appena c'è connessione
const CACHE = 'bussola-v3';
const FILE = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icona.svg', 'icona-192.png', 'icona-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // prima la rete (dati sempre freschi), poi la copia salvata
  // no-cache: chiede sempre al server se il file è cambiato (risposta leggera se è uguale)
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok && !url.pathname.endsWith('dati.json')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
