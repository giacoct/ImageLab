/**
 * ImageLab's service worker, for one thing only: receiving the images shared
 * to the installed app (the manifest's `share_target`). The browser posts
 * them to `share`; they're kept in a cache, and the app opens on `?shared`,
 * where it takes them (src/app/share.ts). Nothing of the app is cached or
 * served from here: every other request goes to the network as usual.
 *
 * It replaces the service worker of earlier versions (same scope), which
 * cached the app for offline use.
 */

const SHARED = "imagelab-shared";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const target = new URL("share", self.registration.scope);
  if (request.method === "POST" && request.url === target.href)
    event.respondWith(receive(request));
});

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
