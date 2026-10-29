#!/usr/bin/env bash
# scripts/reset-admin-credentials.sh
# ClinicEZ Administrator Account Recovery Tool
# Safely clears administrator lockouts or generates cryptographically secure
# one-time invitation links without writing manual SQL.
#
# Supported environments:
#   - Production VPS (130.94.50.27) Docker postgres container
#   - Local development host psql or Docker container

set -euo pipefail

# Default configuration
ACTION="generate-invite"
EMAIL=""
APP_URL="${APP_URL:-http://localhost:8081}"
DB_USER="${POSTGRES_USER:-${DB_USER:-db_admin_node}}"
DB_HOST="${POSTGRES_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${DB_PORT:-5432}}"
DB_NAME="${DB_NAME:-}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-postgres}"
USE_DOCKER="${USE_DOCKER:-}"

show_help() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

ClinicEZ Administrator Account Recovery Operational Tool.
Safely clear lockouts or generate one-time invitation links for clinic administrators.

Options:
  --action <action>       Action to perform: generate-invite (default), clear-lockout, list
  --generate-invite       Shortcut for --action generate-invite
  --clear-lockout         Shortcut for --action clear-lockout
  --list                  Shortcut for --action list
  --email <email>         Target administrator email (required if multiple admins exist)
  --app-url <url>         Workstation base URL for invitation links (default: http://localhost:8081)
  --db <name>             Target database name (auto-detects CLINICEZ-CLINIC_DB / CLINICEZ_CLINIC_DB)
  --use-docker [bool]     Force Docker container execution (auto-detected if container is running)
  --container <name>      Docker container name (default: postgres)
  --user <user>           PostgreSQL user (default: db_admin_node or \$POSTGRES_USER)
  --host <host>           PostgreSQL host (default: localhost or \$POSTGRES_HOST)
  --port <port>           PostgreSQL port (default: 5432 or \$POSTGRES_PORT)
  -h, --help              Display this help message and exit

Environment Variables:
  POSTGRES_USER / DB_USER        Database user (default: db_admin_node)
  POSTGRES_HOST / DB_HOST        Database host (default: localhost)
  POSTGRES_PORT / DB_PORT        Database port (default: 5432)
  POSTGRES_PASSWORD / PGPASSWORD Database password
  APP_URL                        Workstation base URL (default: http://localhost:8081)
  DOCKER_CONTAINER               PostgreSQL container name (default: postgres)
  USE_DOCKER                     Force Docker ("true") or host psql ("false")

Examples:
  # 1. List all clinic administrator accounts
  ./scripts/reset-admin-credentials.sh --list

  # 2. Generate a 7-day one-time invitation link for default/single administrator
  ./scripts/reset-admin-credentials.sh

  # 3. Generate an invitation link for a specific administrator email
  ./scripts/reset-admin-credentials.sh --email admin@clinic.ph

  # 4. Clear account lockout and failed attempts counter without resetting password
  ./scripts/reset-admin-credentials.sh --clear-lockout --email admin@clinic.ph

  # 5. Specify custom workstation URL for invitation link
  ./scripts/reset-admin-credentials.sh --email admin@clinic.ph --app-url https://clinic.example.com
EOF
}

# Parse command-line arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --help|-h)
            show_help
            exit 0
            ;;
        --action)
            ACTION="${2:-}"
            shift 2
            ;;
        --action=*)
            ACTION="${1#*=}"
            shift
            ;;
        --clear-lockout)
            ACTION="clear-lockout"
            shift
            ;;
        --generate-invite)
            ACTION="generate-invite"
            shift
            ;;
        --list)
            ACTION="list"
            shift
            ;;
        --email)
            EMAIL="${2:-}"
            shift 2
            ;;
        --email=*)
            EMAIL="${1#*=}"
            shift
            ;;
        --app-url)
            APP_URL="${2:-}"
            shift 2
            ;;
        --app-url=*)
            APP_URL="${1#*=}"
            shift
            ;;
        --db)
            DB_NAME="${2:-}"
            shift 2
            ;;
        --db=*)
            DB_NAME="${1#*=}"
            shift
            ;;
        --container)
            DOCKER_CONTAINER="${2:-}"
            shift 2
            ;;
        --container=*)
            DOCKER_CONTAINER="${1#*=}"
            shift
            ;;
        --use-docker)
            if [ $# -gt 1 ] && [[ "$2" =~ ^(true|false)$ ]]; then
                USE_DOCKER="$2"
                shift 2
            else
                USE_DOCKER="true"
                shift
            fi
            ;;
        --use-docker=*)
            USE_DOCKER="${1#*=}"
            shift
            ;;
        --user)
            DB_USER="${2:-}"
            shift 2
            ;;
        --user=*)
            DB_USER="${1#*=}"
            shift
            ;;
        --host)
            DB_HOST="${2:-}"
            shift 2
            ;;
        --host=*)
            DB_HOST="${1#*=}"
            shift
            ;;
        --port)
            DB_PORT="${2:-}"
            shift 2
            ;;
        --port=*)
            DB_PORT="${1#*=}"
            shift
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            echo "Run '$(basename "$0") --help' for usage." >&2
            exit 1
            ;;
    esac
