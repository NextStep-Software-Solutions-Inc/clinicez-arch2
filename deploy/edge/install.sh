#!/usr/bin/env bash
# ClinicEZ Edge Cell installer (Linux / macOS). Windows: install.ps1 (same options, PowerShell spelling).
#
#   ./install.sh [install]            first install, or re-run (keeps .env and every generated secret)
#   ./install.sh apply                re-render hub-bootstrap.env, pull and `up -d` after editing .env (e.g. COMPOSE_PROFILES)
#   ./install.sh upgrade [--tag X]    (= --upgrade) back up, pull the new images, up -d
#   ./install.sh activate             first-run activation with --license-token / --license-file (also air-gapped import)
#   ./install.sh backup               (= --backup) one backup now
#   ./install.sh restore <file>       (= --restore <file>) restore a <DB>.<ts>.dump or files.<ts>.tar.gz from BACKUP_DIR
#   ./install.sh status               containers, license status, queued outbound messages
#   ./install.sh render               only (re)generate hub-bootstrap.env from .env
#
# Run ./install.sh --help for all options. See README.md for the runbook.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=.env
HUB_ENV_FILE=hub-bootstrap.env

# Every variable the installer manages. Order = order in the generated .env.
KEYS="GHCR_OWNER_REPO IMAGE_TAG COMPOSE_PROFILES TENANT_ID EDGE_CELL_ID EDGE_CELL_NAME
CLINIC_FACILITY_ID CLINIC_FACILITY_NAME LABORATORY_FACILITY_ID LABORATORY_FACILITY_NAME
PHARMACY_FACILITY_ID PHARMACY_FACILITY_NAME ORGANIZATION_FACILITY_ID ORGANIZATION_FACILITY_NAME BASE_DOMAIN
UPSTREAM_ENABLED UPSTREAM_HUB_URL UPSTREAM_CLIENT_ID UPSTREAM_CLIENT_SECRET PORTAL_API_URL CLINIC_PUBLIC_UPLOAD_BASE_URL MESSAGING_HUB_URL
CLINIC_HUB_CLIENT_ID CLINIC_HUB_CLIENT_SECRET BILLING_HUB_CLIENT_ID BILLING_HUB_CLIENT_SECRET
LABORATORY_HUB_CLIENT_ID LABORATORY_HUB_CLIENT_SECRET PHARMACY_HUB_CLIENT_ID PHARMACY_HUB_CLIENT_SECRET
ORGANIZATION_HUB_CLIENT_ID ORGANIZATION_HUB_CLIENT_SECRET HUB_PAYLOAD_ENCRYPTION_KEY HUB_BIND HUB_LAN_PORT
POSTGRES_USER POSTGRES_PASSWORD INTERNAL_API_KEY PHARMACY_API_KEY HANGFIRE_DASHBOARD_PASSWORD
CLINIC_JWT_SIGNING_KEY BILLING_JWT_SIGNING_KEY LABORATORY_JWT_SIGNING_KEY PHARMACY_JWT_SIGNING_KEY ORGANIZATION_JWT_SIGNING_KEY
CLINIC_WEB_PORT LABORATORY_WEB_PORT PHARMACY_WEB_PORT CASHIER_WEB_PORT
BACKUP_DIR BACKUP_INTERVAL_HOURS BACKUP_RETENTION_DAYS"

# service | env prefix | compose profile ('' = always) | hub facility type ('-' = no facility)
SERVICES="clinic|CLINIC||Clinic
billing|BILLING||-
laboratory|LABORATORY|laboratory|Laboratory
pharmacy|PHARMACY|pharmacy|Pharmacy
organization|ORGANIZATION|organization|Organization"

log()  { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Install options (all optional: missing values are asked for, or taken from an existing .env):
  --ghcr-owner-repo <owner/repo>   image namespace, ghcr.io/<this>/<service>   (default nextstep-software-solutions-inc/clinicez-arch2)
  --tag <tag>                      image tag (default latest)
  --tenant-id <id>                 tenant that owns this site (portal)
  --cell-id <id>                   edge cell id (portal)
  --cell-name <name>
  --facility-id <guid>             clinic facility id (portal);  --facility-name <name>
  --lab-facility-id <guid>  --pharmacy-facility-id <guid>  --org-facility-id <guid>
  --with <list>                    extra profiles: laboratory,pharmacy,organization,cashier
  --cloud-hub-url <url>            portal HubEdgeCredentials.HubUrl (UPSTREAM_HUB_URL; with --no-local-hub: MESSAGING_HUB_URL)
  --edge-client-id <id>            local hub only: the ONE upstream client the portal issued to the cell (HubEdgeCredentials.ClientId)
  --edge-client-secret <secret>    local hub only: its ClientSecret (prefer the prompt: it keeps it out of shell history)
  --portal-api-url <url>           cloud portal API (workspace profile fetches; may stay empty with --air-gapped)
  --public-upload-url <url>        public lab-result upload page (a cloud page, printed on lab slips); may stay empty with
                                   --air-gapped, but lab orders cannot be issued until it is set
  --air-gapped                     no cloud link: UPSTREAM_ENABLED=false, same-cell traffic only (cross-cell messages are
                                   rejected, not queued); license activation by file. Not combinable with --no-local-hub
  --no-local-hub                   single-facility site, no local hub: clinic and billing use the PORTAL-issued per-service
                                   clients against the cloud hub (see README)
  --clinic-hub-client-id <id> --clinic-hub-client-secret <secret>      only with --no-local-hub: the portal's clinic client
  --billing-hub-client-id <id> --billing-hub-client-secret <secret>    only with --no-local-hub: the portal's billing client
  --license-token <token> | --license-file <path>                    clinic license
  --lab-license-token|--lab-license-file, --pharmacy-license-token|--pharmacy-license-file
  --backup-dir <path>              host folder for backups (default ./backups)
  --force                          rewrite .env (old file saved as .env.bak.<time>; existing secrets are kept)
  --yes                            never prompt; fail when a required value is missing
  --no-pull                        do not pull (images loaded with `docker load`)
  --no-start                       write config only
  --no-backup                      upgrade: skip the pre-upgrade backup
Registry login for private images: export GHCR_USER and GHCR_TOKEN (a read:packages token) before running.
EOF
}

