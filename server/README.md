# ImageLab Vectorizer service

A small FastAPI service that wraps [VTracer](https://github.com/visioncortex/vtracer)
to convert raster images into compact, smooth color SVGs. The Angular app's
**Convert to SVG** tool calls it at `/api/vectorize`.

`POST /vectorize` accepts a multipart `file` (PNG/JPEG/WebP) and returns
`image/svg+xml`. With `preset=auto` the service analyzes the image itself:
flat art (logos/illustrations) is upscaled and de-antialiased before tracing,
photos get noise suppression and harder layer merging. With `preset=manual`
the individual form fields apply — `mode` (`spline`/`polygon`),
`hierarchical` (`stacked`/`cutout`), `color_precision`, `filter_speckle`,
`corner_threshold`, `length_threshold`, `splice_threshold`, `path_precision`,
`max_iterations`, `layer_difference`. `GET /health` returns `{"status":"ok"}`.

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
rsyncs `server/`, (re)creates the venv, installs `requirements.txt`, and runs
`sudo systemctl restart imagelab-vectorizer`. The frontend deploys in the same
workflow.

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
   CI can rsync and build the venv without root),
2. the systemd unit (generated with the right user/paths, enabled),
3. a `sudoers` rule so CI may run exactly
   `sudo systemctl restart imagelab-vectorizer` without a password,
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