done

# Validate action
ACTION="$(echo "$ACTION" | tr '[:upper:]' '[:lower:]')"
case "$ACTION" in
    generate-invite|clear-lockout|list) ;;
    *)
        echo "Error: Invalid action '$ACTION'. Valid options: generate-invite, clear-lockout, list" >&2
        exit 1
        ;;
esac

# Auto-detect execution mode (Docker vs Host psql) if not explicitly configured
if [ -z "$USE_DOCKER" ]; then
    if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq "^${DOCKER_CONTAINER}\$"; then
        USE_DOCKER="true"
    else
        USE_DOCKER="false"
    fi
fi

# Verify prerequisites for chosen execution mode
if [ "$USE_DOCKER" = "true" ]; then
    if ! command -v docker >/dev/null 2>&1; then
        echo "Error: Docker command not found in PATH." >&2
        exit 1
    fi
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq "^${DOCKER_CONTAINER}\$"; then
        echo "Error: Docker container '${DOCKER_CONTAINER}' is not running." >&2
        exit 1
    fi
else
    if ! command -v psql >/dev/null 2>&1; then
        echo "Error: 'psql' client not found in PATH and Docker container '${DOCKER_CONTAINER}' is not running." >&2
        echo "Please install PostgreSQL client tools or start the Docker container '${DOCKER_CONTAINER}'." >&2
        exit 1
    fi
fi

# Query execution helpers
run_psql_raw() {
    local db="$1"
    local sql="$2"
    if [ "$USE_DOCKER" = "true" ]; then
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -q -t -A -F '|' -c "$sql"
    else
        PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -q -t -A -F '|' -c "$sql"
    fi
}

run_psql_table() {
    local db="$1"
    local sql="$2"
    if [ "$USE_DOCKER" = "true" ]; then
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -c "$sql"
    else
        PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -c "$sql"
    fi
}

test_db_connect() {
    local db="$1"
    if [ "$USE_DOCKER" = "true" ]; then
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$db" -q -t -A -c "SELECT 1" 2>/dev/null | grep -q 1
    else
        PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -q -t -A -c "SELECT 1" 2>/dev/null | grep -q 1
    fi
}

# Auto-resolve target database name
if [ -z "$DB_NAME" ]; then
    for candidate in "CLINICEZ-CLINIC_DB" "CLINICEZ_CLINIC_DB"; do
        if test_db_connect "$candidate"; then
            DB_NAME="$candidate"
            break
        fi
    done
    if [ -z "$DB_NAME" ]; then
        DB_NAME="CLINICEZ-CLINIC_DB"
    fi
fi

# Cryptographic token generator (64 hex characters = 32 bytes)
generate_token() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    elif [ -r /dev/urandom ]; then
        od -vN 32 -An -tx1 /dev/urandom | tr -d " \n"
    else
        echo "Error: Neither openssl nor /dev/urandom is available for secure token generation." >&2
        exit 1
    fi
}

