/* Service worker : met toute l'application en cache pour qu'elle fonctionne sans réseau.
   Changer VERSION à chaque mise à jour du code pour que les téléphones récupèrent la nouvelle version. */
const VERSION = 'carnet-v1';
const FICHIERS = [
  './',
  'index.html',
  'app.js',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/fonts.css',
  'vendor/fonts/cormorant-garamond-400-italic-latin-ext.woff2',
  'vendor/fonts/cormorant-garamond-400-italic-latin.woff2',
  'vendor/fonts/cormorant-garamond-500-italic-latin-ext.woff2',
  'vendor/fonts/cormorant-garamond-500-italic-latin.woff2',
  'vendor/fonts/cormorant-garamond-500-normal-latin-ext.woff2',
  'vendor/fonts/cormorant-garamond-500-normal-latin.woff2',
  'vendor/fonts/source-sans-3-400-normal-latin-ext.woff2',
  'vendor/fonts/source-sans-3-400-normal-latin.woff2',
  'vendor/fonts/source-sans-3-600-normal-latin-ext.woff2',
  'vendor/fonts/source-sans-3-600-normal-latin.woff2',
  'vendor/jszip.min.js',
  'vendor/xlsx.mini.min.js',
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'vendor/tesseract/lang/fra.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((trouve) => {
      if (trouve) return trouve;
      if (req.mode === 'navigate') return caches.match('index.html');
      return fetch(req).then((rep) => {
        if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); }
        return rep;
      });
    })
  );
});
