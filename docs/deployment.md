# Deployment (GitHub Pages)

ImageLab is a static site. Every push to `master` that changes the app
triggers `.github/workflows/pages.yml`, a single job that installs
dependencies, builds `dist/` (including the vendored OCR files and the
upscaler model, see
[architecture.md](architecture.md#cross-file-invariants-easy-to-break)), and
publishes it to GitHub Pages, usually in well under a minute:

**<https://giacoct.github.io/ImageLab/>**

Nothing runs on a server: images are processed on the device that opens the
page, and never uploaded.

## One-time setup

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
The repository must stay public (or the account must have a plan with private
Pages). The upscaler weights are downloaded during the build from the
`models-v1` release, so that release asset must stay published.

## Updating

Push to `master`. The Actions tab shows the run; a failed build doesn't
replace the published site. Changes only to `docs/`, Markdown files or editor
settings don't deploy. To redeploy without a change, run the workflow by hand
(**Actions → Deploy to GitHub Pages → Run workflow**).

Publishing itself takes seconds, but GitHub Pages sometimes stalls on
"syncing files". The workflow gives up on a stalled attempt after 2 minutes
and retries once on its own. If both attempts stall, Pages is having trouble
(see <https://www.githubstatus.com>); push again or run the workflow by hand
later. A newer push waits for a running deployment rather than cancelling it,
and cancelling one by hand is best avoided: a deployment stopped half-way can
leave Pages stuck for that commit.

Online, the page always comes from the network, so a new deploy shows up on
the next load. The service worker caches the app on the first visit, so it
also starts offline; it downloads a file again only when a deploy changed it,
and drops the files of older deploys once every tab of the old version is
closed.

## Trying a build locally

```bash
npm run build
npm run preview    # http://localhost:4173/
```

## Browser requirements

A current Chrome, Edge, Firefox or Safari (desktop or mobile). They need
module workers, `OffscreenCanvas` and WebAssembly. Upscaling uses WebGPU where
available (Chrome/Edge, Safari 26+) and falls back to the CPU, which is much
slower for large images. GitHub Pages can't enable cross-origin isolation, so
the CPU fallback runs single-threaded.

Each engine is downloaded the first time it's used (JPEG/WebP encoders a few
hundred KB; OCR about 5 MB; upscaling about 12 MB compressed). After that it's
cached for offline use.

## Retiring the old LAN server

ImageLab used to run as a FastAPI server on a Linux PC or an Android phone.
That's no longer needed. On the PC, remove the service:

```bash
sudo systemctl disable --now imagelab
sudo rm /etc/systemd/system/imagelab.service
sudo systemctl daemon-reload
```

On the phone, delete `~/.termux/boot/imagelab` and stop the server.
