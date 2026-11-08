# ImageLab

Image tools that can be chained without limit, running entirely in the
browser. There is no server and nothing is uploaded.

Load some images, then add steps: crop, then scale, then convert to WebP, then
compress to 200 KB. Any tool can follow any other, any number of times, and
every step works on all the images you loaded. A live preview shows the result
as you change the settings.

## Tools

- **Rotate, flip & crop**: turn or mirror the image, and crop it freely or to
  a ratio.
- **Scale**: by percentage, to fit a box, or to a width or height.
- **Adjust & filters**: brightness, contrast, saturation, grayscale, sepia,
  invert, blur, sharpen.
- **Convert format**: JPEG, PNG, WebP or AVIF.
- **Compress**: to a chosen quality, or to fit a file size.

Images keep their format unless a Convert format step changes it. HEIC photos
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
