#!/bin/sh
# Writes /config.json from the container's environment so the same image works on any laboratory LAN.
# Runs automatically at start (nginx image runs /docker-entrypoint.d/*.sh).
#
# Same mechanism as apps/clinic-app/deploy/nginx/40-write-config-json.sh: the app reads EXPO_PUBLIC_LAB_API_URL from this file at run
# time instead of from the bundle. This image proxies /api itself, so it defaults to "/" (same origin).
set -eu

EXPO_PUBLIC_LAB_API_URL="${EXPO_PUBLIC_LAB_API_URL:-/}"

case "$EXPO_PUBLIC_LAB_API_URL" in
  *'"'*|*'\'*) echo "EXPO_PUBLIC_LAB_API_URL must not contain quotes or backslashes" >&2; exit 1 ;;
esac
case "$EXPO_PUBLIC_LAB_API_URL" in
  *[![:print:]]*) echo "EXPO_PUBLIC_LAB_API_URL must not contain control characters" >&2; exit 1 ;;
esac

printf '{\n  "%s": "%s"\n}\n' "EXPO_PUBLIC_LAB_API_URL" "$EXPO_PUBLIC_LAB_API_URL" > /usr/share/nginx/html/config.json
echo "laboratory-web: wrote config.json (EXPO_PUBLIC_LAB_API_URL=${EXPO_PUBLIC_LAB_API_URL})"
