# ImageLab Vectorizer service

A small FastAPI service that wraps [VTracer](https://github.com/visioncortex/vtracer)
to convert raster images into compact, smooth color SVGs. The Angular app's
**Convert to SVG** tool calls it at `/api/vectorize`.

`POST /vectorize` accepts a multipart `file` (PNG/JPEG/WebP) plus optional form
fields — `color_precision`, `filter_speckle`, `corner_threshold`, `mode`
(`spline`/`polygon`), `hierarchical` (`stacked`/`cutout`) — and returns
`image/svg+xml`. `GET /health` returns `{"status":"ok"}`.

## Local development (Windows or Linux)

```bash
cd server
python -m venv .venv
# Windows:  .venv\Scripts\pip install -r requirements.txt
# Linux:    .venv/bin/pip  install -r requirements.txt
pip install -r requirements.txt

uvicorn app:app --port 4201
# smoke test:
curl -F file=@some-logo.png http://localhost:4201/vectorize -o out.svg
```

The Angular dev server proxies `/api` to `http://localhost:4201` (see
`proxy.conf.json` at the repo root), so running `npm start` + this service is all
you need for end-to-end local testing.

## Production setup (one time)

This host already serves the static ImageLab app via nginx on **port 4200**
(ports 80/8080/4200 are in use). The vectorizer runs on **127.0.0.1:4201**,
reachable only through the nginx proxy.

1. **Install the service**

   ```bash
   sudo mkdir -p /opt/imagelab/server
   sudo rsync -a server/ /opt/imagelab/server/      # app.py, requirements.txt, unit file
   cd /opt/imagelab/server
   sudo python3 -m venv .venv
   sudo .venv/bin/pip install -r requirements.txt
   ```

2. **Enable the systemd unit** (edit `User`/paths in the unit file first if needed)

   ```bash
   sudo cp imagelab-vectorizer.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now imagelab-vectorizer
   sudo systemctl status imagelab-vectorizer
   ```

3. **Proxy `/api` from nginx** — add this inside the existing
   `server { listen 4200; ... }` block that serves ImageLab, then reload nginx:

   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:4201/;   # trailing slash strips the /api prefix
       client_max_body_size 12m;
   }
   ```

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Now `http://<host>:4200/api/vectorize` reaches the service's `/vectorize`.

## Updating

The frontend deploys via the existing GitHub Actions rsync. The backend changes
rarely; to update it:

```bash
cd /opt/imagelab/server && sudo git -C /path/to/repo pull   # or rsync server/ again
sudo .venv/bin/pip install -r requirements.txt              # if deps changed
sudo systemctl restart imagelab-vectorizer
```
