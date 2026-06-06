# ImageLab

Browser-based image tools that run entirely on your device. Images are never
uploaded to a server — all processing happens locally using native browser APIs.

## Tools

- **Resize** – change dimensions, optionally preserving aspect ratio.
- **Convert** – export images as JPEG, PNG, or WebP.
- **Compress** – reduce file size while keeping the original format.
- **Create ICO icons** – turn images into `.ico` files (16–256 px).
- **Rotate and flip** – rotate, mirror, or flip without changing the format.
- **Strip metadata** – rebuild images without embedded metadata.
- **Remove background** – key out a color and export a transparent PNG.

Every tool supports batch processing, and the output of one tool can be sent
straight into another (tool chaining).

Output keeps the source format and 100% quality, except **Convert** (you choose
the format), **Compress** (you choose the quality), and **Remove background**
(always PNG).

## Development

Start a local dev server at `http://localhost:4200/`:

```bash
npm start
```

## Building

Build for production into `dist/`:

```bash
npm run build
```

## Testing

Run the unit tests (Vitest, via the Angular CLI):

```bash
npm test
```

## Tech stack

Angular 21 (standalone components, signals, lazy-loaded routes), TypeScript, and
the browser Canvas API. No third-party image-processing dependencies.
