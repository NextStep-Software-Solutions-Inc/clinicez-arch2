#!/usr/bin/env bash
# Helper for the deploy workflows (source it: `. scripts/ci/prepare-key-env.sh`). It is not run on servers.
#
#   prepare_key_env <kind> VAR [VAR...]
#
# kinds:  private          required ECDSA P-256 private key
#         public           required ECDSA P-256 public key
#         optional-public  public key that may be empty (e.g. FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS)
#         optional-blob    base64 blob that may be empty (e.g. DATA_PROTECTION_CERT_BASE64)
#
# Values may be a PEM (multi-line GitHub secret) or base64 of a PEM. A PEM is converted to single-line base64 so the
# `VAR=value` line the workflow appends to deploy/<stack>/.env stays one line; whitespace inside base64 is removed. Required
# keys that are empty or are not valid P-256 keys fail the workflow with a ::error:: annotation (values are never printed).
# The workflow then writes the (exported) variable to .env like every other value.

prepare_key_env() {
  local kind=$1 var v dec txt
  shift
  for var in "$@"; do
    v=$(printenv "$var" || true)
    if [ -z "$v" ]; then
      case "$kind" in
        optional-public|optional-blob) continue ;;
        *) echo "::error::$var is not configured. Set the matching GitHub secret or variable (Settings -> Secrets and variables -> Actions); generate key pairs with scripts/generate-license-keys.sh or scripts/generate-signing-key.sh."; exit 1 ;;
      esac
    fi
    case "$v" in
      *-----BEGIN*) v=$(printf '%s\n' "$v" | tr -d '\r' | base64 | tr -d '\n') ;;
      *) v=$(printf '%s' "$v" | tr -d '[:space:]') ;;
    esac
    case "$kind" in
      private|public|optional-public)
        dec=$(printf '%s' "$v" | base64 -d 2>/dev/null || true)
        case "$kind" in
          private) printf '%s' "$dec" | openssl pkey -noout >/dev/null 2>&1 || { echo "::error::$var is not a valid private key (PEM or base64 of PEM)."; exit 1; } ;;
          *)
            if ! printf '%s' "$dec" | openssl pkey -pubin -noout >/dev/null 2>&1; then
              if printf '%s' "$dec" | openssl pkey -noout >/dev/null 2>&1 || printf '%s' "$dec" | openssl ec -noout >/dev/null 2>&1; then
                pub_pem=$(printf '%s' "$dec" | openssl ec -pubout 2>/dev/null || printf '%s' "$dec" | openssl pkey -pubout 2>/dev/null)
                v=$(printf '%s\n' "$pub_pem" | tr -d '\r' | base64 | tr -d '\n')
                dec=$(printf '%s' "$v" | base64 -d 2>/dev/null || true)
              else
                echo "::error::$var is not a valid public key (PEM or base64 of PEM)."; exit 1;
              fi
            fi
            ;;
        esac
        txt=$(printf '%s' "$dec" | openssl pkey $([ "$kind" = private ] || echo -pubin) -noout -text 2>/dev/null || true)
        case "$txt" in *prime256v1*|*P-256*) ;; *) echo "::error::$var must be an ECDSA P-256 key."; exit 1 ;; esac
        ;;
    esac
    export "$var=$v"
  done
}

# require_min_length VAR MIN: fails the workflow when VAR is empty or shorter than MIN characters (the value is never printed).
require_min_length() {
  local var=$1 min=$2 v
  v=$(printenv "$var" || true)
  if [ -z "$v" ]; then
    echo "::error::$var is not configured. Set the matching GitHub secret or variable (Settings -> Secrets and variables -> Actions); generate one with scripts/generate-secrets.sh."
    exit 1
  fi
  if [ "${#v}" -lt "$min" ]; then
    echo "::error::$var must be at least $min characters long."
    exit 1
  fi
}
