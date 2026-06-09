# ImageLab Vectorizer service

A small FastAPI service that wraps [VTracer](https://github.com/visioncortex/vtracer)
to convert raster images into compact, smooth color SVGs. The Angular app's
**Convert to SVG** tool calls it at `/api/vectorize`.

`POST /vectorize` accepts a multipart `file` (PNG/JPEG/WebP) plus optional form
fields — `color_precision`, `filter_speckle`, `corner_threshold`, `mode`
(`spline`/`polygon`), `hierarchical` (`stacked`/`cutout`) — and returns
`image/svg+xml`. `GET /health` returns `{"status":"ok"}`.

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
Pick a deploy directory and let the **deploy user own it** so CI can sync and
build the venv without `sudo`.

1. **Create the directory, owned by the deploy user** (the SSH user CI uses):

   ```bash
   sudo mkdir -p /opt/imagelab/server
   sudo chown -R "$USER":"$USER" /opt/imagelab/server     # run as the deploy user
   ```

   Set the GitHub repo secret **`BACKEND_DEPLOY_PATH`** to this path
   (e.g. `/opt/imagelab/server`).

2. **Install the systemd unit** — edit `imagelab-vectorizer.service` so `User=`
   and the paths match the deploy user/dir, then:

   ```bash
   sudo cp imagelab-vectorizer.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable imagelab-vectorizer
   ```

3. **Allow CI to restart the service without a password** (`sudo visudo -f
   /etc/sudoers.d/imagelab`), using your `which systemctl` path:

   ```
   <deploy_user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart imagelab-vectorizer
   ```

4. **Proxy `/api` from nginx** — add inside the existing
   `server { listen 4200; ... }` block, then reload:

   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:4201/;   # trailing slash strips the /api prefix
       client_max_body_size 12m;
   }
   ```

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

The next push to `master` populates the venv and starts the service; thereafter
`http://<host>:4200/api/vectorize` reaches the service's `/vectorize`.

> Changing the systemd unit, nginx config, or sudoers is the only work not
> automated (it's host configuration, not app code). Re-run the relevant step
> above if you change those files.
