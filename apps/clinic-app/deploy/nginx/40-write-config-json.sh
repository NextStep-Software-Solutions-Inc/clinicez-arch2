#!/bin/sh
# Writes /config.json from the container's environment so the same image works on any clinic LAN.
# Runs automatically at start (nginx image runs /docker-entrypoint.d/*.sh).
set -eu

# The EXPO_PUBLIC_* names are the same ones used for the Vercel build, accepted here so both deployments share one set of variables.
API_URL="${CLINIC_PUBLIC_API_URL:-${EXPO_PUBLIC_CLINIC_API_URL:-/}}"
WORKSPACE_REQUIRED="${CLINIC_WORKSPACE_REQUIRED:-false}"
GRACE_HOURS="${CLINIC_OFFLINE_GRACE_HOURS:-${EXPO_PUBLIC_OFFLINE_GRACE_HOURS:-12}}"

case "$WORKSPACE_REQUIRED" in
  true|false) ;;
  *) echo "CLINIC_WORKSPACE_REQUIRED must be true or false" >&2; exit 1 ;;
esac
case "$GRACE_HOURS" in
  ''|*[!0-9]*) echo "CLINIC_OFFLINE_GRACE_HOURS must be a whole number" >&2; exit 1 ;;
esac
case "$API_URL" in
  *'"'*|*'\'*) echo "CLINIC_PUBLIC_API_URL must not contain quotes or backslashes" >&2; exit 1 ;;
esac

cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiUrl": "${API_URL}",
  "workspaceRequired": ${WORKSPACE_REQUIRED},
  "offlineGraceHours": ${GRACE_HOURS}
}
EOF
echo "clinic-web: wrote config.json (apiUrl=${API_URL})"
