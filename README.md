# ImageLab

Image tools that run entirely in the browser. There is no server and nothing
is uploaded.

Load some images on the home page and pick a tool. Each tool is a page of
its own, and the browser's Back button returns to the home page. A tool can
also be opened first: without images it stays greyed out until you go back
and load some. Tweak the settings while a live preview shows the result
(zoom in to look closely), then apply the tool to all the images at once.
Download the results, one by one or as a ZIP, or use them as the input of
another tool: crop, then scale, then convert to WebP, then compress to
200 KB, without downloading anything in between.

Results are kept at full quality and only saved to a file when you download
them, so using them as input never adds compression. Convert format and
Compress decide how that file is saved, and show its size and look right
away.

## Tools

- **Rotate, flip & crop**: turn or mirror the image, and crop it freely or to
  a ratio.
- **Scale**: by percentage, to fit a box, or to a width or height.
- **Adjust & filters**: brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen; the preview follows the sliders as you drag
  (drawn by the GPU).
- **Remove background**: make a plain background transparent; its color is
  detected or picked on the image, and only the background around the
  subject goes.
- **Add margin**: colored (pick the color on the image) or transparent, in
  pixels or percent, the same on every side or each its own; drag the edges
  of the preview, or type the sizes.
- **Merge images**: combine all the images into one, stacked or side by side.
- **Convert format**: JPEG, PNG, WebP or AVIF.
- **Compress**: to a chosen quality, or to fit a file size.
- **Strip metadata**: remove camera, date and GPS details without
  re-encoding the image.
- **Convert to SVG**: trace the image into vector shapes, saved as SVG.
- **Extract text (OCR)**: read the text in the image, in English and/or
  Italian, saved as text.

Images keep their format unless Convert format changes it. HEIC photos
can be opened too.

## Running it

Requires Node.js 26.

```bash
npm ci
npm run dev       # http://localhost:4200
npm run check     # formatting, type check, all tests
npm run build     # → dist/
```

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/pages.yml`): <https://giacoct.github.io/ImageLab/>. The
repository's Pages source must be set to GitHub Actions.
