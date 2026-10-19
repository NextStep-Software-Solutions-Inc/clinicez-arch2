#!/usr/bin/env bash
# Shared implementation of scripts/generate-license-keys.sh and scripts/generate-signing-key.sh. Not meant to be run directly:
# the wrappers set the ECK_* variables and call ec_keypair_main "$@".
#
#   ECK_SCRIPT        script name shown in messages
#   ECK_TITLE         what the pair is for (one line)
#   ECK_PRIVATE_NAME  variable name printed for the private key, e.g. FACILITY_LICENSE_PRIVATE_KEY
#   ECK_PUBLIC_NAME   variable name printed for the public key,  e.g. FACILITY_LICENSE_PUBLIC_KEY
#   ECK_PREFIX        file name prefix used with --out-dir, e.g. license -> license-private.pem
#   ECK_WARNING       one line telling where the private key may live
#
# Output: <NAME>=<base64 of the PEM text> on stdout (single line each: fits .env files and GitHub secrets); warnings on stderr.
# The pair is ECDSA P-256 (prime256v1): private key as SEC1 "EC PRIVATE KEY", public key as SubjectPublicKeyInfo "PUBLIC KEY".

eck_die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

eck_usage() {
  cat <<EOF
Usage: ${ECK_SCRIPT} [--out-dir <dir>] [--force]

${ECK_TITLE}

Without options the two variables are printed to stdout as NAME=<base64 of PEM> (redirect them straight into a secret store;
the warning goes to stderr). With --out-dir the keys are written to files instead (directory 700, files 600) and nothing
secret is printed:
  <dir>/${ECK_PREFIX}-private.pem   <dir>/${ECK_PREFIX}-public.pem   <dir>/${ECK_PREFIX}-keys.env
--force overwrites existing files. Needs openssl. The pair is ECDSA P-256 and is verified by a sign/verify round trip.
EOF
}

ec_keypair_main() {
  local out_dir="" force=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --out-dir|-o) [ "$#" -ge 2 ] || eck_die "$1 needs a directory"; out_dir=$2; shift ;;
      --force) force=1 ;;
      -h|--help) eck_usage; return 0 ;;
      *) eck_die "Unknown option: $1 (see --help)" ;;
    esac
    shift
  done
  command -v openssl >/dev/null 2>&1 || eck_die "openssl is required (Linux/macOS: install it with the package manager; Windows: use the .ps1 script)."

  local tmp priv_b64 pub_b64
  tmp=$(umask 077; mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  umask 077

  openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/key.pem" 2>/dev/null || eck_die "openssl could not generate a P-256 key."
  openssl ec -in "$tmp/key.pem" -pubout -out "$tmp/pub.pem" 2>/dev/null || eck_die "openssl could not derive the public key."

  # Self test: the pair must be a P-256 pair and sign/verify must round-trip.
  openssl ec -in "$tmp/key.pem" -noout -text 2>/dev/null | grep -Eq 'prime256v1|P-256' || eck_die "Generated key is not P-256."
  head -c 64 /dev/urandom > "$tmp/data"
  openssl dgst -sha256 -sign "$tmp/key.pem" -out "$tmp/sig" "$tmp/data" || eck_die "Self test failed: could not sign."
  openssl dgst -sha256 -verify "$tmp/pub.pem" -signature "$tmp/sig" "$tmp/data" >/dev/null || eck_die "Self test failed: signature did not verify."
  head -c 64 /dev/urandom > "$tmp/other"
  if openssl dgst -sha256 -verify "$tmp/pub.pem" -signature "$tmp/sig" "$tmp/other" >/dev/null 2>&1; then eck_die "Self test failed: a signature verified for other data."; fi

  priv_b64=$(openssl base64 -A -in "$tmp/key.pem")
  pub_b64=$(openssl base64 -A -in "$tmp/pub.pem")

  if [ -n "$out_dir" ]; then
    local f_priv="$out_dir/${ECK_PREFIX}-private.pem" f_pub="$out_dir/${ECK_PREFIX}-public.pem" f_env="$out_dir/${ECK_PREFIX}-keys.env" f
    mkdir -p "$out_dir"
    if [ ! -d "$out_dir" ]; then eck_die "Cannot create $out_dir"; fi
    for f in "$f_priv" "$f_pub" "$f_env"; do
      if [ -e "$f" ] && [ "$force" = 0 ]; then eck_die "$f already exists (use --force to overwrite)."; fi
    done
    cp "$tmp/key.pem" "$f_priv"
    cp "$tmp/pub.pem" "$f_pub"
    printf '%s=%s\n%s=%s\n' "$ECK_PRIVATE_NAME" "$priv_b64" "$ECK_PUBLIC_NAME" "$pub_b64" > "$f_env"
    chmod 600 "$f_priv" "$f_pub" "$f_env" 2>/dev/null || true
    printf 'Wrote %s, %s and %s (mode 600).\n' "$f_priv" "$f_pub" "$f_env" >&2
  else
    printf '%s=%s\n%s=%s\n' "$ECK_PRIVATE_NAME" "$priv_b64" "$ECK_PUBLIC_NAME" "$pub_b64"
  fi
  printf 'WARNING: %s\nWARNING: Never commit it, never paste it into tickets or chat; the public key is not secret.\n' "$ECK_WARNING" >&2
}
