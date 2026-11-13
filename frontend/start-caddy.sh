#!/bin/sh
set -eu

if [ -z "${BACKEND_UPSTREAM:-}" ]; then
  echo "BACKEND_UPSTREAM is required" >&2
  exit 1
fi

case "$BACKEND_UPSTREAM" in
  http://*|https://*) ;;
  *) echo "BACKEND_UPSTREAM must be an http(s) URL" >&2; exit 1 ;;
esac
case "$BACKEND_UPSTREAM" in
  *[!A-Za-z0-9._:/-]*) echo "BACKEND_UPSTREAM contains unsupported characters" >&2; exit 1 ;;
esac

case "${PORT:-8080}" in
  ''|*[!0-9]*) echo "PORT must be numeric" >&2; exit 1 ;;
esac

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
