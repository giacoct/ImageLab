# ImageLab

Image tools that run entirely in the browser. There is no server and nothing
is uploaded.

Load some images and pick a tool, or pick a tool and then load the images. The
tool works on all of them at once, with a live preview as you change the
settings. Its results can be downloaded, or taken further with another tool:
crop, then scale, then convert to WebP, then compress to 200 KB. Undo and redo
go back and forth through everything you did.

Results are kept at full quality between tools and only saved to a file when
you download them, so taking an image through several tools never adds
compression. Convert format and Compress decide how that file is saved, and
show its size and look right away.

## Tools

- **Rotate, flip & crop**: turn or mirror the image, and crop it freely or to
  a ratio.
- **Scale**: by percentage, to fit a box, or to a width or height.
- **Adjust & filters**: brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen.
- **Remove background**: make a plain background transparent; its color is
  detected, and only the background around the subject goes.
- **Add margin**: colored or transparent, in pixels or percent, the same on
  every side or each its own.
- **Merge images**: combine all the images into one, stacked or side by side.
- **Convert format**: JPEG, PNG, WebP or AVIF.
- **Compress**: to a chosen quality, or to fit a file size.
- **Strip metadata**: remove camera, date and GPS details without
  re-encoding the image.
- **Convert to SVG**: trace the image into vector shapes, saved as SVG.
- **Extract text (OCR)**: read the text in the image, in English and/or
  Italian, saved as text.

Images keep their format unless Convert format changes it. HEIC photos
can be opened too. Results can be downloaded one by one or as a ZIP.

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
