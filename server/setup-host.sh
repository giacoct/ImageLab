#!/usr/bin/env bash
# ImageLab vectorizer — one-time host bootstrap and diagnostics.
#
# Usage (on the Linux server):
#   ./setup-host.sh                  # check: read-only report of what's configured
#   sudo ./setup-host.sh install     # apply: deploy dir, systemd unit, sudoers, nginx
#
# Both modes are idempotent: install only applies what's missing, and check can
# be run at any time (also after deploys) to verify the host.
#
# Defaults can be overridden via env vars (use sudo -E to keep them):
#   DEPLOY_USER=deploy DEPLOY_PATH=/srv/imagelab sudo -E ./setup-host.sh install

set -uo pipefail

SERVICE=imagelab-vectorizer
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$(id -un)}}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/imagelab/server}"
API_PORT="${API_PORT:-4201}"
WEB_PORT="${WEB_PORT:-4200}"
UNIT_FILE="/etc/systemd/system/$SERVICE.service"
SUDOERS_FILE="/etc/sudoers.d/imagelab"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMCTL="$(command -v systemctl || true)"

FAILURES=0
ok()   { printf '\033[32m  ok\033[0m  %s\n' "$*"; }
bad()  { printf '\033[31mFAIL\033[0m  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
warn() { printf '\033[33mwarn\033[0m  %s\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$SYSTEMCTL" ] || die "systemctl not found — run this on the Linux host, not locally."

# ---------------------------------------------------------------- helpers ---

nginx_conf_for_port() {
  grep -rlE "listen[^;]*\b$WEB_PORT\b" /etc/nginx 2>/dev/null | head -n 1
}

unit_content() {
  cat <<EOF
[Unit]
Description=ImageLab Vectorizer (FastAPI + VTracer)
After=network.target

[Service]
User=$DEPLOY_USER
WorkingDirectory=$DEPLOY_PATH
ExecStart=$DEPLOY_PATH/.venv/bin/uvicorn app:app --host 127.0.0.1 --port $API_PORT
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
}

# ------------------------------------------------------------------ check ---

check() {
  echo "Checking $SERVICE host setup (user=$DEPLOY_USER, path=$DEPLOY_PATH)"
  echo

  if python3 -c 'import venv, ensurepip' 2>/dev/null; then
    ok "python3 with venv support"
  else
    bad "python3 venv support missing (e.g. apt install python3-venv)"
  fi

  if [ -d "$DEPLOY_PATH" ]; then
    owner="$(stat -c %U "$DEPLOY_PATH")"
    if [ "$owner" = "$DEPLOY_USER" ]; then
      ok "deploy dir $DEPLOY_PATH exists, owned by $DEPLOY_USER"
    else
      bad "deploy dir $DEPLOY_PATH is owned by $owner, expected $DEPLOY_USER"
    fi
  else
    bad "deploy dir $DEPLOY_PATH does not exist"
  fi

  if [ -f "$UNIT_FILE" ]; then
    if "$SYSTEMCTL" is-enabled --quiet "$SERVICE" 2>/dev/null; then
      ok "systemd unit installed and enabled"
    else
      bad "systemd unit exists but is not enabled (systemctl enable $SERVICE)"
    fi
  else
    bad "systemd unit $UNIT_FILE not installed"
  fi

  if [ "$(id -u)" -eq 0 ]; then
    if [ -f "$SUDOERS_FILE" ] && grep -q "$SERVICE" "$SUDOERS_FILE"; then
      ok "sudoers rule present ($SUDOERS_FILE)"
    else
      bad "sudoers rule missing ($SUDOERS_FILE)"
    fi
  elif sudo -n -l "$SYSTEMCTL" restart "$SERVICE" >/dev/null 2>&1; then
    ok "passwordless 'sudo systemctl restart $SERVICE' works for $(id -un)"
  else
    bad "cannot run 'sudo systemctl restart $SERVICE' without a password"
  fi

  conf="$(nginx_conf_for_port)"
  if [ -z "$conf" ]; then
    bad "no nginx config with 'listen $WEB_PORT' found under /etc/nginx"
  elif grep -q 'location /api/' "$conf"; then
    ok "nginx /api proxy configured ($conf)"
  else
    bad "nginx $conf serves :$WEB_PORT but has no 'location /api/' block"
  fi

  if [ -x "$DEPLOY_PATH/.venv/bin/uvicorn" ]; then
    ok "backend venv present"
  else
    warn "backend venv missing — the first CI deploy (or install mode) creates it"
  fi

  if curl -fsS --max-time 3 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
    ok "backend healthy on 127.0.0.1:$API_PORT"
  else
    warn "backend not answering on :$API_PORT (fine if not yet deployed)"
  fi

  if curl -fsS --max-time 3 "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1; then
    ok "end-to-end OK: :$WEB_PORT/api/health reaches the backend through nginx"
  else
    warn "proxy route :$WEB_PORT/api/health not answering yet"
  fi

  echo
  if [ "$FAILURES" -eq 0 ]; then
    echo "All required host setup is in place."
    echo "Remember the GitHub secret BACKEND_DEPLOY_PATH=$DEPLOY_PATH for CI."
  else
    echo "$FAILURES check(s) failed — run 'sudo $0 install' to fix."
    return 1
  fi
}

# ---------------------------------------------------------------- install ---

install_all() {
  [ "$(id -u)" -eq 0 ] || die "install mode needs root: sudo $0 install"
  id -u "$DEPLOY_USER" >/dev/null 2>&1 || die "deploy user '$DEPLOY_USER' does not exist"

  echo "Installing $SERVICE host setup (user=$DEPLOY_USER, path=$DEPLOY_PATH)"
  echo

  # 1. Deploy directory, owned by the CI deploy user.
  install -d -o "$DEPLOY_USER" -g "$(id -gn "$DEPLOY_USER")" "$DEPLOY_PATH"
  ok "deploy dir $DEPLOY_PATH ready"

  # 2. Systemd unit (rewritten on every install so user/path changes apply).
  unit_content > "$UNIT_FILE"
  "$SYSTEMCTL" daemon-reload
  "$SYSTEMCTL" enable --quiet "$SERVICE"
  ok "systemd unit installed and enabled"

  # 3. Passwordless restart for CI, validated before being activated.
  tmp="$(mktemp)"
  echo "$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart $SERVICE" > "$tmp"
  if visudo -cf "$tmp" >/dev/null; then
    install -m 0440 "$tmp" "$SUDOERS_FILE"
    ok "sudoers rule installed ($SUDOERS_FILE)"
  else
    bad "generated sudoers rule failed validation — not installed"
  fi
  rm -f "$tmp"

  # 4. Nginx /api proxy inside the existing :$WEB_PORT server block.
  conf="$(nginx_conf_for_port)"
  if [ -z "$conf" ]; then
    warn "no nginx config with 'listen $WEB_PORT' found — add this manually:"
    printf '    location /api/ {\n        proxy_pass http://127.0.0.1:%s/;\n        client_max_body_size 12m;\n    }\n' "$API_PORT"
  elif grep -q 'location /api/' "$conf"; then
    ok "nginx /api proxy already configured ($conf)"
  else
    backup="$conf.bak.$(date +%s)"
    cp "$conf" "$backup"
    awk -v port="$WEB_PORT" -v apiport="$API_PORT" '
      { print }
      !done && $0 ~ "listen[^;]*" port {
        print "    location /api/ {"
        print "        proxy_pass http://127.0.0.1:" apiport "/;   # trailing slash strips the /api prefix"
        print "        client_max_body_size 12m;"
        print "    }"
        done = 1
      }
    ' "$backup" > "$conf"
    if nginx -t >/dev/null 2>&1; then
      "$SYSTEMCTL" reload nginx
      ok "nginx /api proxy added to $conf (backup: $backup)"
    else
      cp "$backup" "$conf"
      bad "patched nginx config failed 'nginx -t' — restored $conf, add the block manually"
    fi
  fi

  # 5. If the backend code is at hand, deploy it now instead of waiting for CI.
  if [ -f "$SCRIPT_DIR/app.py" ] && [ ! -f "$DEPLOY_PATH/app.py" ]; then
    install -o "$DEPLOY_USER" -g "$(id -gn "$DEPLOY_USER")" -m 0644 \
      "$SCRIPT_DIR/app.py" "$SCRIPT_DIR/requirements.txt" "$DEPLOY_PATH/"
    ok "copied backend code into $DEPLOY_PATH"
  fi
  if [ -f "$DEPLOY_PATH/app.py" ] && [ ! -x "$DEPLOY_PATH/.venv/bin/uvicorn" ]; then
    echo "Creating the backend venv (this may take a minute)..."
    sudo -u "$DEPLOY_USER" bash -c "
      cd '$DEPLOY_PATH' &&
      python3 -m venv .venv &&
      .venv/bin/pip install --quiet --upgrade pip &&
      .venv/bin/pip install --quiet -r requirements.txt
    " && ok "backend venv created" || bad "venv creation failed"
  fi
  if [ -x "$DEPLOY_PATH/.venv/bin/uvicorn" ]; then
    "$SYSTEMCTL" restart "$SERVICE"
    ok "service (re)started"
  else
    warn "service not started — the first CI deploy will create the venv and start it"
  fi

  echo
  check
}

# ------------------------------------------------------------------- main ---

case "${1:-check}" in
  check) check ;;
  install) install_all ;;
  *) die "unknown mode '${1}' (use: check | install)" ;;
esac
