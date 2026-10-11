#!/usr/bin/env bash
# Prints random values for the shared secrets of the cloud deployment (GitHub secrets) as NAME=value lines.
#
#   scripts/generate-secrets.sh                     every secret below
#   scripts/generate-secrets.sh CLINIC_*           only the names/patterns given
#   scripts/generate-secrets.sh --list              names and kinds, no values
#
# Values come from /dev/urandom (no openssl needed) and go to stdout ONLY: copy each one into Settings -> Secrets and
# variables -> Actions, then clear your terminal/history. Nothing is written to disk. Key PAIRS (license keys, hub signing
# keys) are not generated here: use scripts/generate-license-keys.sh and scripts/generate-signing-key.sh.
set -eu

# NAME:kind  (alnum:N = N random letters/digits, b64:N = base64 of N random bytes)
SPECS="
HANGFIRE_PASSWORD:alnum:24
CLINIC_ENCRYPTION_MASTER_SECRET:alnum:64
CLINIC_DOCUMENT_SIGNING_KEY:alnum:64
LABORATORY_DOCUMENT_SIGNING_KEY:alnum:64
PHARMACY_GAMOT_UPSC_SECRET_KEY:alnum:64
PATIENT_SHARING_SIGNING_KEY:alnum:64
INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY:b64:32
INTEROP_HUB_PORTAL_CLIENT_SECRET:alnum:40
CLINIC_HUB_CLIENT_SECRET:alnum:40
LABORATORY_HUB_CLIENT_SECRET:alnum:40
PHARMACY_HUB_CLIENT_SECRET:alnum:40
ORGANIZATION_HUB_CLIENT_SECRET:alnum:40
PATIENT_HUB_CLIENT_SECRET:alnum:40
PORTAL_HUB_CLIENT_SECRET:alnum:40
BILLING_HUB_CLIENT_SECRET:alnum:40

CLINIC_JWT_SIGNING_KEY:b64:64
LAB_JWT_SIGNING_KEY:b64:64
PHARMACY_JWT_SIGNING_KEY:b64:64
BILLING_JWT_SIGNING_KEY:b64:64
"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }

rand_alnum() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
rand_b64() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

list=0
filters=""
for a in "$@"; do
  case "$a" in
    -h|--help) usage; exit 0 ;;
    --list) list=1 ;;
    -*) echo "Unknown option: $a" >&2; exit 2 ;;
    *) filters="$filters $a" ;;
  esac
done

matches() {
  [ -z "$filters" ] && return 0
  for f in $filters; do
    # shellcheck disable=SC2254
    case "$1" in $f) return 0 ;; esac
  done
  return 1
}

found=0
for spec in $SPECS; do
  name=${spec%%:*}
  kind=${spec#*:}
  matches "$name" || continue
  found=1
  case "$kind" in
    alnum:*) n=${kind#alnum:}; if [ "$list" = 1 ]; then echo "$name  ($n random letters/digits)"; else printf '%s=%s\n' "$name" "$(rand_alnum "$n")"; fi ;;
    b64:*)   n=${kind#b64:};   if [ "$list" = 1 ]; then echo "$name  (base64 of $n random bytes)"; else printf '%s=%s\n' "$name" "$(rand_b64 "$n")"; fi ;;
  esac
done

if [ "$found" = 0 ]; then
  echo "No secret matches:$filters (run with --list to see the names)." >&2
  exit 1
fi
