import { mount } from "svelte";

import "./styles.css";
import { startRouter } from "./app/router";
import { session } from "./app/session.svelte";
import { startServiceWorker } from "./app/service";
import { takeShared } from "./app/share";
import App from "./ui/App.svelte";

startRouter();
mount(App, { target: document.getElementById("app")! });

startServiceWorker(() => session.items.length === 0 && session.reading === 0);
takeShared().then(
  (files) => session.addFiles(files),
  () => {},
);
