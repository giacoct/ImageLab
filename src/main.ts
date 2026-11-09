import { mount } from "svelte";

import "./styles.css";
import { startRouter } from "./app/router";
import { session } from "./app/session.svelte";
import { receiveShares, takeShared } from "./app/share";
import App from "./ui/App.svelte";

startRouter();
mount(App, { target: document.getElementById("app")! });

receiveShares();
takeShared().then(
  (files) => session.addFiles(files),
  () => {},
);

// Earlier versions cached the app for offline use; their service worker is
// replaced by the share target's (same scope). Drop what it cached.
if ("caches" in globalThis) caches.delete("imagelab").catch(() => {});