# ---------------------------------------------------------------- arguments
for k in $KEYS; do printf -v "$k" '%s' ""; done
COMMAND=""; FORCE=0; ASSUME_YES=0; AIR_GAPPED=0; NO_LOCAL_HUB=0; NO_PULL=0; NO_START=0; NO_BACKUP=0
WITH=""; RESTORE_FILE=""
LICENSE_CLINIC=""; LICENSE_LABORATORY=""; LICENSE_PHARMACY=""

need_arg() { [ "$#" -ge 2 ] || die "$1 needs a value"; }

read_license() { # <path> -> token on stdout (raw token text, or JSON with a licenseToken property)
  [ -f "$1" ] || die "License file not found: $1"
  local raw tok
  raw=$(cat "$1")
  case "$raw" in
    \{*) tok=$(printf '%s' "$raw" | tr -d '\r\n' | sed -n 's/.*"[Ll]icense[Tt]oken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p') ;;
    *)   tok=$(printf '%s' "$raw" | tr -d '[:space:]') ;;
  esac
  [ -n "$tok" ] || die "No license token found in $1"
  printf '%s' "$tok"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    install|apply|upgrade|activate|backup|restore|status|render) COMMAND=$1 ;;
    --upgrade) COMMAND=upgrade ;;
    --backup)  COMMAND=backup ;;
    --restore) COMMAND=restore; need_arg "$@"; RESTORE_FILE=$2; shift ;;
    --ghcr-owner-repo) need_arg "$@"; GHCR_OWNER_REPO=$2; shift ;;
    --tag) need_arg "$@"; IMAGE_TAG=$2; shift ;;
    --tenant-id) need_arg "$@"; TENANT_ID=$2; shift ;;
    --cell-id) need_arg "$@"; EDGE_CELL_ID=$2; shift ;;
    --cell-name) need_arg "$@"; EDGE_CELL_NAME=$2; shift ;;
    --facility-id) need_arg "$@"; CLINIC_FACILITY_ID=$2; shift ;;
    --facility-name) need_arg "$@"; CLINIC_FACILITY_NAME=$2; shift ;;
    --lab-facility-id) need_arg "$@"; LABORATORY_FACILITY_ID=$2; shift ;;
    --pharmacy-facility-id) need_arg "$@"; PHARMACY_FACILITY_ID=$2; shift ;;
    --org-facility-id) need_arg "$@"; ORGANIZATION_FACILITY_ID=$2; shift ;;
    --with) need_arg "$@"; WITH=$2; shift ;;
    --cloud-hub-url) need_arg "$@"; UPSTREAM_HUB_URL=$2; shift ;;
    --edge-client-id) need_arg "$@"; UPSTREAM_CLIENT_ID=$2; shift ;;
    --edge-client-secret) need_arg "$@"; UPSTREAM_CLIENT_SECRET=$2; shift ;;
    --portal-api-url) need_arg "$@"; PORTAL_API_URL=$2; shift ;;
    --public-upload-url) need_arg "$@"; CLINIC_PUBLIC_UPLOAD_BASE_URL=$2; shift ;;
    --base-domain) need_arg "$@"; BASE_DOMAIN=$2; shift ;;
    --clinic-hub-client-id) need_arg "$@"; CLINIC_HUB_CLIENT_ID=$2; shift ;;
    --clinic-hub-client-secret) need_arg "$@"; CLINIC_HUB_CLIENT_SECRET=$2; shift ;;
    --billing-hub-client-id) need_arg "$@"; BILLING_HUB_CLIENT_ID=$2; shift ;;
    --billing-hub-client-secret) need_arg "$@"; BILLING_HUB_CLIENT_SECRET=$2; shift ;;
    --license-token) need_arg "$@"; LICENSE_CLINIC=$2; shift ;;
    --license-file) need_arg "$@"; LICENSE_CLINIC=$(read_license "$2"); shift ;;
    --lab-license-token) need_arg "$@"; LICENSE_LABORATORY=$2; shift ;;
    --lab-license-file) need_arg "$@"; LICENSE_LABORATORY=$(read_license "$2"); shift ;;
    --pharmacy-license-token) need_arg "$@"; LICENSE_PHARMACY=$2; shift ;;
    --pharmacy-license-file) need_arg "$@"; LICENSE_PHARMACY=$(read_license "$2"); shift ;;
    --backup-dir) need_arg "$@"; BACKUP_DIR=$2; shift ;;
    --air-gapped) AIR_GAPPED=1; UPSTREAM_ENABLED=false ;;
    --no-local-hub) NO_LOCAL_HUB=1 ;;
    --force) FORCE=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --no-pull) NO_PULL=1 ;;
    --no-start) NO_START=1 ;;
    --no-backup) NO_BACKUP=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Unknown option: $1 (see --help)" ;;
    *) if [ "$COMMAND" = restore ] && [ -z "$RESTORE_FILE" ]; then RESTORE_FILE=$1; else die "Unexpected argument: $1 (see --help)"; fi ;;
  esac
  shift
done
[ -n "$COMMAND" ] || COMMAND=install
if [ "$AIR_GAPPED" = 1 ] && [ "$NO_LOCAL_HUB" = 1 ]; then
  die "--air-gapped cannot be combined with --no-local-hub: without a local hub the services talk to the cloud hub directly, so nothing could run offline."
fi

INTERACTIVE=0
if [ -t 0 ] && [ "$ASSUME_YES" = 0 ]; then INTERACTIVE=1; fi

# ---------------------------------------------------------------- helpers
dc() { docker compose --env-file "$ENV_FILE" "$@"; }

require_env() { [ -f "$ENV_FILE" ] || die "$ENV_FILE not found: run ./install.sh first."; }

