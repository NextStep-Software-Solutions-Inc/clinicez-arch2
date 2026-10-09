#!/bin/sh
# Writes /config.json from the container's environment so the same image works on any pharmacy LAN.
# Runs automatically at start (nginx image runs /docker-entrypoint.d/*.sh).
#
# Same mechanism as apps/clinic-app/deploy/nginx/40-write-config-json.sh: the settings are EXPO_PUBLIC_* variables (the
# same names as a Vercel/EAS build); the app reads them from this file at run time instead of from the bundle. Only
# variables that are set are published. This image proxies /api itself, so EXPO_PUBLIC_PHARMACY_API_URL defaults to "/"
# (same origin).
set -eu

EXPO_PUBLIC_PHARMACY_API_URL="${EXPO_PUBLIC_PHARMACY_API_URL:-/}"

NAMES="EXPO_PUBLIC_PHARMACY_API_URL EXPO_PUBLIC_BASE_DOMAIN EXPO_PUBLIC_SERVICE_SUBDOMAIN EXPO_PUBLIC_SERVICE_SUBDOMAINS EXPO_PUBLIC_API_URL_TEMPLATE EXPO_PUBLIC_PORTAL_URL EXPO_PUBLIC_STORAGE_PUBLIC_URL EXPO_PUBLIC_OFFLINE_GRACE_HOURS"

body=""
for name in $NAMES; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || continue
  case "$value" in
    *'"'*|*'\'*) echo "$name must not contain quotes or backslashes" >&2; exit 1 ;;
  esac
  case "$value" in
    *[![:print:]]*) echo "$name must not contain control characters" >&2; exit 1 ;;
  esac
  if [ "$name" = "EXPO_PUBLIC_OFFLINE_GRACE_HOURS" ]; then
    case "$value" in
      *[!0-9]*) echo "EXPO_PUBLIC_OFFLINE_GRACE_HOURS must be a whole number" >&2; exit 1 ;;
    esac
  fi
  if [ -n "$body" ]; then body="$body,
"; fi
  body="$body  \"$name\": \"$value\""
done

printf '{\n%s\n}\n' "$body" > /usr/share/nginx/html/config.json
echo "pharmacy-web: wrote config.json (EXPO_PUBLIC_PHARMACY_API_URL=${EXPO_PUBLIC_PHARMACY_API_URL})"
