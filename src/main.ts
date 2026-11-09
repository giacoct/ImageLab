import { mount } from "svelte";

import "./styles.css";
import { startRouter } from "./app/router";
import App from "./ui/App.svelte";

startRouter();
mount(App, { target: document.getElementById("app")! });

// Earlier versions installed a service worker for offline use. Remove it and
// its cache, so old installs load the current version from the network.
navigator.serviceWorker?.getRegistrations().then(
  (registrations) =>
    registrations.forEach((registration) => void registration.unregister()),
  () => {},
);
// Both only exist on secure origins (HTTPS, localhost).
if ("caches" in globalThis) caches.delete("imagelab").catch(() => {});
