#!/usr/bin/env bash
# Clinic EZ Local Full-Stack Orchestrator (Docker Desktop + Local Web Frontends)
# Secret-safe: reads dev keys dynamically from gitignored configuration.txt and writes
# runtime env files strictly outside git under $CLINICEZ_LOCAL_ENV_DIR (chmod 600).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_DIR="${CLINICEZ_LOCAL_ENV_DIR:-/tmp/clinicez-local-stack}"
DOCKER_NET="${CLINICEZ_LOCAL_NETWORK:-v1-sync-api_default}"
PG_CONTAINER="clinicez-local-pg17"
MINIO_CONTAINER="clinicez-local-minio"
MAILPIT_CONTAINER="clinicez-local-mailpit"
HUB_CONTAINER="clinicez-local-interop-hub"
PORTAL_CONTAINER="clinicez-local-portal-api"
CLINIC_CONTAINER="clinicez-local-clinic-api"
PATIENT_CONTAINER="clinicez-local-patient-api"

PG_USER="${CLINICEZ_LOCAL_PG_USER:-clinicez_local}"
PG_PASS="${CLINICEZ_LOCAL_PG_PASS:-clinicez_local_dev_password}"
PG_PORT="${CLINICEZ_LOCAL_PG_PORT:-5439}"
PG_VOL="v1-sync-api_clinicez_local_pg17_data"
MINIO_VOL="v1-sync-api_clinicez_local_minio_data"

