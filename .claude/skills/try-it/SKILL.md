---
name: try-it
description: Run ImageLab and drive it in a real (headless) browser to check that a change works and looks right: load images, build a chain of steps, look at the preview, process, inspect results and screenshots. Use after any UI or tool change, or when asked to run, test or screenshot the app.
---

# Trying ImageLab in a browser

Tests cover the engine; this checks what a person sees. Playwright and its
Chromium are dev dependencies already.

## Start the app

- Dev server: `npx vite --port 4377 --strictPort` in the background, then wait
  for `curl -s http://localhost:4377/` to answer. Stop it afterwards
  (`pkill -f "vite --port 4377"`).
- To check the **production build** as deployed (relative base path, OCR
  files at `ocr/`): `npm run build`, copy `dist/` into a folder as
  `ImageLab/`, serve that folder (`python3 -m http.server 4379`) and open
  `http://localhost:4379/ImageLab/`.

## Drive it

Write a short Playwright script in the scratchpad (not in the repo), import
Playwright by absolute path (`<repo>/node_modules/playwright/index.mjs`) and
use `drive.mjs` next to this file as the starting point. Useful handles:

- images: `page.setInputFiles('input[type=file]', [...])` with paths, or
  buffers made in the page (`OffscreenCanvas` → PNG) for synthetic images;
  wait until the page no longer says `Reading`;
- add a step: `page.selectOption('select[aria-label="Add a step"]', { label: '<tool title>' })`;
- settings: inputs have ids `<step id>-<setting>` (`input[id$="-quality"]`);
  checkboxes by label (`page.getByLabel('Transparent', { exact: true })`);
  choices are buttons (`button:has-text("WebP")`);
- step controls: `button[aria-label="Move <title> up"]`, `Remove <title>`;
- run: `button.primary`; results are done when `.summary` reads
  `N result(s)`; thumbnails in `.grid`, OCR text in `textarea`;
- collect `console` errors and `pageerror`s, and take full-page screenshots.

Then **look at the screenshots** (Read them) and judge the result as a
person would: layout, wording, empty states, errors. Tesseract logs a couple
of harmless messages to the console during OCR.
