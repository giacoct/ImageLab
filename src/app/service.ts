/**
 * The service worker (`public/service-worker.js`): it isolates the app, so
 * it can use threads, and receives the images shared to it.
 *
 * The first time, the page loads before the service worker runs, so it isn't
 * isolated: once the worker takes over, it's loaded again, unless something
 * was done in it already (then it's isolated from the next visit on). The
 * dev server sends the headers itself (vite.config.ts) and goes without.
 */

const RELOADED = "imagelab-isolating";

export function startServiceWorker(idle: () => boolean): void {
  const container = navigator.serviceWorker;
  if (!container) return;
  if (import.meta.env.DEV) {
    // Left over from a build served on this address.
    void container
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => r.unregister()));
    return;
  }
  // Registered at the app's root, so the share target is in its scope.
  container.register("service-worker.js").catch(() => {
    // Without it the app works the same, on one core, and can't receive shares.
  });
  if (crossOriginIsolated) return;
  container.addEventListener(
    "controllerchange",
    () => {
      if (!idle() || once()) return;
      location.reload();
    },
    { once: true },
  );
}

/** Whether the page was already loaded again for this, in this tab. */
function once(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED)) return true;
    sessionStorage.setItem(RELOADED, "1");
    return false;
  } catch {
    return true; // can't tell: better not to
  }
}
