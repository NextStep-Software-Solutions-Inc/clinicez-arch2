# Documentation

## Architecture

| Document | What it covers |
|---|---|
| [Platform contract](architecture/platform-contract.md) | What a facility-type service must implement (license provisioning, local auth, envelope handlers, directory, entitlements) and the checklist for adding a new service. |
| [Message matrix](architecture/message-matrix.md) | Every interop message type: sender, receiver, payload record, addressing and correlation, and the messages nobody handles yet. |
| [Interop hub](architecture/interop-hub.md) | Mailboxes, cells, client kinds, routing and cross-tenant rules, delivery semantics, claims, Local-mode federation. |
| [Data ownership](architecture/data-ownership.md) | System of record per data class, what crosses the hub, retention, consent sharing and privacy notes. |
| [Billing](architecture/billing.md) | Per-cell cashiering, the consolidated visit bill and the finance rollup to the workspace. |
| [Edge cell](architecture/edge-cell.md) | The single-tenant on-premise cell: components, offline behaviour, credentials, upgrade channel. |

## Operations

| Document | What it covers |
|---|---|
| [Deployment configuration](deployment-configuration.md) | Every GitHub variable and secret the deploy workflows read, per service. |
| [Deploy folder](../deploy/README.md) | One folder per deployable, the shared messaging settings and the published container images. |
| [Edge bundle runbook](../deploy/edge/README.md) | Installing, upgrading, backing up and troubleshooting an on-premise cell. |
| [Interop hub service](../services/interop-hub/README.md) | Hub configuration, endpoints and how to run it locally. |
