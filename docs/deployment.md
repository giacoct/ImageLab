# Deployment (production on the LAN)

Production is one Linux PC (Ubuntu/Debian) on the home network. ImageLab runs
there as a single process — the FastAPI backend serves both the built app and
the `/api` endpoints on port **4200** — managed by systemd, so it starts at
boot and restarts if it crashes. Open it from any device on the LAN at
`http://<server-ip>:4200`.

## One-time setup

1. **System packages** — Git, Python 3.14, and Tesseract with the
   Italian language pack (English is included; more languages are
   `tesseract-ocr-<code>` packages, e.g. `tesseract-ocr-fra`, and appear in the
   app automatically):

   ```bash
   sudo apt update
   sudo apt install -y git python3.14 python3.14-venv tesseract-ocr tesseract-ocr-ita
   ```

   ImageLab needs exactly **Python 3.14**: the backend's pinned packages are
   chosen for it. `npm run setup` finds `python3.14` automatically and
   rebuilds the virtualenv if it was made with another Python.

2. **Node.js 26** (only used to build the frontend; the distro's `nodejs`
   package is usually too old):

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **Get the code, install, build, and install the service:**

   ```bash
   git clone https://github.com/giacoct/ImageLab.git ~/ImageLab
   cd ~/ImageLab
   npm run setup     # frontend packages, backend venv, upscaler model
   npm run build     # → frontend/dist/browser
   sudo scripts/install-service.sh
   ```

   `install-service.sh` writes `/etc/systemd/system/imagelab.service` (running
   as your user, from this checkout), enables it at boot, and starts it.

4. **Firewall** (only if `ufw` is enabled): `sudo ufw allow 4200/tcp`.

## Updating

```bash
cd ~/ImageLab
git pull
npm run setup      # only reinstalls what changed
npm run build
sudo systemctl restart imagelab
```

## Day-to-day

```bash
systemctl status imagelab                 # is it running?
journalctl -u imagelab -f                 # live logs
curl http://localhost:4200/api/health     # → {"status":"ok"}
sudo systemctl restart imagelab           # restart
```

`npm start` runs the same server in the foreground (handy for a quick test;
stop the service first, since both use port 4200).