env_get() { # <key> <file>
  local line=""
  if [ -f "$2" ]; then line=$(grep -E "^$1=" "$2" | tail -n 1 || true); fi
  line=${line#*=}
  printf '%s' "${line%$'\r'}"
}

resolve() { # <KEY>: command line value, else existing .env, else empty. '<...>' placeholders count as empty.
  local k=$1 cur
  cur=${!k}
  if [ -z "$cur" ]; then cur=$(env_get "$k" "$ENV_FILE"); fi
  case "$cur" in \<*) cur="" ;; esac
  printf -v "$k" '%s' "$cur"
}

default() { local k=$1; if [ -z "${!k}" ]; then printf -v "$k" '%s' "$2"; fi; }

has_profile() { case ",$COMPOSE_PROFILES," in *",$1,"*) return 0 ;; esac; return 1; }

rand_alnum() { # <length>: cryptographic randomness, [A-Za-z0-9] only (safe inside connection strings and .env)
  local n=$1 s=""
  while [ "${#s}" -lt "$n" ]; do s="$s$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"; done
  printf '%s' "${s:0:$n}"
}

rand_b64_32() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }

gen_if_empty() { local k=$1; if [ -z "${!k}" ]; then printf -v "$k" '%s' "$(rand_alnum "$2")"; fi; }

ask() { # <KEY> <prompt> [secret]
  local k=$1 v=""
  if [ -n "${!k}" ]; then return 0; fi
  if [ "$INTERACTIVE" = 1 ]; then
    if [ "${3:-}" = secret ]; then read -r -s -p "$2: " v; echo; else read -r -p "$2: " v; fi
    printf -v "$k" '%s' "$v"
  fi
  if [ -z "${!k}" ]; then die "$k is required: $2 (pass the matching option, or run interactively)."; fi
}

ask_yn() { # <prompt> <default y|n> -> 0 = yes
  local a=""
  if [ "$INTERACTIVE" = 0 ]; then [ "$2" = y ]; return; fi
  read -r -p "$1 [$2] " a
  a=${a:-$2}
  case "$a" in y|Y|yes|YES) return 0 ;; esac
  return 1
}

