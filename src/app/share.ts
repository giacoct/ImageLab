/**
 * The system share sheet, both ways.
 *
 * Out: results go to other apps with `navigator.share`, where the browser
 * can share files (phones, and Safari and Chrome on the desktop).
 *
 * In: once installed, the app is a target of the share sheet (the
 * manifest's `share_target`). The browser posts the shared images to
 * `share`; the service worker (`public/share-target.js`) keeps them in a
 * cache and opens `?shared`, where the app takes them.
 */

/** Where the service worker keeps shared images until the app takes them. */
const SHARED = "imagelab-shared";

/** Whether the browser can share these files (or, without any, image files at all). */
export function canShareFiles(
  files: File[] = [new File([], "image.png", { type: "image/png" })],
): boolean {
  try {
    return navigator.canShare?.({ files }) ?? false;
  } catch {
    return false;
  }
}

/** Open the share sheet; it rejects with an `AbortError` when the user closes it. */
export function shareFiles(files: File[]): Promise<void> {
  return navigator.share({ files });
}

/** Registered at the app's root, so the share target is in its scope. */
export function receiveShares(): void {
  navigator.serviceWorker?.register("share-target.js").catch(() => {
    // Without it the app works the same; it just can't receive shares.
  });
}

/** The images shared to the app, if it was opened by a share; once. */
export async function takeShared(): Promise<File[]> {
  const url = new URL(location.href);
  if (!url.searchParams.has("shared")) return [];
  url.searchParams.delete("shared");
  history.replaceState(null, "", url);
  if (!("caches" in globalThis)) return [];
  const cache = await caches.open(SHARED);
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const name = decodeURIComponent(response.headers.get("x-name") ?? "image");
    files.push(
      new File([await response.blob()], name, {
        type: response.headers.get("content-type") ?? "",
      }),
    );
  }
  await caches.delete(SHARED);
  return files;
}
