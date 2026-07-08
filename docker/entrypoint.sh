#!/usr/bin/env bash
# Runs both container processes: uvicorn (backend, loopback :4201) and nginx
# (frontend + /api proxy, :80). If either dies the container exits so the
# restart policy can bring it back; SIGTERM from `docker stop` shuts both down.
set -e

stop() { kill -TERM "$API_PID" "$NGINX_PID" 2>/dev/null; }
trap stop TERM INT

uvicorn app:app --host 127.0.0.1 --port 4201 &
API_PID=$!
nginx -g 'daemon off;' &
NGINX_PID=$!

wait -n
CODE=$?
stop
wait
exit "$CODE"
