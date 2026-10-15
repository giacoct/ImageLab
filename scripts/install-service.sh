#!/usr/bin/env bash
# Install ImageLab as a systemd service (Linux) so it starts at boot and
# restarts if it crashes. Run from the repo, after `npm run setup` and
# `npm run build`:
#
#   sudo scripts/install-service.sh
#
# Re-running it is safe (it rewrites the unit and restarts the service).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo scripts/install-service.sh" >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUN_AS="${SUDO_USER:-root}"   # the user who invoked sudo owns the checkout
PORT=4200

if [[ ! -x "$REPO/backend/.venv/bin/python" || ! -f "$REPO/frontend/dist/browser/index.html" ]]; then
  echo "Run 'npm run setup' and 'npm run build' first." >&2
  exit 1
fi

cat > /etc/systemd/system/imagelab.service <<EOF
[Unit]
Description=ImageLab (browser image tools)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_AS
WorkingDirectory=$REPO/backend
ExecStart=$REPO/backend/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable imagelab
systemctl restart imagelab
echo "ImageLab is running on http://$(hostname -I | awk '{print $1}'):$PORT"
