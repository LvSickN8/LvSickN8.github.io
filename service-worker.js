const CACHE_NAME = 'fuguang-liquid-glass-v17';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './css/tokens.css',
  './css/glass.css',
  './css/layout.css',
  './css/animations.css',
  './js/app.js',
  './data/profile/profile.json',
  './data/diary/index.json',
  './data/diary/2026-08-25-moonlight.md',
  './data/gallery/gallery.json',
  './data/music/tracks.json',
  './data/mood/mood.json',
  './data/timeline/timeline.json',
  './data/knowledge/nodes.json',
  './data/capsule/capsules.json',
  './data/notes/notes.json',
  './data/map/map.json',
  './data/ai/echoes.json',
  './assets/photos/window-light.svg',
  './assets/photos/river-wind.svg',
  './assets/photos/desk.svg',
  './assets/photos/night-walk.svg',
  './assets/photos/cloud.svg',
  './assets/photos/tea.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url))).then((results) => {
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length) console.warn('部分离线资源缓存失败，将在联网时继续可用：', failed);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  const isDataFile = url.pathname.includes('/data/');
  event.respondWith(isDataFile ? networkFirst(event.request) : cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return fetchAndCache(request);
}

async function networkFirst(request, fallbackUrl) {
  const cached = await caches.match(request);
  try {
    return await fetchAndCache(request);
  } catch (_) {
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('离线且没有可用缓存', { status: 503, statusText: 'Offline' });
  }
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.ok && response.type !== 'opaque') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch((error) => console.warn('缓存更新失败：', error));
  }
  return response;
}
