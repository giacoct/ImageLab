# ImageLab

ImageLab is a lightweight, local-first image processing web app built with pure PHP and Linux CLI tools.

## Features
- Conversion engine for common raster formats using ImageMagick.
- Editing tools: resize, crop, rotate, flip, grayscale, sepia, invert, brightness/contrast, and color replacement.
- Optimization toolkit: pngquant + optipng, jpegoptim, gifsicle, exiftool metadata stripping.
- SVG toolkit: bitmap vectorization (Potrace), SVG export (Inkscape), SVG cleanup.
- Batch processing through ZIP upload/extract/process/repack.

## Requirements
Install tools on Debian host:
- `php8.x`, Apache or php built-in server
- `magick`, `inkscape`, `potrace`, `rsvg-convert`
- `pngquant`, `jpegoptim`, `optipng`, `gifsicle`, `exiftool`
- Optional: `ffmpeg`, `graphicsmagick`

## Run locally
```bash
cd public
php -S 0.0.0.0:8080
```
Then open `http://localhost:8080`.

## Directory flow
1. Upload file(s) to `public/upload`
2. Temporary processing in `public/temp`
3. Final output in `public/output`
4. Download through `public/download.php`

## Notes
- Stateless requests; no database required.
- Uses shell commands via PHP `exec`.
- Ensure web server user has write access to `upload`, `temp`, and `output`.
