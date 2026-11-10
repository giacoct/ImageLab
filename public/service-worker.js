/**
 * ImageLab's service worker (registered by src/app/service.ts). It does two
 * things:
 *
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

const SHARED = "imagelab-shared";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.href === shareUrl().href)
    event.respondWith(receive(request));
  else if (request.method === "GET") event.respondWith(isolated(request));
});

function shareUrl() {
  return new URL("share", self.registration.scope);
}

/** The response from the network, with the headers that isolate the app. */
async function isolated(request) {
  const response = await fetch(request);
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
