/**
 * ImageLab's service worker (registered by src/app/service.ts). It does
 * three things:
 *
 * - It keeps the app's files, so it works offline. The build writes them
 *   into `FILES` below, each with a hash of its content (vite.config.ts).
 *   The small ones are kept when the worker installs; the large ones (the
 *   upscaler's runtime and model, OCR's engine and languages, the AVIF and
 *   HEIC codecs) the first time they're used. A kept file is served from
 *   here as long as its hash is the build's; the page itself comes from the
 *   network first, so a new version shows up as soon as it's online.
 * - It makes the app cross-origin isolated, by adding the headers that ask
 *   for it (COOP and COEP) to every response: GitHub Pages can't send them.
 *   Isolated, the app can use threads (SharedArrayBuffer), so the AVIF
 *   encoder and the upscaler's CPU fallback run on several cores. Everything
 *   the app loads is its own, which these headers allow.
 * - It receives the images shared to the installed app (the manifest's
 *   `share_target`). The browser posts them to `share`; they're kept in a
 *   cache, and the app opens on `?shared`, where it takes them
 *   (src/app/share.ts).
 */

/** [path, hash, bytes] of every file of the build. */
const FILES = /* filled in by the build */ [];

/** Files up to this size are kept when the worker installs. */
const UPFRONT = 1024 * 1024;

const KEPT = "imagelab-files";
const SHARED = "imagelab-shared";
/** The header a kept file's hash is stored in. */
const HASH = "x-imagelab-hash";

const urlOf = (path) => new URL(path, self.registration.scope).href;
const hashes = new Map(FILES.map(([path, hash]) => [urlOf(path), hash]));
const PAGE = urlOf("index.html");

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // What can't be kept now will be on first use.
  event.waitUntil(keepUpfront().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await dropStale();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.href === urlOf("share"))
    event.respondWith(receive(request));
  else if (request.method !== "GET") return;
  else if (request.mode === "navigate") event.respondWith(page(event));
  else event.respondWith(file(event, url.origin + url.pathname));
});

async function keepUpfront() {
  const cache = await caches.open(KEPT);
  for (const [path, hash, bytes] of FILES) {
    const url = urlOf(path);
    if (bytes > UPFRONT || (await isKept(cache, url, hash))) continue;
    await keep(cache, url, hash, await fetch(url, { cache: "no-cache" }));
  }
}

/** Drop what earlier builds kept, and the caches of earlier versions. */
async function dropStale() {
  for (const name of await caches.keys())
    if (name !== KEPT && name !== SHARED) await caches.delete(name);
  const cache = await caches.open(KEPT);
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response?.headers.get(HASH) !== hashes.get(request.url))
      await cache.delete(request);
  }
}

async function isKept(cache, url, hash) {
  const response = await cache.match(url);
  return response?.headers.get(HASH) === hash;
}

/** Keep a response under its file's hash. */
async function keep(cache, url, hash, response) {
  if (!response.ok) return;
  const headers = new Headers(response.headers);
  headers.set(HASH, hash);
  // What the network said of the bytes it sent, not of the ones kept.
  headers.delete("content-encoding");
  headers.delete("content-length");
  const body = await response.blob();
  await cache.put(
    url,
    new Response(body, { status: response.status, headers }),
  );
}

/** Keep a copy of the response while it's served, if it's the build's file. */
function keepCopy(event, url, hash, response) {
  if (!hash || !response.ok || response.redirected) return;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(KEPT)
      .then((cache) => keep(cache, url, hash, copy))
      .catch(() => {}),
  );
}

/** The page: from the network, kept for offline; the kept one when offline. */
async function page(event) {
  try {
    const response = await fetch(event.request);
    keepCopy(event, PAGE, hashes.get(PAGE), response);
    return isolated(response);
  } catch (error) {
    const kept = await caches.match(PAGE, { cacheName: KEPT });
    if (kept) return isolated(kept);
    throw error;
  }
}

/** A file of the app: the kept one if it's the build's, else from the network. */
async function file(event, url) {
  const hash = hashes.get(url);
  if (hash) {
    const kept = await caches.match(url, { cacheName: KEPT });
    if (kept?.headers.get(HASH) === hash) return isolated(kept);
  }
  const response = await fetch(event.request);
  keepCopy(event, url, hash, response);
  return isolated(response);
}

/** The response with the headers that isolate the app. */
function isolated(response) {
  // Opaque and error responses can't be rebuilt; the app doesn't make any.
  if (response.type === "opaque" || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function receive(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("images").filter((file) => file instanceof File);
    await caches.delete(SHARED); // what an earlier share left, if anything
    const cache = await caches.open(SHARED);
    await Promise.all(
      files.map((file, index) =>
        cache.put(
          new Request(new URL(`shared/${index}`, self.registration.scope)),
          new Response(file, {
            headers: {
              "content-type": file.type,
              "x-name": encodeURIComponent(file.name),
            },
          }),
        ),
      ),
    );
  } catch {
    // Nothing usable was shared: the app opens all the same.
  }
  return Response.redirect(new URL("./?shared", self.registration.scope), 303);
}
