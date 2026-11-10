# ImageLab

Image tools that run entirely in the browser. There is no server and nothing
is uploaded.

Load some images on the home page and pick a tool. Each tool is a page of
its own, and the browser's Back button returns to the home page. A tool can
also be opened first: without images it stays greyed out until you go back
and load some. Tweak the settings while a live preview shows the result
(zoom in to look closely: what's in view is rendered from the full-size
image, as sharp as the result), then apply the tool to all the images at
once.
Results can be renamed before they're saved (tap a name to change it).
Download the results, one by one or as a ZIP, share them to another app, or
use them as the input of another tool: crop, then scale, then convert to
WebP, then compress to 200 KB, without downloading anything in between.

Once opened, ImageLab works offline too. The larger parts of some tools
(Upscale with AI, Extract text, AVIF and HEIC files) are downloaded the
first time they're used, and work offline from then on.

Where the browser allows it, the slow work (AVIF files, upscaling without a
GPU) runs on several cores. GitHub Pages can't send the headers that allow
it, so the service worker adds them; the very first visit reloads once for
it.

On a phone, ImageLab can be installed from the browser's menu ("Add to Home
screen"). Installed, it shows up in the share sheet on Android, so photos can
be sent to it straight from the gallery.

Results are kept at full quality and only saved to a file when you download
them, so using them as input never adds compression. Convert format and
Compress decide how that file is saved, and show its size and look right
away. A photo's details (camera, date, location…) stay in the files made
from it, except AVIF files, until Strip metadata removes them; the embedded
thumbnail is dropped, so it can't show what a crop cut off.
Wide-gamut photos (Display P3, as recent phones take them) keep their
vivid colors through the tools, in browsers that can hold them (Chrome,
Edge, Safari); elsewhere they're worked on in sRGB.

## Tools

- **Rotate, flip & crop**: turn by quarter turns or straighten by any angle
  (to 0.1°, cropping the empty corners or keeping them transparent), mirror,
  and crop freely or to a ratio, landscape or portrait, seeing the result's
  size in pixels.
- **Scale**: by percentage, to fit a box, or to a width or height.
- **Upscale with AI**: enlarge 2× or 4× and rebuild the detail, with
  Real-ESRGAN's general model (BSD-3-Clause), on the GPU where the browser
  supports WebGPU.
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
- **Compress**: to a chosen quality, showing the file's size, or to fit a
  file size, showing the quality it takes.
- **Strip metadata**: remove camera, lens, date, location, author and other
  details without re-encoding the image, listing what each image carries
  (HEIC photos included).
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
npm run check     # formatting, type check, all tests (in Chromium too)
npm run build     # → dist/
```

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/pages.yml`): <https://giacoct.github.io/ImageLab/>. The
repository's Pages source must be set to GitHub Actions.
