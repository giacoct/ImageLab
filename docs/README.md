# ImageLab

A suite of tools to edit images, which can be chained without limit.

Open any tool, then add any other tool after it, as many times as you like:
crop, then scale, then convert to WebP, then compress to 200 KB. Each tool is
one step of the chain, and every step works on all the images you loaded.

Everything runs in the browser. There is no server and nothing is uploaded.

## Tools

- **Rotate, flip & crop**: turn or mirror the image, and crop it freely or to
  a ratio.
- **Scale**: by percentage, to fit a box, or to a width or height.
- **Adjust & filters**: brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen.
- **Remove background**: make a color transparent (click the preview to pick
  it).
- **Add margin**: colored or transparent, in pixels or percent.
- **Merge images**: combine all the images into one, stacked or side by side.
- **Upscale 4×**: AI super-resolution (Real-ESRGAN).
- **Convert format**: JPEG, PNG, WebP, AVIF, or an ICO icon.
- **Compress**: to a chosen quality, or to fit a file size.
- **Strip metadata**: remove camera, date and GPS details, without
  re-encoding the image when it's otherwise untouched.
- **Convert to SVG**: trace the image into vector shapes (ends the chain).
- **Extract text (OCR)**: read the text in the image (ends the chain).

Images keep their format unless a Convert format step changes it. Results can
be downloaded one by one or as a ZIP, or loaded back as the input of a new
chain. A chain can be saved as a recipe. The app works offline once loaded.

## Running it

Requires Node.js 26.

```bash
npm ci
npm run dev       # http://localhost:4200
npm run check     # formatting, type check, all tests
npm run build     # → dist/
```

## Deploying

Every push to `master` builds the site and publishes it to GitHub Pages
(`.github/workflows/pages.yml`): <https://giacoct.github.io/ImageLab/>. The
repository's Pages source must be set to GitHub Actions, and the build
downloads the upscaler model from the `models-v1` release.
