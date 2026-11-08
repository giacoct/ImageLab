---
name: new-tool
description: Add a new image tool (a step of the chain) to ImageLab, or change how an existing one works. Use whenever the user asks for a new feature that processes images, e.g. "add a watermark tool", "add sepia to adjust", "support blurring faces".
---

# Adding a tool to ImageLab

Every tool is one operation in `src/ops/`, and every operation is a step that
can follow any other. Read `docs/architecture.md` (Operations) first if it
isn't in context.

## 1. Design it

- Pick the **kind** (`src/ops/op.ts`):
  - `map`: changes the pixels, one image in and out (most tools);
  - `file`: changes how the image is saved (format, quality, metadata);
  - `combine`: all images in, one out (like Merge images);
  - `final`: ends the chain with a non-image Blob (like OCR, SVG).
- Pick **settings** a person understands, with good defaults: the form is
  generated from the schema (`src/core/params.ts`: number, choice, boolean,
  color; `custom` needs its own editor in `src/ui/`). Use `when` to hide
  settings that don't apply, `hint` for one line of guidance. Few settings,
  each obviously useful.
- Pure math (pixel loops, geometry, parsing) goes in `src/core/` as plain
  TypeScript with no DOM, so it can be unit-tested in Node.

## 2. Build it

1. `src/core/<topic>.ts` + `<topic>.test.ts` for the pure logic.
2. `src/ops/<id>.ts`, using the `mapOp`/`fileOp`/`combineOp`/`finalOp` helper
   so `values` are typed from the schema. Start the file with a one-line
   comment saying what the tool does. In `run`:
   - multiply settings given in **pixels** by `context.scale` (the live
     preview runs the same code on a downscaled copy);
   - throw an `Error` with a message meant for the user when the input
     can't be processed;
   - load WASM or other heavy code lazily (`await import(...)`), once per
     worker; mark slow, memory-hungry tools `heavy: true`.
3. Add it to `OPS` in `src/ops/index.ts`, where it reads well in the
   "Add a step" list.
4. A browser test in `src/engine/engine.test.ts`: run the operation on a
   synthetic image and check real pixels, sizes or output.
5. New dependency? `npm install --save-exact <pkg>@<latest>`. If it ships
   WASM located through `import.meta.url`, add it to `optimizeDeps.exclude`
   in `vite.config.ts`; if only the worker imports it, to
   `optimizeDeps.include`.

## 3. Check it

- `npm run check` passes.
- Try it in the real UI (`/try-it`): the form reads well, the preview reacts
  to every setting, processing a batch gives the expected files.
- Update `README.md` (Tools) and, if the design changed, `docs/architecture.md`.
