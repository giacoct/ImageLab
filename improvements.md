# ImageLab roadmap

The original wishlist (icon, rotate, strip-metadata, remove-background, tool
chaining, and the format/quality rules) has all shipped and been removed.

**Goal:** keep ImageLab modular and private-by-default — every tool is
self-contained, and adding a new one touches as few files as possible.

---

## Phase 1 — Tool-plugin architecture (in progress, do first)

Today, adding a tool means editing **four** places (`tool-registry.service.ts`,
`app.routes.ts`, a new component, sometimes `image-processing.service.ts`) and
copy-pasting ~140 lines of identical state, lifecycle, and template per tool.
This phase removes that so the tools in Phase 2 are cheap to add.

1. **Registry-driven routing.** Add `loadComponent` to `ImageToolDefinition`
   and generate the router config from `IMAGE_TOOLS`. The registry already
   drives the home grid and tool chaining — make it the single source of truth
   for routing too.
2. **`ToolProcessor<TSettings>` interface.** `process(file, settings) =>
   Promise<ImageOutput>`. Move each tool's logic into a small, DOM-free,
   unit-testable function.
3. **`ToolShellComponent`.** Owns the shared layout (back-link, header,
   dropzone, selected-files list, error, process button, output list) and the
   shared signals/lifecycle (`selectedFiles`, `outputs`, `isProcessing`,
   `error`, URL revocation, `pipeline.consume`). Tools project their settings
   form into it and provide a `processFile` callback.
4. **Migrate the 7 existing tools** onto the shell to validate the abstraction.

> End state: a new tool = one registry entry (with `loadComponent`) + one small
> component (a settings form + a `processFile` function). No routing edits.

## Phase 2 — Next tools (after the refactor)

- **Crop** — freeform + aspect-ratio presets (1:1, 16:9, 4:3).
- **Adjust & filters** — brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen.

## Backlog (later)

- **Tools:** watermark, border/padding (pad-to-square), round corners,
  combine/collage, favicon package (.ico + PNGs + `site.webmanifest`),
  EXIF viewer.
- **Platform/UX (deferred):** live preview with before/after, batch progress,
  remember last-used settings, PWA/offline, dark mode + accessibility pass.
- **Performance:** move heavy per-pixel work (background removal, filters) to a
  Web Worker.

## Testing

- Unit-test every `ToolProcessor` as a pure function.
- Component smoke tests driven by the shared shell.