check_safe() { # <KEY> [allow-spaces]: values end up unquoted in .env files
  local k=$1 v=${!1}
  case "$v" in
    *'$'*|*"'"*|*'"'*|*'\'*|*'`'*|*'#'*) die "$k must not contain \$ ' \" \\ \` or #." ;;
  esac
  if [ "${2:-}" != spaces ]; then
    case "$v" in *[[:space:]]*) die "$k must not contain spaces." ;; esac
  fi
}

check_guid() { # <KEY>
  if [ -n "${!1}" ] && ! printf '%s' "${!1}" | grep -Eq '^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$'; then
    die "$1 must be a GUID (got '${!1}')."
  fi
}

trim_url() { local k=$1 v=${!1}; while [ "${v%/}" != "$v" ]; do v=${v%/}; done; printf -v "$k" '%s' "$v"; }

set_env_value() { # <KEY> <value>: replace or append one line in .env
  local tmp="$ENV_FILE.tmp"
  { grep -v "^$1=" "$ENV_FILE" || true; printf '%s=%s\n' "$1" "$2"; } > "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
}

enabled_services() {
  local s="postgres billing-api clinic-api clinic-web"
  if has_profile local-hub; then s="$s interop-hub"; fi
  if has_profile laboratory; then s="$s laboratory-api laboratory-web"; fi
  if has_profile pharmacy; then s="$s pharmacy-api pharmacy-web"; fi
  if has_profile organization; then s="$s organization-api"; fi
  if has_profile cashier; then s="$s cashier-web"; fi
  printf '%s' "$s"
}

host_name() { hostname -I 2>/dev/null | awk '{print $1}' || true; }

# ---------------------------------------------------------------- preflight
preflight_docker() {
  log "Preflight checks"
  command -v docker >/dev/null 2>&1 || die "docker is not installed (https://docs.docker.com/engine/install/)."
  docker info >/dev/null 2>&1 || die "The docker daemon is not running, or this user may not use it (try: sudo usermod -aG docker \$USER, then log in again)."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command, not 'docker-compose')."
  command -v curl >/dev/null 2>&1 || die "curl is required (health checks and license activation)."
  local kb
  kb=$(df -Pk . | awk 'NR==2 {print $4}')
  if [ -n "$kb" ] && [ "$kb" -lt 3145728 ]; then die "Less than 3 GB free on this disk; the images, database and backups need more."; fi
  if [ -n "$kb" ] && [ "$kb" -lt 10485760 ]; then warn "Less than 10 GB free on this disk."; fi
}

port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

preflight_ports() {
  if [ -n "$(dc ps -q 2>/dev/null || true)" ]; then return 0; fi   # our own stack is already up: ports are ours
  local p ports="$CLINIC_WEB_PORT"
  if has_profile laboratory; then ports="$ports $LABORATORY_WEB_PORT"; fi
  if has_profile pharmacy; then ports="$ports $PHARMACY_WEB_PORT"; fi
  if has_profile cashier; then ports="$ports $CASHIER_WEB_PORT"; fi
  if has_profile local-hub; then ports="$ports $HUB_LAN_PORT"; fi
  for p in $ports; do
    if port_in_use "$p"; then die "Port $p is already in use on this host. Change it in .env (CLINIC_WEB_PORT, ..., HUB_LAN_PORT) or stop the other program."; fi
  done
}

# ---------------------------------------------------------------- configuration
decide_profiles() {
  local extra="" p
  if [ -n "$WITH" ]; then
    extra=$WITH
  elif [ -n "$COMPOSE_PROFILES" ]; then
    extra=$COMPOSE_PROFILES
  elif [ "$INTERACTIVE" = 1 ]; then
    for p in laboratory pharmacy organization cashier; do
      if ask_yn "Enable the $p profile?" n; then extra="$extra,$p"; fi
    done
  fi
  extra=$(printf '%s' "$extra" | tr -d ' ' | sed 's/local-hub//g; s/,,*/,/g; s/^,//; s/,$//')
  for p in $(printf '%s' "$extra" | tr ',' ' '); do
    case "$p" in laboratory|pharmacy|organization|cashier) ;; *) die "Unknown profile '$p' (laboratory, pharmacy, organization, cashier).";; esac
  done
  if [ "$NO_LOCAL_HUB" = 1 ]; then
    if [ -n "$extra" ]; then die "--no-local-hub only fits a single-facility site: several facilities need the local hub (README)."; fi
    COMPOSE_PROFILES=""
  else
    COMPOSE_PROFILES="local-hub${extra:+,$extra}"
  fi
}

collect_config() { # <new|reuse>
  # Client model (see README "Credentials the portal hands out"):
  #   hub mode A (local-hub profile on, default): services use LOCAL clients site-<svc> (generated here, fed to the hub through
  #     hub-bootstrap.env and to the services as Messaging__ClientSecret). Only the hub holds ONE portal-issued upstream client.
  #   hub mode B (--no-local-hub): services talk to the cloud hub with the PORTAL-issued per-service clients (clinic, billing).
  local mode=$1 k svc prefix prof ftype hubmode oldmode=none
  local f_cid=$CLINIC_HUB_CLIENT_ID f_csec=$CLINIC_HUB_CLIENT_SECRET f_bid=$BILLING_HUB_CLIENT_ID f_bsec=$BILLING_HUB_CLIENT_SECRET f_url=$UPSTREAM_HUB_URL
  local f_uid=$UPSTREAM_CLIENT_ID f_usec=$UPSTREAM_CLIENT_SECRET
  if [ -f "$ENV_FILE" ]; then
    case ",$(env_get COMPOSE_PROFILES "$ENV_FILE")," in *,local-hub,*) oldmode=A ;; *) oldmode=B ;; esac
  fi
  for k in $KEYS; do resolve "$k"; done

  default GHCR_OWNER_REPO nextstep-software-solutions-inc/clinicez-arch2
  default IMAGE_TAG latest
  default BASE_DOMAIN clinic.local
  default EDGE_CELL_NAME "Edge site"
  default CLINIC_FACILITY_NAME Clinic
  default LABORATORY_FACILITY_NAME Laboratory
  default PHARMACY_FACILITY_NAME Pharmacy
  default ORGANIZATION_FACILITY_NAME Organization
  default POSTGRES_USER clinicez
  default UPSTREAM_ENABLED true
  default HUB_BIND 127.0.0.1
  default HUB_LAN_PORT 8090
  default CLINIC_WEB_PORT 8080
  default LABORATORY_WEB_PORT 8081
  default PHARMACY_WEB_PORT 8082
  default CASHIER_WEB_PORT 8083
  default BACKUP_DIR ./backups
  default BACKUP_INTERVAL_HOURS 24
  default BACKUP_RETENTION_DAYS 14

  if [ "$mode" = new ]; then decide_profiles; fi
  hubmode=A
  if ! has_profile local-hub; then hubmode=B; fi

  # Flags that belong to the other hub mode are refused instead of silently ignored.
  if [ "$hubmode" = A ] && [ -n "$f_cid$f_csec$f_bid$f_bsec" ]; then
    die "--clinic-hub-client-* / --billing-hub-client-* are the portal's per-service clients and only fit --no-local-hub. With the local hub the installer generates the local site-<service> clients."
  fi
  if [ "$hubmode" = B ] && [ -n "$f_uid$f_usec" ]; then
    die "--edge-client-id/--edge-client-secret are the upstream client of the LOCAL hub. With --no-local-hub use --clinic-hub-client-* and --billing-hub-client-*."
  fi
  # Switching hub mode with --force: the old clients are of another kind (local site-<svc> vs portal-issued), never reuse them.
  if [ "$mode" = new ] && [ "$oldmode" != none ] && [ "$oldmode" != "$hubmode" ]; then
    CLINIC_HUB_CLIENT_ID=$f_cid; CLINIC_HUB_CLIENT_SECRET=$f_csec; BILLING_HUB_CLIENT_ID=$f_bid; BILLING_HUB_CLIENT_SECRET=$f_bsec
    MESSAGING_HUB_URL=""
  fi

  if [ "$mode" = new ]; then
    ask TENANT_ID "Tenant id (from the portal)"
    ask EDGE_CELL_ID "Edge cell id (from the portal)"
    ask CLINIC_FACILITY_ID "Clinic facility id (GUID, from the portal)"
    if has_profile laboratory; then ask LABORATORY_FACILITY_ID "Laboratory facility id (GUID)"; fi
    if has_profile pharmacy; then ask PHARMACY_FACILITY_ID "Pharmacy facility id (GUID)"; fi
    if has_profile organization; then ask ORGANIZATION_FACILITY_ID "Organization facility id (GUID)"; fi
  fi

  case "$UPSTREAM_ENABLED" in true|false) ;; *) die "UPSTREAM_ENABLED must be true or false." ;; esac
  if [ "$hubmode" = B ]; then
    # No local hub: no upstream at all. MESSAGING_HUB_URL is the cloud hub; clinic and billing use the portal's own clients.
    UPSTREAM_ENABLED=true; UPSTREAM_HUB_URL=""; UPSTREAM_CLIENT_ID=""; UPSTREAM_CLIENT_SECRET=""
    LABORATORY_HUB_CLIENT_ID=""; LABORATORY_HUB_CLIENT_SECRET=""; PHARMACY_HUB_CLIENT_ID=""; PHARMACY_HUB_CLIENT_SECRET=""
    ORGANIZATION_HUB_CLIENT_ID=""; ORGANIZATION_HUB_CLIENT_SECRET=""
    if [ -n "$f_url" ]; then MESSAGING_HUB_URL=$f_url; fi
    if [ "$mode" = new ]; then
      ask MESSAGING_HUB_URL "Cloud hub URL (portal HubEdgeCredentials.HubUrl)"
      ask CLINIC_HUB_CLIENT_ID "Clinic hub client id (portal-issued)"
      ask CLINIC_HUB_CLIENT_SECRET "Clinic hub client secret (portal-issued)" secret
      ask BILLING_HUB_CLIENT_ID "Billing hub client id (portal-issued)"
      ask BILLING_HUB_CLIENT_SECRET "Billing hub client secret (portal-issued)" secret
      ask PORTAL_API_URL "Cloud portal API URL"
      ask CLINIC_PUBLIC_UPLOAD_BASE_URL "Public lab-upload page URL (cloud portal)"
    fi
  else
    default MESSAGING_HUB_URL http://interop-hub:8080
    if [ "$mode" = new ] && [ "$UPSTREAM_ENABLED" = true ]; then
      ask UPSTREAM_HUB_URL "Cloud hub URL (portal HubEdgeCredentials.HubUrl)"
      ask UPSTREAM_CLIENT_ID "Upstream edge client id (portal HubEdgeCredentials.ClientId)"
      ask UPSTREAM_CLIENT_SECRET "Upstream edge client secret (portal HubEdgeCredentials.ClientSecret)" secret
      ask PORTAL_API_URL "Cloud portal API URL"
      ask CLINIC_PUBLIC_UPLOAD_BASE_URL "Public lab-upload page URL (cloud portal)"
    fi
  fi
  if [ -z "$CLINIC_PUBLIC_UPLOAD_BASE_URL" ]; then
    warn "CLINIC_PUBLIC_UPLOAD_BASE_URL is empty: lab orders cannot be issued until it is set (public URL of the cloud lab-upload page; --public-upload-url, or edit .env and run ./install.sh apply)."
  fi
  if [ "$mode" = reuse ] && [ "$AIR_GAPPED" = 1 ] && [ "$(env_get UPSTREAM_ENABLED "$ENV_FILE")" != false ]; then
    warn "--air-gapped is ignored on an existing .env: set UPSTREAM_ENABLED=false in .env and run ./install.sh apply (or re-run with --force)."
  fi

  # Mode A: local hub clients site-<svc>, generated once then kept (resolve() reads them back from .env). Mode B: the clinic and
  # billing clients are the portal's (asked above, never generated) and the other services do not run.
  while IFS='|' read -r svc prefix prof ftype; do
    if [ "$hubmode" = A ]; then
      default "${prefix}_HUB_CLIENT_ID" "site-$svc"
      gen_if_empty "${prefix}_HUB_CLIENT_SECRET" 40
    fi
    gen_if_empty "${prefix}_JWT_SIGNING_KEY" 64
  done <<EOF
$SERVICES
EOF
  gen_if_empty POSTGRES_PASSWORD 40
  gen_if_empty INTERNAL_API_KEY 48
  gen_if_empty HANGFIRE_DASHBOARD_PASSWORD 24
  if [ -z "$HUB_PAYLOAD_ENCRYPTION_KEY" ]; then HUB_PAYLOAD_ENCRYPTION_KEY=$(rand_b64_32); fi

  for k in UPSTREAM_HUB_URL PORTAL_API_URL CLINIC_PUBLIC_UPLOAD_BASE_URL MESSAGING_HUB_URL; do trim_url "$k"; done
  for k in $KEYS; do
    case "$k" in
      EDGE_CELL_NAME|*_FACILITY_NAME) check_safe "$k" spaces ;;
      *) check_safe "$k" ;;
    esac
  done
  for k in CLINIC_FACILITY_ID LABORATORY_FACILITY_ID PHARMACY_FACILITY_ID ORGANIZATION_FACILITY_ID; do check_guid "$k"; done
  case "$EDGE_CELL_ID" in *:*) die "EDGE_CELL_ID must not contain ':'." ;; esac
  if [ "$mode" = reuse ]; then
    local required="GHCR_OWNER_REPO TENANT_ID EDGE_CELL_ID CLINIC_FACILITY_ID"
    if [ "$hubmode" = B ]; then
      required="$required MESSAGING_HUB_URL CLINIC_HUB_CLIENT_ID CLINIC_HUB_CLIENT_SECRET BILLING_HUB_CLIENT_ID BILLING_HUB_CLIENT_SECRET"
    elif [ "$UPSTREAM_ENABLED" = true ]; then
      required="$required UPSTREAM_HUB_URL UPSTREAM_CLIENT_ID UPSTREAM_CLIENT_SECRET PORTAL_API_URL"
    fi
    for k in $required; do
      if [ -z "${!k}" ]; then die "$k is empty in $ENV_FILE. Fix it, or re-run with --force and the options."; fi
    done
  fi
}

write_env() {
  umask 077
  cat > "$ENV_FILE" <<EOF
# Written by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Every variable is documented in .env.example.
# Contains secrets: keep it out of git and out of the database backups. Re-running the installer keeps the generated ones.

# Images
GHCR_OWNER_REPO=$GHCR_OWNER_REPO
IMAGE_TAG=$IMAGE_TAG
COMPOSE_PROFILES=$COMPOSE_PROFILES

# Identity (portal)
TENANT_ID=$TENANT_ID
EDGE_CELL_ID=$EDGE_CELL_ID
EDGE_CELL_NAME=$EDGE_CELL_NAME
CLINIC_FACILITY_ID=$CLINIC_FACILITY_ID
CLINIC_FACILITY_NAME=$CLINIC_FACILITY_NAME
LABORATORY_FACILITY_ID=$LABORATORY_FACILITY_ID
LABORATORY_FACILITY_NAME=$LABORATORY_FACILITY_NAME
PHARMACY_FACILITY_ID=$PHARMACY_FACILITY_ID
PHARMACY_FACILITY_NAME=$PHARMACY_FACILITY_NAME
ORGANIZATION_FACILITY_ID=$ORGANIZATION_FACILITY_ID
ORGANIZATION_FACILITY_NAME=$ORGANIZATION_FACILITY_NAME
BASE_DOMAIN=$BASE_DOMAIN

# Cloud link of the LOCAL hub (mode A): ONE EdgeCell client (Service 'cell') the portal issued = portal HubEdgeCredentials.
# UPSTREAM_ENABLED=false (--air-gapped): the hub runs without any upstream, same-cell traffic only. Empty values are fine then;
# to connect later set it to true, fill the three UPSTREAM_* values and run ./install.sh apply. Not used with --no-local-hub.
UPSTREAM_ENABLED=$UPSTREAM_ENABLED
UPSTREAM_HUB_URL=$UPSTREAM_HUB_URL
UPSTREAM_CLIENT_ID=$UPSTREAM_CLIENT_ID
UPSTREAM_CLIENT_SECRET=$UPSTREAM_CLIENT_SECRET
PORTAL_API_URL=$PORTAL_API_URL

# Public URL of the lab-result upload page printed on lab slips (a cloud page; the site only needs outbound access).
# Required to issue lab orders. May be empty when air-gapped.
CLINIC_PUBLIC_UPLOAD_BASE_URL=$CLINIC_PUBLIC_UPLOAD_BASE_URL

# Messaging clients of the services.
#   Local hub (default): MESSAGING_HUB_URL is the local hub; every <SVC>_HUB_CLIENT_ID/SECRET is a LOCAL client (site-<service>)
#     generated here; the same values go into hub-bootstrap.env.
#   --no-local-hub: MESSAGING_HUB_URL is the cloud hub; CLINIC_ and BILLING_HUB_CLIENT_ID/SECRET are the PORTAL-issued
#     per-service clients (the other services do not run).
MESSAGING_HUB_URL=$MESSAGING_HUB_URL
CLINIC_HUB_CLIENT_ID=$CLINIC_HUB_CLIENT_ID
CLINIC_HUB_CLIENT_SECRET=$CLINIC_HUB_CLIENT_SECRET
BILLING_HUB_CLIENT_ID=$BILLING_HUB_CLIENT_ID
BILLING_HUB_CLIENT_SECRET=$BILLING_HUB_CLIENT_SECRET
LABORATORY_HUB_CLIENT_ID=$LABORATORY_HUB_CLIENT_ID
LABORATORY_HUB_CLIENT_SECRET=$LABORATORY_HUB_CLIENT_SECRET
PHARMACY_HUB_CLIENT_ID=$PHARMACY_HUB_CLIENT_ID
PHARMACY_HUB_CLIENT_SECRET=$PHARMACY_HUB_CLIENT_SECRET
ORGANIZATION_HUB_CLIENT_ID=$ORGANIZATION_HUB_CLIENT_ID
ORGANIZATION_HUB_CLIENT_SECRET=$ORGANIZATION_HUB_CLIENT_SECRET
HUB_PAYLOAD_ENCRYPTION_KEY=$HUB_PAYLOAD_ENCRYPTION_KEY
HUB_BIND=$HUB_BIND
HUB_LAN_PORT=$HUB_LAN_PORT

# Database
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# Service secrets
INTERNAL_API_KEY=$INTERNAL_API_KEY
PHARMACY_API_KEY=$PHARMACY_API_KEY
HANGFIRE_DASHBOARD_PASSWORD=$HANGFIRE_DASHBOARD_PASSWORD
CLINIC_JWT_SIGNING_KEY=$CLINIC_JWT_SIGNING_KEY
BILLING_JWT_SIGNING_KEY=$BILLING_JWT_SIGNING_KEY
LABORATORY_JWT_SIGNING_KEY=$LABORATORY_JWT_SIGNING_KEY
PHARMACY_JWT_SIGNING_KEY=$PHARMACY_JWT_SIGNING_KEY
ORGANIZATION_JWT_SIGNING_KEY=$ORGANIZATION_JWT_SIGNING_KEY

# Web ports
CLINIC_WEB_PORT=$CLINIC_WEB_PORT
LABORATORY_WEB_PORT=$LABORATORY_WEB_PORT
PHARMACY_WEB_PORT=$PHARMACY_WEB_PORT
CASHIER_WEB_PORT=$CASHIER_WEB_PORT

# Backups
BACKUP_DIR=$BACKUP_DIR
BACKUP_INTERVAL_HOURS=$BACKUP_INTERVAL_HOURS
BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS
EOF
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  log "Wrote $ENV_FILE"
}

append_missing() { # keep an older .env working after an upgrade added variables
  local k
  for k in $KEYS; do
    if ! grep -q "^$k=" "$ENV_FILE"; then
      if [ -n "${!k}" ]; then printf '%s=%s\n' "$k" "${!k}" >> "$ENV_FILE"; fi
    fi
  done
}

# hub-bootstrap.env: the cell, one EdgeCell client per enabled service and the site's facilities. The client secrets are the
# very values the services get as Messaging__ClientSecret (same variables in .env), so the two sides always match. These are the
# LOCAL clients site-<svc>; the portal-issued upstream client (UPSTREAM_*) is deliberately not in here. Without the local hub
# (--no-local-hub) there is nothing to declare: the file is still written, comment-only, so compose always finds it.
render_hub_bootstrap() {
  local svc prefix prof ftype ci=0 fi_=0 id secret fid fname enabled
  umask 077
  if ! has_profile local-hub; then
    echo "# Generated by install.sh (./install.sh render). No local hub on this site (--no-local-hub): nothing to declare." > "$HUB_ENV_FILE"
    chmod 600 "$HUB_ENV_FILE" 2>/dev/null || true
    log "Rendered $HUB_ENV_FILE (no local hub: empty)"
    return 0
  fi
  {
    echo "# Generated by install.sh from .env (./install.sh render). Do not edit; contains the local hub client secrets."
    echo "Hub__Bootstrap__Cells__0__CellId=$EDGE_CELL_ID"
    echo "Hub__Bootstrap__Cells__0__Name=$EDGE_CELL_NAME"
    echo "Hub__Bootstrap__Cells__0__Kind=Edge"
    echo "Hub__Bootstrap__Cells__0__TenantId=$TENANT_ID"
    while IFS='|' read -r svc prefix prof ftype; do
      enabled=1
      if [ -n "$prof" ] && ! has_profile "$prof"; then enabled=0; fi
      if [ "$enabled" = 1 ]; then
        eval "id=\${${prefix}_HUB_CLIENT_ID}; secret=\${${prefix}_HUB_CLIENT_SECRET}"
        echo "Hub__Bootstrap__Clients__${ci}__ClientId=$id"
        echo "Hub__Bootstrap__Clients__${ci}__Secret=$secret"
        echo "Hub__Bootstrap__Clients__${ci}__CellId=$EDGE_CELL_ID"
        echo "Hub__Bootstrap__Clients__${ci}__Service=$svc"
        echo "Hub__Bootstrap__Clients__${ci}__Kind=EdgeCell"
        ci=$((ci + 1))
        if [ "$ftype" != "-" ]; then
          eval "fid=\${${prefix}_FACILITY_ID}; fname=\${${prefix}_FACILITY_NAME}"
          if [ -n "$fid" ]; then
            echo "Hub__Bootstrap__Facilities__${fi_}__TenantId=$TENANT_ID"
            echo "Hub__Bootstrap__Facilities__${fi_}__FacilityId=$fid"
            echo "Hub__Bootstrap__Facilities__${fi_}__FacilityType=$ftype"
            echo "Hub__Bootstrap__Facilities__${fi_}__CellId=$EDGE_CELL_ID"
            echo "Hub__Bootstrap__Facilities__${fi_}__DisplayName=$fname"
            fi_=$((fi_ + 1))
          fi
        fi
      fi
    done <<EOF
$SERVICES
EOF
  } > "$HUB_ENV_FILE"
  chmod 600 "$HUB_ENV_FILE" 2>/dev/null || true
  log "Rendered $HUB_ENV_FILE ($ci clients, $fi_ facilities)"
}

# ---------------------------------------------------------------- stack
registry_login() {
  if [ -n "${GHCR_TOKEN:-}" ]; then
    log "Logging in to ghcr.io"
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?Set GHCR_USER together with GHCR_TOKEN}" --password-stdin >/dev/null
  fi
}

wait_healthy() { # <timeout seconds>
  local timeout=$1 waited=0 svc cid st pending
  log "Waiting for services to become healthy (up to ${timeout}s)"
  while :; do
    pending=""
    for svc in $(enabled_services); do
      cid=$(dc ps -q "$svc" 2>/dev/null || true)
      if [ -z "$cid" ]; then pending="$pending $svc"; continue; fi
      st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)
      case "$st" in healthy|running) ;; *) pending="$pending $svc" ;; esac
    done
    if [ -z "$pending" ]; then log "All services are healthy"; return 0; fi
    if [ "$waited" -ge "$timeout" ]; then warn "Not healthy after ${timeout}s:$pending  (docker compose logs --tail 100$pending)"; return 1; fi
    sleep 5; waited=$((waited + 5))
  done
}

apply_stack() {
  render_hub_bootstrap
  if [ "$NO_START" = 1 ]; then log "--no-start: configuration written, nothing started."; return 0; fi
  if [ "$NO_PULL" = 0 ]; then
    registry_login
    log "Pulling images (profiles: ${COMPOSE_PROFILES:-none})"
    dc pull || die "docker compose pull failed. Check the network and ghcr.io access (docker login ghcr.io, GHCR_OWNER_REPO=$GHCR_OWNER_REPO, IMAGE_TAG=$IMAGE_TAG). Air-gapped: docker load the images, then use --no-pull."
  fi
  log "Starting the cell"
  dc up -d --remove-orphans
  wait_healthy 300 || true
}

# ---------------------------------------------------------------- activation
ACTIVATION_PENDING=0

activate_one() { # <label> <web port> <license token or empty>
  local label=$1 base="http://127.0.0.1:$2" token=$3 body tmp code
  body=$(curl -fsS --max-time 10 "$base/api/v1/license" 2>/dev/null || true)
  if printf '%s' "$body" | grep -Eiq '"status"[[:space:]]*:[[:space:]]*"Active"'; then
    log "$label: license is already active."
    return 0
  fi
  if [ -z "$token" ]; then
    warn "$label is not activated. Run: ./install.sh activate --license-token <token>   or   --license-file <file>"
    ACTIVATION_PENDING=1
    return 0
  fi
  printf '%s' "$token" | grep -Eq '^[A-Za-z0-9_.=-]+$' || die "$label license token has unexpected characters (expected <payload>.<signature>)."
  tmp=$(mktemp)
  code=$(curl -sS --max-time 30 -o "$tmp" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"licenseToken\":\"$token\"}" "$base/api/v1/license/apply" 2>/dev/null || echo 000)
  if [ "$code" = 200 ]; then
    log "$label: license applied."
  else
    warn "$label: activation failed (HTTP $code): $(head -c 400 "$tmp")"
    ACTIVATION_PENDING=1
  fi
  rm -f "$tmp"
}

activate_all() {
  activate_one "Clinic" "$CLINIC_WEB_PORT" "$LICENSE_CLINIC"
  if has_profile laboratory; then activate_one "Laboratory" "$LABORATORY_WEB_PORT" "$LICENSE_LABORATORY"; fi
  if has_profile pharmacy; then activate_one "Pharmacy" "$PHARMACY_WEB_PORT" "$LICENSE_PHARMACY"; fi
}

# ---------------------------------------------------------------- commands
next_steps() {
  local h
  h=$(host_name); h=${h:-<this-server>}
  echo
  log "Edge cell is up. Next steps"
  echo "  Clinic web:      http://$h:$CLINIC_WEB_PORT   (native apps: enter this address as the server)"
  if has_profile laboratory; then echo "  Laboratory web:  http://$h:$LABORATORY_WEB_PORT"; fi
  if has_profile pharmacy; then echo "  Pharmacy web:    http://$h:$PHARMACY_WEB_PORT"; fi
  if has_profile cashier; then echo "  Cashier web:     http://$h:$CASHIER_WEB_PORT"; fi
  if [ "$ACTIVATION_PENDING" = 1 ]; then
    echo "  Activate:        ./install.sh activate --license-token <token>   (or --license-file <file> for an air-gapped site)"
  fi
  echo "  Create the first admin in the clinic web app, then add staff."
  if has_profile local-hub && [ "$UPSTREAM_ENABLED" = false ]; then
    echo "  Air-gapped:      same-cell traffic only; cross-cell/portal messages are rejected, not queued. To connect later: set UPSTREAM_ENABLED=true + UPSTREAM_* in .env, then ./install.sh apply"
  fi
  echo "  Backups:         every ${BACKUP_INTERVAL_HOURS}h to $BACKUP_DIR, kept ${BACKUP_RETENTION_DAYS} days.  Copy .env somewhere safe too."
  echo "  Status / logs:   ./install.sh status      docker compose logs -f clinic-api"
  echo "  Upgrade:         ./install.sh upgrade --tag <version>"
}

cmd_install() {
  preflight_docker
  if [ -f "$ENV_FILE" ] && [ "$FORCE" = 0 ]; then
    log "$ENV_FILE exists: reusing it (--force rewrites it and keeps the generated secrets)."
    collect_config reuse
    append_missing
  else
    if [ -f "$ENV_FILE" ]; then
      cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
      log "Saved the old $ENV_FILE as $ENV_FILE.bak.*"
    fi
    collect_config new
    write_env
  fi
  preflight_ports
  apply_stack
  if [ "$NO_START" = 0 ]; then
    activate_all
    next_steps
  fi
}

cmd_apply() {
  require_env; preflight_docker; collect_config reuse
  apply_stack
}

cmd_upgrade() {
  require_env; preflight_docker
  local previous
  previous=$(env_get IMAGE_TAG "$ENV_FILE")
  collect_config reuse
  if [ "$IMAGE_TAG" != "$previous" ]; then set_env_value IMAGE_TAG "$IMAGE_TAG"; fi
  if [ "$NO_BACKUP" = 0 ]; then cmd_backup || warn "Pre-upgrade backup failed; continuing."; fi
  apply_stack
  log "Upgraded to tag '$IMAGE_TAG' (previous: '${previous:-unknown}'). Roll back with: ./install.sh upgrade --tag ${previous:-<previous>} --no-backup"
}

cmd_activate() {
  require_env; collect_config reuse
  if [ -z "$LICENSE_CLINIC$LICENSE_LABORATORY$LICENSE_PHARMACY" ]; then die "Give --license-token/--license-file (or --lab-... / --pharmacy-...)."; fi
  activate_all
  if [ "$ACTIVATION_PENDING" = 1 ]; then exit 1; fi
}

cmd_backup() {
  require_env
  log "Backing up now"
  dc exec -T backup /bin/bash /backup/backup.sh once
}

cmd_restore() {
  require_env; collect_config reuse
  [ -n "$RESTORE_FILE" ] || die "Usage: ./install.sh restore <backup file>"
  [ -f "$RESTORE_FILE" ] || die "File not found: $RESTORE_FILE"
  local base db svc stop="" abs vols=""
  base=$(basename "$RESTORE_FILE")
  abs=$(cd "$(dirname "$RESTORE_FILE")" && pwd)/$base
  for svc in $(enabled_services); do
    case "$svc" in postgres) ;; *) stop="$stop $svc" ;; esac
  done
  case "$base" in
    *.dump)
      db=${base%%.*}
      warn "This REPLACES the contents of database $db with $base. Services are stopped while it runs."
      if [ "$ASSUME_YES" = 0 ] && ! ask_yn "Continue?" n; then die "Cancelled."; fi
      # shellcheck disable=SC2086
      dc stop $stop
      dc exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$db" --clean --if-exists --no-owner < "$RESTORE_FILE" \
        || warn "pg_restore reported problems (often harmless 'does not exist' notices): check the output above."
      ;;
    *.tar.gz)
      warn "This OVERWRITES the clinical records and JWT key volumes with the contents of $base. Services are stopped while it runs."
      if [ "$ASSUME_YES" = 0 ] && ! ask_yn "Continue?" n; then die "Cancelled."; fi
      # shellcheck disable=SC2086
      dc stop $stop
      vols="-v clinicez-edge_clinic-records:/data/clinic-records"
      for svc in clinic-api billing-api laboratory-api pharmacy-api organization-api; do
        vols="$vols -v clinicez-edge_${svc}-keys:/data/keys/$svc"
      done
      # shellcheck disable=SC2086
      docker run --rm -i $vols postgres:16 tar -xzf - -C /data < "$abs"
      ;;
    *) die "Unknown backup file type (expected <DB>.<time>.dump or files.<time>.tar.gz)." ;;
  esac
  dc up -d
  wait_healthy 300 || true
  log "Restore finished."
}

cmd_status() {
  require_env; collect_config reuse
  dc ps
  echo
  local body
  body=$(curl -fsS --max-time 10 "http://127.0.0.1:$CLINIC_WEB_PORT/api/v1/license" 2>/dev/null || true)
  if [ -n "$body" ]; then echo "Clinic license: $body"; else echo "Clinic license: API not reachable"; fi
  if has_profile local-hub && [ "$UPSTREAM_ENABLED" = true ]; then
    echo -n "Hub outbound queue (messages waiting for the cloud): "
    dc exec -T postgres psql -U "$POSTGRES_USER" -d CLINICEZ_INTEROP_HUB_LOCAL_DB -tAc 'SELECT count(*) FROM interop_hub."Outbound"' 2>/dev/null || echo "n/a (see README)"
  elif has_profile local-hub; then
    echo "Hub upstream: disabled (UPSTREAM_ENABLED=false, air-gapped): same-cell traffic only."
  fi
}

cmd_render() { require_env; collect_config reuse; render_hub_bootstrap; }

case "$COMMAND" in
  install)  cmd_install ;;
  apply)    cmd_apply ;;
  upgrade)  cmd_upgrade ;;
  activate) cmd_activate ;;
  backup)   preflight_docker; cmd_backup ;;
  restore)  preflight_docker; cmd_restore ;;
  status)   cmd_status ;;
  render)   cmd_render ;;
  *)        die "Unknown command: $COMMAND" ;;
esac