# --- Action: List ---
if [ "$ACTION" = "list" ]; then
    echo "======================================================================"
    echo "  ClinicEZ Administrator Accounts (Database: $DB_NAME)"
    echo "======================================================================"

    LIST_SQL="SELECT 
    s.\"Id\" AS \"ID\",
    TRIM(COALESCE(s.\"FirstName\", '') || ' ' || COALESCE(s.\"LastName\", '')) AS \"Name\",
    s.\"Email\" AS \"Email\",
    s.\"Status\" AS \"Status\",
    s.\"IsActive\" AS \"Active\",
    COALESCE(to_char(s.\"LockoutEnd\", 'YYYY-MM-DD HH24:MI:SS UTC'), 'None') AS \"Lockout End\",
    s.\"FailedLoginCount\" AS \"Failed Logins\"
FROM public.\"StaffMembers\" s
WHERE s.\"IsDeleted\" = false
  AND (
      s.\"Role\" = 'Admin'
      OR EXISTS (
          SELECT 1 FROM public.\"Roles\" r
          WHERE r.\"Id\" = s.\"ClinicRoleId\"
            AND (LOWER(r.\"Name\") = 'clinic administrator' OR (r.\"IsSystem\" = true AND LOWER(r.\"Name\") = 'clinic administrator'))
      )
  )
ORDER BY s.\"CreatedAt\" ASC;"

    run_psql_table "$DB_NAME" "$LIST_SQL"
    exit 0
fi

# --- Target Administrator Resolution for clear-lockout / generate-invite ---
if [ -n "$EMAIL" ]; then
    EMAIL_ESCAPED="${EMAIL//\'/\'\'}"
    ADMIN_QUERY="SELECT 
        s.\"Id\",
        s.\"Email\",
        TRIM(COALESCE(s.\"FirstName\", '') || ' ' || COALESCE(s.\"LastName\", ''))
    FROM public.\"StaffMembers\" s
    WHERE s.\"IsDeleted\" = false
      AND LOWER(s.\"Email\") = LOWER('$EMAIL_ESCAPED')
      AND (
          s.\"Role\" = 'Admin'
          OR EXISTS (
              SELECT 1 FROM public.\"Roles\" r
              WHERE r.\"Id\" = s.\"ClinicRoleId\"
                AND (LOWER(r.\"Name\") = 'clinic administrator' OR (r.\"IsSystem\" = true AND LOWER(r.\"Name\") = 'clinic administrator'))
          )
      )
    LIMIT 1;"

    ADMIN_ROW=$(run_psql_raw "$DB_NAME" "$ADMIN_QUERY")
    if [ -z "$ADMIN_ROW" ]; then
        CHECK_QUERY="SELECT COUNT(*) FROM public.\"StaffMembers\" WHERE \"IsDeleted\" = false AND LOWER(\"Email\") = LOWER('$EMAIL_ESCAPED');"
        STAFF_COUNT=$(run_psql_raw "$DB_NAME" "$CHECK_QUERY" || echo "0")
        if [ "$STAFF_COUNT" -gt 0 ]; then
            echo "Error: Staff member with email '$EMAIL' exists, but does not have the Administrator role." >&2
            echo "Only administrator accounts can be recovered using this operational tool." >&2
        else
            echo "Error: No staff member found with email '$EMAIL' in database '$DB_NAME'." >&2
        fi
        exit 1
    fi
    ADMIN_ID=$(echo "$ADMIN_ROW" | cut -d '|' -f 1)
    ADMIN_EMAIL=$(echo "$ADMIN_ROW" | cut -d '|' -f 2)
    ADMIN_NAME=$(echo "$ADMIN_ROW" | cut -d '|' -f 3)
else
    ALL_ADMINS_QUERY="SELECT 
        s.\"Id\",
        s.\"Email\",
        TRIM(COALESCE(s.\"FirstName\", '') || ' ' || COALESCE(s.\"LastName\", ''))
    FROM public.\"StaffMembers\" s
    WHERE s.\"IsDeleted\" = false
      AND (
          s.\"Role\" = 'Admin'
          OR EXISTS (
              SELECT 1 FROM public.\"Roles\" r
              WHERE r.\"Id\" = s.\"ClinicRoleId\"
                AND (LOWER(r.\"Name\") = 'clinic administrator' OR (r.\"IsSystem\" = true AND LOWER(r.\"Name\") = 'clinic administrator'))
          )
      )
    ORDER BY s.\"CreatedAt\" ASC;"

    ADMIN_ROWS=$(run_psql_raw "$DB_NAME" "$ALL_ADMINS_QUERY")
    ADMIN_COUNT=$(echo "$ADMIN_ROWS" | grep -c . || true)

    if [ "$ADMIN_COUNT" -eq 0 ]; then
        echo "Error: No administrator accounts found in database '$DB_NAME'." >&2
        exit 1
    elif [ "$ADMIN_COUNT" -gt 1 ]; then
        echo "Multiple administrator accounts found in database '$DB_NAME':"
        while IFS='|' read -r aid aemail aname; do
            echo "  - $aemail ($aname, ID: $aid)"
        done <<< "$ADMIN_ROWS"
        echo ""
        echo "Please specify which administrator to recover using: --email <email>" >&2
        exit 1
    else
        ADMIN_ID=$(echo "$ADMIN_ROWS" | cut -d '|' -f 1)
        ADMIN_EMAIL=$(echo "$ADMIN_ROWS" | cut -d '|' -f 2)
        ADMIN_NAME=$(echo "$ADMIN_ROWS" | cut -d '|' -f 3)
        echo "[Info] Auto-selected administrator: $ADMIN_EMAIL ($ADMIN_NAME)"
    fi
fi

# --- Action: Clear Lockout ---
if [ "$ACTION" = "clear-lockout" ]; then
    CLEAR_SQL="BEGIN;
UPDATE public.\"StaffMembers\"
SET \"LockoutEnd\" = NULL,
    \"FailedLoginCount\" = 0,
    \"TokenVersion\" = \"TokenVersion\" + 1,
    \"UpdatedAt\" = NOW(),
    \"UpdatedBy\" = 'CLI:AdminRecovery'
WHERE \"Id\" = '$ADMIN_ID';

UPDATE public.\"RefreshTokens\"
SET \"RevokedAt\" = NOW()
WHERE \"StaffMemberId\" = '$ADMIN_ID'
  AND \"RevokedAt\" IS NULL;
COMMIT;"

    run_psql_raw "$DB_NAME" "$CLEAR_SQL" >/dev/null

    echo "======================================================================"
    echo "  ClinicEZ Administrator Account Recovery - Lockout Cleared"
    echo "======================================================================"
    echo "  Target Database: $DB_NAME"
    echo "  Target Host:     $DB_HOST:$DB_PORT (Docker: $USE_DOCKER)"
    echo "----------------------------------------------------------------------"
    echo "  Administrator:   $ADMIN_NAME"
    echo "  Email:           $ADMIN_EMAIL"
    echo "  Staff ID:        $ADMIN_ID"
    echo "  Lockout:         Cleared (LockoutEnd = NULL, FailedLoginCount = 0)"
    echo "  Token Version:   Incremented (all prior sessions invalidated)"
    echo "----------------------------------------------------------------------"
    echo "  ✓ Account is unlocked. The administrator can now sign in with"
    echo "    their current password."
    echo "======================================================================"
    exit 0
fi

# --- Action: Generate One-Time Invitation Link ---
if [ "$ACTION" = "generate-invite" ]; then
    TOKEN=$(generate_token)
    INVITE_SQL="BEGIN;
UPDATE public.\"StaffMembers\"
SET \"InvitationToken\" = '$TOKEN',
    \"InvitationExpiresAt\" = NOW() + INTERVAL '7 days',
    \"Status\" = 'Invited',
    \"LockoutEnd\" = NULL,
    \"FailedLoginCount\" = 0,
    \"TokenVersion\" = \"TokenVersion\" + 1,
    \"UpdatedAt\" = NOW(),
    \"UpdatedBy\" = 'CLI:AdminRecovery'
WHERE \"Id\" = '$ADMIN_ID';

UPDATE public.\"RefreshTokens\"
SET \"RevokedAt\" = NOW()
WHERE \"StaffMemberId\" = '$ADMIN_ID'
  AND \"RevokedAt\" IS NULL;
COMMIT;"

    run_psql_raw "$DB_NAME" "$INVITE_SQL" >/dev/null

    APP_URL_CLEAN="${APP_URL%/}"
    INVITE_URL="${APP_URL_CLEAN}/invitations/${TOKEN}"

    echo "======================================================================"
    echo "  ClinicEZ Administrator Account Recovery - Invitation Link"
    echo "======================================================================"
    echo "  Target Database: $DB_NAME"
    echo "  Target Host:     $DB_HOST:$DB_PORT (Docker: $USE_DOCKER)"
    echo "----------------------------------------------------------------------"
    echo "  Administrator:   $ADMIN_NAME"
    echo "  Email:           $ADMIN_EMAIL"
    echo "  Staff ID:        $ADMIN_ID"
    echo "  Status:          Invited (Valid for 7 days)"
    echo "  Lockout:         Cleared (LockoutEnd = NULL, FailedLoginCount = 0)"
    echo "  Token Version:   Incremented (all prior sessions invalidated)"
    echo "----------------------------------------------------------------------"
    echo "  One-Time Invitation URL:"
    echo "  $INVITE_URL"
    echo "----------------------------------------------------------------------"
    echo "Instructions for Administrator:"
    echo "  1. Open the URL above in your web browser."
    echo "  2. Set a new strong password for your account."
    echo "  3. Sign in to access the clinic administration workstation."
    echo "======================================================================"
    exit 0
fi