find_config_file() {
  if [[ -n "${CLINICEZ_CONFIG_FILE:-}" && -f "${CLINICEZ_CONFIG_FILE}" ]]; then
    echo "${CLINICEZ_CONFIG_FILE}"
    return 0
  fi
  if [[ -f "${REPO_ROOT}/configuration.txt" ]]; then
    echo "${REPO_ROOT}/configuration.txt"
    return 0
  fi
  # Fallback to main worktree if invoked inside a secondary git worktree
  local wt
  while IFS= read -r wt; do
    if [[ -f "${wt}/configuration.txt" ]]; then
      echo "${wt}/configuration.txt"
      return 0
    fi
  done < <(git -C "${REPO_ROOT}" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')
  return 1
}

read_cfg_key() {
  local key="$1"
  local cfg_file="$2"
  [[ -n "${cfg_file}" && -f "${cfg_file}" ]] || return 0
  python3 - "$key" "$cfg_file" <<'PY'
import re, sys
key, path = sys.argv[1], sys.argv[2]
pat = re.compile(r"^\s*(?:export\s+)?" + re.escape(key) + r"\s*[:=]\s*(.*)$")
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = pat.match(line)
        if m:
            val = m.group(1).strip()
            if (len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"')):
                val = val[1:-1]
            if val:
                print(val)
                break
PY
}

read_clerk_pk() {
  local cfg_file="${1:-}"
  local pk=""
  if [[ -n "${VITE_CLERK_PUBLISHABLE_KEY:-}" ]]; then
    echo "${VITE_CLERK_PUBLISHABLE_KEY}"
    return 0
  fi
  if [[ -n "${cfg_file}" ]]; then
    pk="$(read_cfg_key "VITE_CLERK_PUBLISHABLE_KEY" "${cfg_file}")"
    [[ -z "$pk" ]] && pk="$(read_cfg_key "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "${cfg_file}")"
    [[ -z "$pk" ]] && pk="$(read_cfg_key "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" "${cfg_file}")"
  fi
  if [[ -z "$pk" ]]; then
    local wt
    while IFS= read -r wt; do
      for candidate in \
        "${wt}/apps/admin-web/.env.local" \
        "${wt}/apps/portal-web/.env.local" \
        "${wt}/apps/patient-app/.env.local"; do
        if [[ -f "$candidate" ]]; then
          pk="$(grep -E '^(VITE|NEXT_PUBLIC|EXPO_PUBLIC)_CLERK_PUBLISHABLE_KEY=' "$candidate" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
          [[ -n "$pk" ]] && break 2
        fi
      done
    done < <(git -C "${REPO_ROOT}" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')
  fi
  echo "$pk"
}

ensure_network() {
  if ! docker network inspect "${DOCKER_NET}" >/dev/null 2>&1; then
    docker network create "${DOCKER_NET}" >/dev/null
    echo "Created Docker network: ${DOCKER_NET}"
  fi
}

generate_env_files() {
  mkdir -p "${ENV_DIR}"
  chmod 700 "${ENV_DIR}"
  local cfg_file=""
  cfg_file="$(find_config_file || true)"

  local clerk_sk clerk_auth lic_priv lic_pub claim_key xendit_sk xendit_cb
  local clinic_jwt clinic_enc clinic_doc
  local portal_hub_id portal_hub_sec clinic_hub_id clinic_hub_sec patient_hub_id patient_hub_sec

  clerk_sk="${PORTAL_CLERK_SECRET_KEY:-$(read_cfg_key "PORTAL_CLERK_SECRET_KEY" "${cfg_file}")}"
  [[ -z "$clerk_sk" ]] && clerk_sk="$(read_cfg_key "CLERK_SECRET_KEY" "${cfg_file}")"
  clerk_auth="${PATIENT_CLERK_AUTHORITY:-$(read_cfg_key "PATIENT_CLERK_AUTHORITY" "${cfg_file}")}"
  lic_priv="${FACILITY_LICENSE_PRIVATE_KEY:-$(read_cfg_key "FACILITY_LICENSE_PRIVATE_KEY" "${cfg_file}")}"
  lic_pub="${FACILITY_LICENSE_PUBLIC_KEY:-$(read_cfg_key "FACILITY_LICENSE_PUBLIC_KEY" "${cfg_file}")}"
  claim_key="${CLAIM_TOKEN_SIGNING_KEY:-$(read_cfg_key "CLAIM_TOKEN_SIGNING_KEY" "${cfg_file}")}"
  [[ -z "$claim_key" ]] && claim_key="local-dev-claim-token-signing-key-32bytes-minimum-2026"
  xendit_sk="${PORTAL_XENDIT_SECRET_KEY:-$(read_cfg_key "PORTAL_XENDIT_SECRET_KEY" "${cfg_file}")}"
  [[ -z "$xendit_sk" ]] && xendit_sk="xnd_development_local_placeholder"
  xendit_cb="${PORTAL_XENDIT_CALLBACK_TOKEN:-$(read_cfg_key "PORTAL_XENDIT_CALLBACK_TOKEN" "${cfg_file}")}"
  [[ -z "$xendit_cb" ]] && xendit_cb="local-dev-xendit-callback-token"

  clinic_jwt="${CLINIC_JWT_SIGNING_KEY:-$(read_cfg_key "CLINIC_JWT_SIGNING_KEY" "${cfg_file}")}"
  [[ -z "$clinic_jwt" ]] && clinic_jwt="local-dev-clinic-jwt-signing-key-at-least-32-chars-2026"
  clinic_enc="${CLINIC_ENCRYPTION_MASTER_SECRET:-$(read_cfg_key "CLINIC_ENCRYPTION_MASTER_SECRET" "${cfg_file}")}"
  [[ -z "$clinic_enc" ]] && clinic_enc="local-dev-clinic-encryption-master-secret-32chars-2026"
  clinic_doc="${CLINIC_DOCUMENT_SIGNING_KEY:-$(read_cfg_key "CLINIC_DOCUMENT_SIGNING_KEY" "${cfg_file}")}"
  [[ -z "$clinic_doc" ]] && clinic_doc="local-dev-clinic-doc-signing-key-32chars-minimum-2026"

  portal_hub_id="${PORTAL_HUB_CLIENT_ID:-$(read_cfg_key "PORTAL_HUB_CLIENT_ID" "${cfg_file}")}"
  [[ -z "$portal_hub_id" ]] && portal_hub_id="portal"
  portal_hub_sec="${PORTAL_HUB_CLIENT_SECRET:-$(read_cfg_key "PORTAL_HUB_CLIENT_SECRET" "${cfg_file}")}"
  [[ -z "$portal_hub_sec" ]] && portal_hub_sec="local-dev-portal-hub-secret-32chars-2026"

  clinic_hub_id="${CLINIC_HUB_CLIENT_ID:-$(read_cfg_key "CLINIC_HUB_CLIENT_ID" "${cfg_file}")}"
  [[ -z "$clinic_hub_id" ]] && clinic_hub_id="clinic"
  clinic_hub_sec="${CLINIC_HUB_CLIENT_SECRET:-$(read_cfg_key "CLINIC_HUB_CLIENT_SECRET" "${cfg_file}")}"
  [[ -z "$clinic_hub_sec" ]] && clinic_hub_sec="local-dev-clinic-hub-secret-32chars-2026"

  patient_hub_id="${PATIENT_HUB_CLIENT_ID:-$(read_cfg_key "PATIENT_HUB_CLIENT_ID" "${cfg_file}")}"
  [[ -z "$patient_hub_id" ]] && patient_hub_id="patient"
  patient_hub_sec="${PATIENT_HUB_CLIENT_SECRET:-$(read_cfg_key "PATIENT_HUB_CLIENT_SECRET" "${cfg_file}")}"
  [[ -z "$patient_hub_sec" ]] && patient_hub_sec="local-dev-patient-hub-secret-32chars-2026"

  cat > "${ENV_DIR}/interop-hub.local.env" <<EOF
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:8080
ConnectionStrings__DefaultConnection=Host=${PG_CONTAINER};Port=5432;Database=CLINICEZ-INTEROP_DB;Username=${PG_USER};Password=${PG_PASS}
Hub__Database__AutoMigrate=true
Hub__Signing__Required=false
Hub__Auth__MinBootstrapSecretLength=16
EOF

  cat > "${ENV_DIR}/portal-api.local.env" <<EOF
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:8080
ConnectionStrings__DefaultConnection=Host=${PG_CONTAINER};Port=5432;Database=CLINICEZ-PORTAL_DB;Username=${PG_USER};Password=${PG_PASS}
FrontendBaseUrl=http://localhost:3000
AdminBaseUrl=http://localhost:3001
Hub__PublicUrl=http://localhost:5290
Services__PatientApiUrl=http://${PATIENT_CONTAINER}:8080
Smtp__Mode=Smtp
Hangfire__DashboardPassword=devlocal
Clerk__Authority=${clerk_auth}
Clerk__SecretKey=${clerk_sk}
FacilityLicense__PrivateKeyPem=${lic_priv}
FacilityLicense__PublicKeyPem=${lic_pub}
ClaimToken__SigningKey=${claim_key}
Xendit__SecretKey=${xendit_sk}
Xendit__CallbackToken=${xendit_cb}
Messaging__Transport=Hub
Messaging__HubUrl=http://${HUB_CONTAINER}:8080
Messaging__Service=portal
Messaging__ClientId=${portal_hub_id}
Messaging__ClientSecret=${portal_hub_sec}
EOF

  cat > "${ENV_DIR}/clinic-api.local.env" <<EOF
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:8080
ConnectionStrings__DefaultConnection=Host=${PG_CONTAINER};Port=5432;Database=CLINICEZ-CLINIC_DB;Username=${PG_USER};Password=${PG_PASS}
ClinicApp__BaseUrl=http://localhost:8081
Clinic__PortalBaseUrl=http://localhost:3000
Verification__BaseUrl=http://localhost:3000
Facility__BaseDomain=localhost
Cors__AllowAnyOrigin=true
Hangfire__DashboardPassword=devlocal
Jwt__SigningKey=${clinic_jwt}
ClinicEncryption__MasterSecret=${clinic_enc}
Documents__SigningKey=${clinic_doc}
FacilityLicense__PublicKeyPem=${lic_pub}
Storage__Provider=Local
Storage__EnableLocalFallback=true
Storage__BasePath=/tmp/clinicez-clinic-storage
Messaging__Transport=Hub
Messaging__HubUrl=http://${HUB_CONTAINER}:8080
Messaging__Service=clinic
Messaging__ClientId=${clinic_hub_id}
Messaging__ClientSecret=${clinic_hub_sec}
EOF

  cat > "${ENV_DIR}/patient-api.local.env" <<EOF
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:8080
ConnectionStrings__DefaultConnection=Host=${PG_CONTAINER};Port=5432;Database=CLINICEZ-PATIENT_DB;Username=${PG_USER};Password=${PG_PASS}
Clerk__Authority=${clerk_auth}
Messaging__Transport=Hub
Messaging__HubUrl=http://${HUB_CONTAINER}:8080
Messaging__Service=patient
Messaging__ClientId=${patient_hub_id}
Messaging__ClientSecret=${patient_hub_sec}
EOF

  chmod 600 "${ENV_DIR}"/*.local.env
  echo "Generated secret-safe local env files in ${ENV_DIR} (source: ${cfg_file:-defaults})"
}

start_infra() {
  ensure_network

  if ! docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
    if docker ps -a --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
      docker start "${PG_CONTAINER}" >/dev/null
    else
      docker run -d --name "${PG_CONTAINER}" --network "${DOCKER_NET}" \
        -p "127.0.0.1:${PG_PORT}:5432" \
        -e "POSTGRES_USER=${PG_USER}" \
        -e "POSTGRES_PASSWORD=${PG_PASS}" \
        -e "POSTGRES_DB=postgres" \
        -v "${PG_VOL}:/var/lib/postgresql/data" \
        -v "${REPO_ROOT}/deploy/v1-sync-api/init-local-dbs.sql:/docker-entrypoint-initdb.d/01-init-local-dbs.sql:ro" \
        pgvector/pgvector:pg17 >/dev/null
    fi
    echo "Started ${PG_CONTAINER} on 127.0.0.1:${PG_PORT}"
  fi

  for i in $(seq 1 30); do
    if docker exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker ps --format '{{.Names}}' | grep -qx "${MINIO_CONTAINER}"; then
    if docker ps -a --format '{{.Names}}' | grep -qx "${MINIO_CONTAINER}"; then
      docker start "${MINIO_CONTAINER}" >/dev/null
    else
      docker run -d --name "${MINIO_CONTAINER}" --network "${DOCKER_NET}" \
        -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
        -e MINIO_ROOT_USER=clinicez_minio \
        -e MINIO_ROOT_PASSWORD=clinicez_minio_local_pass \
        -v "${MINIO_VOL}:/data" \
        ghcr.io/coollabsio/minio:latest server /data --console-address :9001 >/dev/null
    fi
    echo "Started ${MINIO_CONTAINER} on 127.0.0.1:9000-9001"
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx "${MAILPIT_CONTAINER}"; then
    if docker ps -a --format '{{.Names}}' | grep -qx "${MAILPIT_CONTAINER}"; then
      docker start "${MAILPIT_CONTAINER}" >/dev/null
    else
      docker run -d --name "${MAILPIT_CONTAINER}" --network "${DOCKER_NET}" \
        -p 127.0.0.1:8025:8025 -p 127.0.0.1:2525:2525 \
        -e MP_SMTP_BIND_ADDR=0.0.0.0:2525 \
        axllent/mailpit:latest >/dev/null
    fi
    echo "Started ${MAILPIT_CONTAINER} (UI http://127.0.0.1:8025, SMTP :2525)"
  fi
}

build_service_image() {
  local svc="$1"
  case "$svc" in
    interop-hub) docker build -f "${REPO_ROOT}/services/interop-hub/Dockerfile" -t clinicez-local-interop-hub:latest "${REPO_ROOT}" ;;
    portal-api)  docker build -f "${REPO_ROOT}/services/portal-api/Dockerfile" -t clinicez-local-portal-api:latest "${REPO_ROOT}" ;;
    clinic-api)  docker build -f "${REPO_ROOT}/services/clinic-api/Dockerfile" -t clinicez-local-clinic-api:latest "${REPO_ROOT}" ;;
    patient-api) docker build -f "${REPO_ROOT}/services/patient-api/Dockerfile" -t clinicez-local-patient-api:latest "${REPO_ROOT}" ;;
    *) echo "Unknown service: $svc (expected interop-hub|portal-api|clinic-api|patient-api)" >&2; exit 1 ;;
  esac
}

recreate_service_container() {
  local svc="$1"
  local cname image port env_file
  case "$svc" in
    interop-hub) cname="${HUB_CONTAINER}";     image="clinicez-local-interop-hub:latest"; port="5290"; env_file="${ENV_DIR}/interop-hub.local.env" ;;
    portal-api)  cname="${PORTAL_CONTAINER}";  image="clinicez-local-portal-api:latest";  port="5000"; env_file="${ENV_DIR}/portal-api.local.env" ;;
    clinic-api)  cname="${CLINIC_CONTAINER}";  image="clinicez-local-clinic-api:latest";  port="5245"; env_file="${ENV_DIR}/clinic-api.local.env" ;;
    patient-api) cname="${PATIENT_CONTAINER}"; image="clinicez-local-patient-api:latest"; port="5100"; env_file="${ENV_DIR}/patient-api.local.env" ;;
    *) echo "Unknown service: $svc" >&2; exit 1 ;;
  esac

  if ! docker image inspect "${image}" >/dev/null 2>&1; then
    echo "Image ${image} not found locally; building..."
    build_service_image "${svc}"
  fi

  docker rm -f "${cname}" >/dev/null 2>&1 || true
  docker run -d --name "${cname}" --network "${DOCKER_NET}" \
    -p "127.0.0.1:${port}:8080" \
    --env-file "${env_file}" \
    "${image}" >/dev/null
  echo "Started ${cname} -> http://127.0.0.1:${port}"
}

configure_mailpit_in_portal_db() {
  docker exec "${PG_CONTAINER}" psql -U "${PG_USER}" -d "CLINICEZ-PORTAL_DB" -v ON_ERROR_STOP=0 -q <<'SQL' >/dev/null 2>&1 || true
UPDATE "SystemSettings" SET "Value" = 'clinicez-local-mailpit', "UpdatedAt" = NOW(), "UpdatedBy" = 'local-stack' WHERE "Key" = 'Mailer:SmtpHost';
UPDATE "SystemSettings" SET "Value" = '2525', "UpdatedAt" = NOW(), "UpdatedBy" = 'local-stack' WHERE "Key" = 'Mailer:SmtpPort';
UPDATE "SystemSettings" SET "Value" = 'Auto', "UpdatedAt" = NOW(), "UpdatedBy" = 'local-stack' WHERE "Key" = 'Mailer:SmtpSecurity';
SQL
}

wait_healthy() {
  local svc="$1" url="$2"
  for i in $(seq 1 30); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo 000)"
    if [[ "$code" == "200" ]]; then
      printf "  %-14s %s -> HTTP %s\n" "$svc" "$url" "$code"
      return 0
    fi
    sleep 1
  done
  printf "  %-14s %s -> FAILED (not 200 after 30s)\n" "$svc" "$url" >&2
  return 1
}

cmd_health() {
  echo "=== Local Stack Health ==="
  for entry in \
    "interop-hub|http://127.0.0.1:5290/health" \
    "portal-api|http://127.0.0.1:5000/api/v1/contact/info" \
    "clinic-api|http://127.0.0.1:5245/health" \
    "patient-api|http://127.0.0.1:5100/api/v1/directory/search?q=health" \
    "mailpit|http://127.0.0.1:8025/api/v1/info" \
    "portal-web|http://127.0.0.1:3000/verify/practitioner" \
    "admin-web|http://127.0.0.1:3001/" \
    "clinic-app|http://127.0.0.1:8081/" \
    "patient-app|http://127.0.0.1:8082/"; do
    IFS='|' read -r name url <<< "$entry"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || echo 000)"
    printf "  %-14s %-45s HTTP %s\n" "$name" "$url" "$code"
  done
}

cmd_status() {
  echo "=== Docker Containers ==="
  docker ps -a --filter "name=clinicez-local-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  echo ""
  echo "=== Local Frontend Port Listeners (3000, 3001, 8081, 8082) ==="
  lsof -iTCP:3000,3001,8081,8082 -sTCP:LISTEN -n -P 2>/dev/null || echo "  (none listening)"
  echo ""
  cmd_health
}

cmd_up() {
  start_infra
  generate_env_files
  recreate_service_container interop-hub
  wait_healthy interop-hub "http://127.0.0.1:5290/health"
  recreate_service_container portal-api
  recreate_service_container clinic-api
  recreate_service_container patient-api
  wait_healthy portal-api  "http://127.0.0.1:5000/api/v1/contact/info"
  wait_healthy clinic-api  "http://127.0.0.1:5245/health"
  wait_healthy patient-api "http://127.0.0.1:5100/api/v1/directory/search?q=health"
  configure_mailpit_in_portal_db
  echo "Backend stack is healthy and Portal API mailer is pointed at Mailpit (clinicez-local-mailpit:2525)."
}

cmd_rebuild() {
  shift || true
  local targets=("$@")
  if [[ ${#targets[@]} -eq 0 || "${targets[0]}" == "all" ]]; then
    targets=(interop-hub portal-api clinic-api patient-api)
  fi
  start_infra
  [[ -f "${ENV_DIR}/portal-api.local.env" ]] || generate_env_files
  for svc in "${targets[@]}"; do
    echo "=== Building ${svc} ==="
    build_service_image "${svc}"
    recreate_service_container "${svc}"
  done
  for svc in "${targets[@]}"; do
    case "$svc" in
      interop-hub) wait_healthy interop-hub "http://127.0.0.1:5290/health" ;;
      portal-api)  wait_healthy portal-api  "http://127.0.0.1:5000/api/v1/contact/info"; configure_mailpit_in_portal_db ;;
      clinic-api)  wait_healthy clinic-api  "http://127.0.0.1:5245/health" ;;
      patient-api) wait_healthy patient-api "http://127.0.0.1:5100/api/v1/directory/search?q=health" ;;
    esac
  done
}

cmd_start_frontend() {
  local app="${2:-}"
  local cfg_file=""
  cfg_file="$(find_config_file || true)"
  local pk sk clear_flag=""
  pk="$(read_clerk_pk "${cfg_file}")"
  sk="${CLERK_SECRET_KEY:-$(read_cfg_key "PORTAL_CLERK_SECRET_KEY" "${cfg_file}")}"
  [[ -z "$sk" ]] && sk="$(read_cfg_key "CLERK_SECRET_KEY" "${cfg_file}")"
  [[ "${EXPO_CLEAR:-0}" == "1" ]] && clear_flag="--clear"

  case "$app" in
    portal-web)
      cd "${REPO_ROOT}/apps/portal-web"
      exec env \
        NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1 \
        NEXT_PUBLIC_PORTAL_API_URL=http://localhost:5000/api/v1 \
        PORTAL_API_URL=http://localhost:5000/api/v1 \
        NEXT_PUBLIC_PATIENT_API_URL=http://localhost:5100/api/v1 \
        NEXT_PUBLIC_BASE_DOMAIN=localhost \
        NEXT_PUBLIC_PORTAL_URL=http://localhost:3000 \
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${pk}" \
        CLERK_SECRET_KEY="${sk}" \
        NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in \
        NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up \
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/sync-auth \
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/sync-auth \
        bun run dev -- -p 3000
      ;;
    admin-web)
      cd "${REPO_ROOT}/apps/admin-web"
      exec env \
        VITE_PORTAL_API_URL=http://localhost:5000/api/v1 \
        VITE_CLERK_PUBLISHABLE_KEY="${pk}" \
        bun run dev -- --port 3001 --host 127.0.0.1
      ;;
    clinic-app)
      cd "${REPO_ROOT}/apps/clinic-app"
      exec env \
        EXPO_PUBLIC_CLINIC_API_URL=http://localhost:5245/api/v1 \
        EXPO_PUBLIC_ENABLE_COMMS=false \
        EXPO_PUBLIC_BASE_DOMAIN=localhost \
        EXPO_PUBLIC_PORTAL_URL=http://localhost:3000 \
        EXPO_PUBLIC_SERVICE_SUBDOMAIN=clinic \
        EXPO_PUBLIC_SERVICE_SUBDOMAINS=clinic,lab,pharmacy,org \
        bunx expo start --web --port 8081 ${clear_flag} --non-interactive
      ;;
    patient-app)
      cd "${REPO_ROOT}/apps/patient-app"
      exec env \
        EXPO_PUBLIC_API_URL=http://localhost:5100/api/v1 \
        EXPO_PUBLIC_PORTAL_URL=http://localhost:3000 \
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="${pk}" \
        APP_VARIANT=development \
        bunx expo start --web --port 8082 ${clear_flag} --non-interactive
      ;;
    *)
      echo "Usage: $0 start-frontend <portal-web|admin-web|clinic-app|patient-app>" >&2
      exit 1
      ;;
  esac
}

cmd_mailpit() {
  curl -s "http://127.0.0.1:8025/api/v1/messages" | python3 -c '
import sys, json
d = json.load(sys.stdin)
print(f"Total captured emails: {d.get(\"total\", 0)}")
for m in d.get("messages", []):
    to = ", ".join(x.get("Address", "") for x in m.get("To", []))
    print(f"  - [{m.get(\"Created\",\"\")}] To: {to} | Subject: {m.get(\"Subject\",\"\")}")
'
}

cmd_logs() {
  local svc="${2:-portal-api}"
  local cname="clinicez-local-${svc}"
  docker logs --tail 80 "${cname}"
}

cmd_down() {
  docker rm -f \
    "${PORTAL_CONTAINER}" "${CLINIC_CONTAINER}" "${PATIENT_CONTAINER}" \
    "${HUB_CONTAINER}" "${MAILPIT_CONTAINER}" "${MINIO_CONTAINER}" "${PG_CONTAINER}" \
    >/dev/null 2>&1 || true
  echo "Stopped and removed local containers (Docker volumes preserved)."
}

cmd_reset_data() {
  if [[ "${2:-}" != "--yes" ]]; then
    echo "Refusing destructive reset without --yes. Run: $0 reset-data --yes" >&2
    exit 1
  fi
  cmd_down
  docker volume rm -f "${PG_VOL}" "${MINIO_VOL}" >/dev/null 2>&1 || true
  echo "Wiped local Postgres and MinIO Docker volumes."
}

case "${1:-status}" in
  status)         cmd_status ;;
  health)         cmd_health ;;
  env)            generate_env_files ;;
  up)             cmd_up ;;
  rebuild)        cmd_rebuild "$@" ;;
  start-frontend) cmd_start_frontend "$@" ;;
  mailpit)        cmd_mailpit ;;
  logs)           cmd_logs "$@" ;;
  down)           cmd_down ;;
  reset-data)     cmd_reset_data "$@" ;;
  *)
    echo "Usage: $0 {status|health|env|up|rebuild [svc...]|start-frontend <app>|mailpit|logs <svc>|down|reset-data --yes}" >&2
    exit 1
    ;;
esac
