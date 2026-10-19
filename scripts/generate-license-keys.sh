#!/usr/bin/env bash
# Generates the facility-license key pair (ECDSA P-256) and prints
#   FACILITY_LICENSE_PRIVATE_KEY=<base64 of PEM>   -> ONLY the portal-api secret store
#   FACILITY_LICENSE_PUBLIC_KEY=<base64 of PEM>    -> portal-api, clinic-api, laboratory-api, pharmacy-api, organization-api,
#                                                      and the edge bundle (install.sh --license-public-key)
# Options: --out-dir <dir> (write files, mode 600, instead of printing), --force, --help. Windows: generate-license-keys.ps1.
# Rotation: generate a new pair, set the new public key as FACILITY_LICENSE_PUBLIC_KEY and keep the old public key as
# FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS until every issued license was renewed (see docs/deployment-configuration.md).
set -euo pipefail

ECK_SCRIPT=generate-license-keys.sh
ECK_TITLE="Facility license signing keys: the portal signs licenses with the private key, every service validates them with the public key."
ECK_PRIVATE_NAME=FACILITY_LICENSE_PRIVATE_KEY
ECK_PUBLIC_NAME=FACILITY_LICENSE_PUBLIC_KEY
ECK_PREFIX=license
ECK_WARNING="FACILITY_LICENSE_PRIVATE_KEY must live ONLY in the portal-api secret store (never on edge servers or other services)."

# shellcheck source=lib/ec-keypair.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/ec-keypair.sh"
ec_keypair_main "$@"
