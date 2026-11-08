/**
 * ImageLab service worker: makes the app work offline and downloads each
 * file only once, including the large WASM engines and model weights.
 *
 * The build (vite.config.ts) replaces __BUILD__ with this deploy's files,
 * each with a hash of its content, and the app shell. Files are cached under
 * their URL plus that hash, so:
 * - the shell (page, script, styles, fonts, engine worker, icons) is cached
 *   on install: the app works offline from the first visit on;
 * - everything else (codecs, HEIC, OCR, the upscaler) is cached the first
 *   time it's used, and downloaded again only when its content changes;
 * - files no longer part of the app are deleted when a new version takes over.
 *
 * The page itself comes from the network when online, so a new deploy shows
 * up on reload. A new service worker takes over only once no tab uses the
 * old one (no skipWaiting), so an open tab never loses files it may still load.
 */

/** @type {{ files: Record<string, string>; shell: string[] }} */
const BUILD = __BUILD__;

const CACHE = 'imagelab';
/** The app's root: the service worker sits at the root of the deploy. */
const ROOT = new URL('./', self.location.href);

/** Where a file of this version is cached: its URL plus its content hash. */
function keyOf(path) {
  return `${new URL(path, ROOT).href}?v=${BUILD.files[path]}`;
}

/** Past the HTTP cache, which may still hold an older version of a file. */
function fetchFresh(path) {
  return fetch(new URL(path, ROOT), { cache: 'no-cache' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        BUILD.shell.map(async (path) => {
          if (await cache.match(keyOf(path))) return; // unchanged since an earlier version
          const response = await fetchFresh(path);
          if (!response.ok) throw new Error(`Could not cache ${path} (HTTP ${response.status}).`);
          await cache.put(keyOf(path), response);
        }),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Caches of older service workers, and files that are no longer part of the app.
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      const cache = await caches.open(CACHE);
      const current = new Set(Object.keys(BUILD.files).map(keyOf));
      for (const request of await cache.keys()) {
        if (!current.has(request.url)) await cache.delete(request);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(ROOT.href)) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  const url = new URL(request.url);
  const path = url.pathname.slice(ROOT.pathname.length);
  // Anything else (e.g. a newer deploy's files before this worker updates)
  // goes to the network as usual.
  if (url.search || !(path in BUILD.files)) return;
  event.respondWith(appFile(event, path));
});

/** The page: the latest from the network, or the cached one offline. */
async function page(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(keyOf('index.html'));
    if (cached) return cached;
    throw error;
  }
}

/** A file of the app: from the cache, or downloaded and kept for next time. */
async function appFile(event, path) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(keyOf(path));
  if (cached) return cached;
  const response = await fetchFresh(path);
  if (response.ok) event.waitUntil(cache.put(keyOf(path), response.clone()));
  return response;
}
