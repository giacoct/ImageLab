# ImageLab roadmap

The original wishlist (icon, rotate, strip-metadata, remove-background, tool
chaining, and the format/quality rules) has all shipped and been removed.

**Goal:** keep ImageLab modular and private-by-default — every tool is
self-contained, and adding a new one touches as few files as possible.

---

## Shipped

**Phase 1 — Tool-plugin architecture.** Adding a tool no longer means editing
four places and copy-pasting ~140 lines.

- **Registry-driven routing** — `ImageToolDefinition.loadComponent`; routes are
  generated from `IMAGE_TOOLS`.
- **`ToolShellComponent`** — owns the shared page layout; tools project their
  settings fields and are notified via `filesSelected` / `process`.
- **`BaseToolComponent`** — shared signals, lifecycle, batch loop, and URL
  revocation; a tool implements `processFile` + `toolId`. (This is how the
  planned `ToolProcessor` contract is realized; a fully DOM-free pure-function
  extraction is still open and pairs well with the Web Worker work below.)
- All existing tools migrated onto the shell.

> A new tool = one registry entry (with `loadComponent`) + one small component
> (a settings form + a `processFile` function). No routing edits.

**Phase 2 — Crop and Adjust & filters.**

- **Crop** — aspect-ratio presets (1:1, 4:3, 3:2, 16:9) + custom ratio, with a
  center/edge anchor. Interactive freeform crop is deferred until live preview
  lands (it needs a visual selection surface).
- **Adjust & filters** — brightness, contrast, saturation, grayscale, sepia,
  invert, and blur via the canvas `filter` API; sharpen via a 3×3 convolution.

## Backlog (later)

- **Tools:** watermark, border/padding (pad-to-square), round corners,
  combine/collage, favicon package (.ico + PNGs + `site.webmanifest`),
  EXIF viewer.
- **Header navigation:** replace the single "Tools" link with direct links to
  every tool (Home stays reachable via the ImageLab logo/title). Drive it from
  the registry so new tools appear automatically.
- **Platform/UX (deferred):** live preview with before/after, batch progress,
  remember last-used settings, PWA/offline, dark mode + accessibility pass.
- **Performance:** move heavy per-pixel work (background removal, filters) to a
  Web Worker.

## Testing

- Unit-test every `ToolProcessor` as a pure function.
- Component smoke tests driven by the shared shell.
