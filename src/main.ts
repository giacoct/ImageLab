import { mount } from 'svelte';

import '@fontsource-variable/bricolage-grotesque';

import './styles.css';
import App from './ui/App.svelte';

mount(App, { target: document.getElementById('app')! });

// Offline support and caching of the large WASM/model files (production only:
// in development it would serve stale modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Without it the app still works; it just isn't available offline.
    });
  });
}
