#!/usr/bin/env bash
# Generates an interop-hub client signing key pair (ECDSA P-256) and prints
#   SIGNING_KEY=<base64 of PEM>          -> the client's Messaging__SigningKey (cloud: <SVC>_HUB_SIGNING_KEY secret,
#                                           edge: <SVC>_HUB_SIGNING_KEY / EDGE_HUB_SIGNING_KEY); stays with that client
#   SIGNING_PUBLIC_KEY=<base64 of PEM>   -> registered at the hub for that client (cloud bootstrap: PORTAL_HUB_PUBLIC_KEY, other
#                                           clients: hub admin API; edge: <SVC>_HUB_PUBLIC_KEY)
# One pair per hub client; never share a key pair between clients.
# Options: --out-dir <dir> (write files, mode 600, instead of printing), --force, --help. Windows: generate-signing-key.ps1.
set -euo pipefail

ECK_SCRIPT=generate-signing-key.sh
ECK_TITLE="Hub client envelope signing keys: the client signs outgoing envelopes with the private key, the hub verifies them with the registered public key."
ECK_PRIVATE_NAME=SIGNING_KEY
ECK_PUBLIC_NAME=SIGNING_PUBLIC_KEY
ECK_PREFIX=signing
ECK_WARNING="SIGNING_KEY must live ONLY with the one hub client it belongs to; only SIGNING_PUBLIC_KEY is handed to the hub."

# shellcheck source=lib/ec-keypair.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/ec-keypair.sh"
ec_keypair_main "$@"
