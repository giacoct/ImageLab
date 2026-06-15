# ImageLab backend service

A small FastAPI service behind the Angular app at `/api`. It wraps
[VTracer](https://github.com/visioncortex/vtracer) for vectorization and
[Tesseract](https://github.com/tesseract-ocr/tesseract) (via
[`pytesseract`](https://pypi.org/project/pytesseract/)) for OCR.

`POST /vectorize` accepts a multipart `file` (PNG/JPEG/WebP) and returns
`image/svg+xml`. With `preset=auto` the service analyzes the image itself:
flat art (logos/illustrations) is upscaled and de-antialiased before tracing,
photos get noise suppression and harder layer merging. With `preset=manual`
the individual form fields apply — `mode` (`spline`/`polygon`),
`hierarchical` (`stacked`/`cutout`), `color_precision`, `filter_speckle`,
`corner_threshold`, `length_threshold`, `splice_threshold`, `path_precision`,
`max_iterations`, `layer_difference`.

`POST /ocr` accepts a multipart `file` (PNG/JPEG/WebP) plus a `lang` field
(Tesseract language code, default `eng`; combine with `+`, e.g. `eng+fra`) and
returns JSON `{width, height, text, words}`, where each word carries its pixel
bounding box, confidence, and line index — the app turns those boxes into a
selectable text layer over the image. `GET /health` returns `{"status":"ok"}`.

### System dependency: Tesseract

`pytesseract` shells out to the `tesseract` binary, which is **not** a pip
package. Install it (and any non-English language packs) at the OS level:

```bash
# Debian/Ubuntu
sudo apt-get install -y tesseract-ocr tesseract-ocr-ita   # English + Italian
sudo apt-get install -y tesseract-ocr-fra                 # add more as needed
# macOS (local dev)
brew install tesseract tesseract-lang
```

`setup-host.sh install` installs `tesseract-ocr` + `tesseract-ocr-ita`
(English + Italian) for you on the server. The picker in the app
(`OCR_LANGUAGES`) must stay in sync with the packs that are actually installed.

## Local development

From the repo root, one command starts **both** the backend and the Angular dev
server (it bootstraps the venv on first run):

```bash
npm run dev
```

The Angular dev server proxies `/api` to `http://localhost:4201` (see
`proxy.conf.json`), so the Convert-to-SVG tool works end to end locally.

To run just the backend manually:

```bash
cd server
python -m venv .venv
# Windows:  .venv\Scripts\pip install -r requirements.txt
# Linux:    .venv/bin/pip  install -r requirements.txt
uvicorn app:app --port 4201 --reload
curl -F file=@some-logo.png http://localhost:4201/vectorize -o out.svg   # smoke test
```

## Deployment

After the one-time host bootstrap below, **GitHub Actions deploys the backend
automatically** on every push to `master` (`.github/workflows/deploy.yml`): it
rsyncs `server/`, (re)creates the venv, installs `requirements.txt`, ensures
OS-level dependencies (the tesseract binary), and runs
`sudo systemctl restart imagelab-vectorizer`. The frontend deploys in the same
workflow.

**System packages self-heal on deploy.** Since CI has no root, it can't run
`apt-get` directly. Instead the bootstrap installs a small root-owned helper at
`/usr/local/sbin/imagelab-ensure-deps` and grants CI a *narrow* passwordless
sudo rule for that exact path. Each deploy runs it; it installs anything missing
(currently `tesseract-ocr` + `tesseract-ocr-ita`) and is a no-op otherwise.
Changing that set means editing `deps_script_content` and re-running
`setup-host.sh install` once — a deploy runs the *installed* helper, not the
repo's. A bare server still needs the one-time bootstrap first (CI can't create
the systemd unit, nginx proxy, or sudoers rules without root) — but that
bootstrap is itself idempotent and self-healing, and installs tesseract (with
Italian) as part of step 1.

### One-time host bootstrap

This host serves the static app via nginx on **port 4200** (80/8080/4200 are in
use). The vectorizer runs on **127.0.0.1:4201**, reachable only via the proxy.

`setup-host.sh` automates the whole bootstrap. Copy it (or the `server/` dir)
to the host and run:

```bash
scp server/setup-host.sh <user>@<host>:
ssh <user>@<host>
sudo ./setup-host.sh install   # apply everything (idempotent)
./setup-host.sh                # check mode: verify the setup, read-only
```

Install mode, run as the deploy user with sudo, takes care of:

1. the deploy directory (`/opt/imagelab/server`, owned by the deploy user so
   CI can rsync and build the venv without root), and the OS-level deps helper
   (`/usr/local/sbin/imagelab-ensure-deps`), which it then runs to install the
   tesseract binary,
2. the systemd unit (generated with the right user/paths, enabled),
3. `sudoers` rules so CI may run exactly
   `sudo systemctl restart imagelab-vectorizer` and
   `sudo /usr/local/sbin/imagelab-ensure-deps` without a password,
4. the nginx `location /api/` proxy inside the existing `listen 4200` server
   block (config is backed up, validated with `nginx -t`, and restored if the
   patch fails),
5. and, when run next to `app.py`, an immediate first deploy (venv + service
   start) so you don't have to wait for CI.

Defaults: deploy user = the invoking user, path `/opt/imagelab/server`.
Override with env vars: `DEPLOY_USER=deploy DEPLOY_PATH=/srv/x sudo -E ./setup-host.sh install`.

Finally, set the GitHub repo secret **`BACKEND_DEPLOY_PATH`** to the same path
(e.g. `/opt/imagelab/server`) — the workflow needs it to know where to rsync.

Re-run `./setup-host.sh` (check mode) any time to diagnose the host; it also
verifies the live `/health` endpoints once the service is deployed.
