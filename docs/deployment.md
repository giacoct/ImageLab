# Deployment (production on the LAN)

ImageLab runs as a single process — the FastAPI backend serves both the built
app and the `/api` endpoints on port **4200** — on an always-on machine on the
home network: a **Linux PC** (Ubuntu/Debian) as a systemd service, or an old
**Android phone** with Termux (see [Android phone (Termux)](#android-phone-termux)).
Open it from any device on the LAN at `http://<server-ip>:4200`.

## Linux PC

The service starts at boot and restarts if it crashes.

### One-time setup

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

### Updating

```bash
cd ~/ImageLab
git pull
npm run setup      # only reinstalls what changed
npm run build
sudo systemctl restart imagelab
```

### Day-to-day

```bash
systemctl status imagelab                 # is it running?
journalctl -u imagelab -f                 # live logs
curl http://localhost:4200/api/health     # → {"status":"ok"}
sudo systemctl restart imagelab           # restart
```

`npm start` runs the same server in the foreground (handy for a quick test;
stop the service first, since both use port 4200).

## Android phone (Termux)

Every tool works on the phone, including the backend ones. The phone only
serves the app: the in-browser tools run on whichever device opens it, while
Convert to SVG, OCR, and Upscale run on the phone's CPU, so they are slower
than on a PC.

You need **Android 7 or newer**, about **3 GB** of free storage (mostly the
Rust compiler and the frontend's build tools), and ideally **2 GB of RAM** or
more (upscaling the largest images needs about 0.5 GB). Install **Termux from
[F-Droid](https://f-droid.org/packages/com.termux/)** (or its GitHub releases)
rather than Google Play, so that Termux:Boot from the same source works with it.
Typing the commands is easier over SSH (`pkg install openssh`, `passwd`, `sshd`,
then `ssh -p 8022 <phone-ip>` from the PC).

### One-time setup

1. **Termux packages.** PyPI has no Android builds of numpy, Pillow, or
   onnxruntime, so they come from Termux; Rust and the C compiler build the two
   remaining native packages (vtracer, pillow-heif):

   ```bash
   pkg update
   pkg install git nodejs python python-ensurepip-wheels python-numpy \
     python-pillow python-onnxruntime tesseract libheif rust build-essential pkg-config
   ```

   `pkg` picks a mirror at random, and some lag behind (downloads fail with
   `404 Not Found`) or are slow: switch with `termux-change-repo`, then run
   `pkg update` and the install again.

2. **Get the code, install, and build** — the same commands as on the PC:

   ```bash
   git clone https://github.com/giacoct/ImageLab.git ~/ImageLab
   cd ~/ImageLab
   npm run setup     # the first run compiles vtracer and pillow-heif: allow 5–15 minutes
   npm run build
   ```

   On Termux, `npm run setup` builds the virtualenv on top of Termux's numpy,
   Pillow, and onnxruntime, and installs prebuilt pydantic-core (FastAPI's
   core) from the [Termux User Repository](https://github.com/termux-user-repository/tur)'s
   pip index instead of compiling it.

3. **OCR languages.** Termux's Tesseract comes with English only. Add others
   by downloading their data file, e.g. Italian:

   ```bash
   curl -L -o $PREFIX/share/tessdata/ita.traineddata \
     https://github.com/tesseract-ocr/tessdata_fast/raw/main/ita.traineddata
   ```

   (`tessdata_fast` models are the quick ones, suited to a phone; other codes
   work the same way and appear in the app automatically.)

4. **Keep Android from stopping it.** In Android's settings, set Termux's
   battery usage to *Unrestricted* (or turn off battery optimization for it).

### Running it

```bash
termux-wake-lock   # keep the CPU running while the screen is off
cd ~/ImageLab && npm start
```

Then open `http://<phone-ip>:4200` from another device; the phone's IP is in
Android's Wi-Fi settings (tap the connected network). Ctrl+C stops the server,
and `termux-wake-unlock` releases the wake lock. At startup onnxruntime warns
`Unsupported platform (android)`: that's expected, and upscaling works.

**Starting at boot (optional).** Install the
[Termux:Boot](https://f-droid.org/packages/com.termux.boot/) app from the same
source as Termux, open it once, then add a boot script that also restarts the
server if it stops:

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/imagelab <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/ImageLab
while true; do npm start >> ~/imagelab.log 2>&1; sleep 5; done
EOF
chmod +x ~/.termux/boot/imagelab
```

Its output goes to `~/imagelab.log` (`tail -f ~/imagelab.log` to follow it).

### Updating

```bash
cd ~/ImageLab
git pull
npm run setup      # only reinstalls what changed
npm run build
```

Then restart the server: Ctrl+C and `npm start` again, or, with the boot
script, `pkill -f "uvicorn main:app"` (the loop starts it again within seconds).
