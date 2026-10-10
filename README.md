# Clinic EZ Architecture & Ecosystem

Welcome to the **Clinic EZ** monorepo! This repository houses the unified next-generation multi-tenant platform architecture for Clinic EZ, supporting SaaS and on-premise deployments across Web, Mobile, and Desktop.

---

## 🏛️ Monorepo Structure

The monorepo follows an intuitive, modular layout:

```text
clinicez/
├── apps/                                  # All client applications & user-facing frontends
│   ├── portal-web/                        # Next.js 16 Web Portal (Marketing, SuperAdmin, Tenant Workspace)
│   ├── patient-app/                       # Universal React Native Expo App (iOS, Android & Web)
│   ├── clinic-app/                        # Cross-Platform Clinic Operational App (Web, Desktop, Tablet)
│   ├── laboratory-app/                    # Cross-Platform Laboratory Operational App (LIS)
│   ├── pharmacy-app/                      # Cross-Platform Pharmacy Operational App (PMS)
│   └── cashier-app/                       # Cashier / Billing App (per-cell cashiering)
│
├── services/                              # All backend microservices & APIs (.NET 10 / ASP.NET Core)
│   ├── portal-api/                        # Central Control Plane API (Tenants, Licensing, Xendit Billing)
│   ├── interop-hub/                       # Interop Hub: store-and-forward mailboxes between services and cells
│   ├── patient-api/                       # Patient API (EHR records, sync engine, Hangfire queue)
│   ├── clinic-api/                        # Clinic Operational Microservice (Consultations, EHR, Triage)
│   ├── laboratory-api/                    # Laboratory Operational Microservice (LIS, Diagnostics)
│   ├── pharmacy-api/                      # Pharmacy Operational Microservice (PMS, Inventory)
│   ├── billing-api/                       # Per-cell cashiering, invoices and payments
│   ├── organization-api/                  # Healthcare Organization & Umbrella Network Management
│   └── philhealth-proxy/                  # PhilHealth Konsulta Integration Gateway
│
├── packages/                              # Shared cross-cutting libraries
│   ├── shared-dotnet/                     # C# Shared Library (ClinicEz.Shared: ApiResponse, Interop SDK, Exceptions)
│   └── shared-ts/                         # TypeScript Shared Library (@shared/safe utilities)
│
├── deploy/                                # One docker-compose folder per stack (+ edge/ on-premise bundle)
├── docs/                                  # Deployment configuration and architecture docs (docs/architecture/)
├── scripts/                               # Repository guard scripts (check-no-broker.ps1)
│
├── .github/
│   ├── workflows/                         # Standardized CI, Server Deployment & Image Publishing Workflows
│   └── copilot-instructions.md            # AI & Copilot Developer Guidelines
│
├── CLINICEZ.sln                           # Master .NET Solution file
├── Directory.Build.props                  # Centralized MSBuild configuration
└── package.json                           # Bun workspace root (apps/*, packages/*)
```

---

## 🚀 Getting Started

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Bun](https://bun.sh/) (v1.2+)
- [Docker & Docker Compose](https://www.docker.com/)

### 1. Build & Test .NET Backend Services
Build all projects and run tests from the root solution:
```bash
# Restore and build the entire backend solution:
dotnet restore CLINICEZ.sln
dotnet build CLINICEZ.sln --no-restore

# Run all unit tests:
dotnet test CLINICEZ.sln --no-build
```

### 2. Run TypeScript Verification Across All Apps
Run typechecks and builds for all frontend applications from the repository root:
```bash
# Type check all Expo applications:
bun run typecheck:all

# Lint & build portal web:
bun run lint:portal
bun run build:portal
```

### 3. Run the Web Portal (Marketing, SuperAdmin & Tenant Console)
```bash
cd apps/portal-web
bun install
bun run dev
```
Navigate to `http://localhost:3000`.

### 4. Run the Central Control Plane API (`portal-api`)
```bash
cd services/portal-api/ClinicEz.Portal.Api
dotnet run
```
Interactive OpenAPI documentation is available at `https://localhost:7xxx/scalar/v1`.

### 5. Run the Patient App (Mobile & Web)
```bash
cd apps/patient-app
bun install
# Start for Mobile (iOS / Android):
bun run start
# Or start for Web:
bun run web
```

---

## 🔑 Environment Variables & Secrets Reference Guide

Below is the complete, service-by-service reference of all **GitHub Action Secrets/Variables** (for Cloud CI/CD) and **Environment Variables** (for On-Premise Edge Cell deployments).

---

### PART 1: Cloud CI/CD Deployment (GitHub Secrets & Variables)

Managed in GitHub under **Settings ➔ Secrets and variables ➔ Actions**.

#### 1. Deployment Infrastructure & CI Access
| Target Service | Name | Description & Purpose | Default / Example Value | How to Generate / Obtain |
| :--- | :--- | :--- | :--- | :--- |
| **Global CI** | `SSH_HOST` *(Secret)* | Target deployment VPS IP or domain | `deploy.clinicez.com` | Hostname or IP of server |
| **Global CI** | `SSH_USER` *(Secret)* | Deployment SSH Linux user | `deploy` | Linux user with Docker rights |
| **Global CI** | `SSH_KEY` *(Secret)* | Private OpenSSH key for deployment | `-----BEGIN OPENSSH PRIVATE KEY-----` | `ssh-keygen -t ed25519 -C "github-actions"` |
| **Global CI** | `SSH_PASSPHRASE` *(Secret)* | Passphrase for SSH private key | `Passphrase123!` | Specified during `ssh-keygen` |
| **Vercel Apps** | `VERCEL_TOKEN` *(Secret)* | Vercel API deployment token | `vcp_1234567890abcdef...` | Vercel Account Settings ➔ Tokens |
| **Mobile Apps** | `EXPO_TOKEN` *(Secret)* | Expo Application Services token | `eas_1234567890...` | Expo Account Settings ➔ Access Tokens |

---

#### 2. Interop Hub (`services/interop-hub`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `INTEROP_HUB_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_INTEROP_HUB_DB;...` | Standard PostgreSQL connection string |
| `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY` | Secret | Base64 AES-256 key encrypting DB queued envelopes | `8fK9xL2pQ1vR4mS7tW0zX3yA6bC9dE2f` (32 bytes b64) | `openssl rand -base64 32` |
| `INTEROP_HUB_PORTAL_CLIENT_SECRET` | Secret | Secret for Portal ControlPlane client | `k9M2vR7xL4pQ1wS8tY0zB3aC6dE9fG2h` (40 chars) | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |
| `INTEROP_HUB_PORTAL_PUBLIC_KEY` | Secret | Base64 PEM ECDSA P-256 public key for Portal | `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...` | `openssl ec -in portal_private.pem -pubout` |
| `MESSAGING_HUB_URL` | Variable | Public URL of Interop Hub | `https://hub.clinicez.com` | Public hub domain |
| `HUB_CLOUD_CELL_ID` | Variable | Cell ID of the Cloud cell | `cloud` | Constant `cloud` |
| `HUB_SIGNING_REQUIRED` | Variable | Enforces ECDSA signature validation | `true` | Set `true` |

---

#### 3. Portal API Control Plane (`services/portal-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `PORTAL_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string for Portal DB | `Host=postgres;Port=5432;Database=CLINICEZ_PORTAL_DB;...` | Standard connection string |
| `FACILITY_LICENSE_PRIVATE_KEY` | Secret | ECDSA P-256 private key for signing licenses | `-----BEGIN EC PRIVATE KEY-----\n...` | `openssl ecparam -genkey -name prime256v1 -noout` |
| `FACILITY_LICENSE_PUBLIC_KEY` | Secret | ECDSA P-256 public key for verifying licenses | `-----BEGIN PUBLIC KEY-----\n...` | `openssl ec -in private.pem -pubout` |
| `PORTAL_CLERK_SECRET_KEY` | Secret | Clerk Backend API Secret Key | `sk_live_1234567890abcdef...` | Issued in Clerk Dashboard |
| `PORTAL_XENDIT_SECRET_KEY` | Secret | Xendit Payment API Secret Key | `xnd_development_12345...` | Issued in Xendit Dashboard |
| `PORTAL_XENDIT_CALLBACK_TOKEN` | Secret | Xendit Webhook Token | `xnd_callback_token_12345...` | Issued in Xendit Dashboard |
| `PORTAL_MESSAGING_CLIENT_ID` / `_SECRET` | Secret | Hub client credentials for Portal | `dev-portal` / `dev-portal-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |
| `PORTAL_MESSAGING_SIGNING_KEY` | Secret | ECDSA P-256 private key for Portal messages | `-----BEGIN EC PRIVATE KEY-----\n...` | `openssl ecparam -genkey -name prime256v1 -noout` |
| `PORTAL_API_BASE_URL` | Variable | Public API domain for Portal API | `https://portal-api.clinicez.com` | Public domain |

---

#### 4. Clinic Operational Microservice (`services/clinic-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `CLINIC_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_CLINIC_DB;...` | Standard connection string |
| `CLINIC_JWT_SIGNING_KEY` | Secret | Key signing local staff JWT tokens | `base64_64_random_bytes...` | `openssl rand -base64 64` |
| `CLINIC_ENCRYPTION_MASTER_SECRET` | Secret | Master key wrapping clinical attachments | `64_char_alphanumeric_secret...` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64` |
| `CLINIC_DOCUMENT_SIGNING_KEY` | Secret | HMAC key for QR code document signatures | `64_char_alphanumeric_secret...` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64` |
| `CLINIC_MESSAGING_CLIENT_ID` / `_SECRET` | Secret | Hub client credentials for Clinic service | `dev-clinic` / `dev-clinic-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |
| `CLINIC_MESSAGING_SIGNING_KEY` | Secret | ECDSA P-256 private key for signing messages | `-----BEGIN EC PRIVATE KEY-----\n...` | `openssl ecparam -genkey -name prime256v1 -noout` |

---

#### 5. Laboratory Operational Microservice (`services/laboratory-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `LABORATORY_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_LAB_DB;...` | Standard connection string |
| `LAB_JWT_SIGNING_KEY` | Secret | JWT signing key for lab staff | `base64_64_random_bytes...` | `openssl rand -base64 64` |
| `LABORATORY_DOCUMENT_SIGNING_KEY` | Secret | HMAC key for lab report QR codes | `64_char_alphanumeric_secret...` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64` |
| `LABORATORY_MESSAGING_CLIENT_ID` / `_SECRET` / `_SIGNING_KEY` | Secret | Hub client credentials & ECDSA key | `dev-laboratory` / `dev-lab-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |

---

#### 6. Pharmacy Operational Microservice (`services/pharmacy-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `PHARMACY_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_PHARMACY_DB;...` | Standard connection string |
| `PHARMACY_JWT_SIGNING_KEY` | Secret | JWT signing key for pharmacy staff | `base64_64_random_bytes...` | `openssl rand -base64 64` |
| `PHARMACY_GAMOT_UPSC_SECRET_KEY` | Secret | HMAC key for GAMOT prescription code verification | `64_char_alphanumeric_secret...` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64` |
| `PHARMACY_MESSAGING_CLIENT_ID` / `_SECRET` / `_SIGNING_KEY` | Secret | Hub client credentials & ECDSA key | `dev-pharmacy` / `dev-pharmacy-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |

---

#### 7. Billing Microservice (`services/billing-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `BILLING_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_BILLING_DB;...` | Standard connection string |
| `BILLING_JWT_SIGNING_KEY` | Secret | JWT signing key for cashier staff | `base64_64_random_bytes...` | `openssl rand -base64 64` |
| `BILLING_MESSAGING_CLIENT_ID` / `_SECRET` / `_SIGNING_KEY` | Secret | Hub client credentials & ECDSA key | `dev-billing` / `dev-billing-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |

---

#### 8. Patient Microservice (`services/patient-api`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `PATIENT_DB_CONNECTION_STRING` | Secret | PostgreSQL connection string | `Host=postgres;Port=5432;Database=CLINICEZ_PATIENT_DB;...` | Standard connection string |
| `PATIENT_ENCRYPTION_KEY` | Secret | Key encrypting patient health records | `base64_32_random_bytes...` | `openssl rand -base64 32` |
| `PATIENT_SHARING_SIGNING_KEY` | Secret | HMAC key for QR patient share tokens | `64_char_alphanumeric_secret...` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 64` |
| `PATIENT_CLERK_WEBHOOK_SECRET` | Secret | Clerk sync webhook verification secret | `whsec_1234567890abcdef...` | Issued in Clerk Webhooks |
| `PATIENT_R2_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Secret | Cloudflare R2 object storage credentials | `r2_access_key` / `r2_secret_key` | Issued in Cloudflare Dashboard |
| `PATIENT_MESSAGING_CLIENT_ID` / `_SECRET` / `_SIGNING_KEY` | Secret | Hub client credentials & ECDSA key | `dev-patient` / `dev-patient-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |

---

#### 9. PhilHealth Proxy Gateway (`services/philhealth-proxy`)
| Name | Type | Description & Purpose | Default / Example Value | How to Generate Command |
| :--- | :--- | :--- | :--- | :--- |
| `PortalApi__BaseUrl` | Variable | Portal API base URL for fetching tenant PhilHealth credentials | `https://portal-api.clinicez.com` | Public domain |
| `Messaging__*` | Secret | Hub client credentials for `philhealth` service | `dev-philhealth` / `dev-philhealth-secret` | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 40` |

> **Note on PhilHealth Encryption**: PhilHealth Konsulta payload encryption uses the tenant branch's **PhilHealth Cipher Key** directly via symmetric AES-256-CBC. No digital certificate (`.pfx`) environment variable is required.

---

### PART 2: On-Premise Deployment Environment Variables (`deploy/edge/.env`)

For hospital or local clinic on-premise installations, copy `deploy/edge/.env.example` to `.env` or run `./install.ps1` / `./install.sh`.

```env
# ======================================================================================================================
# 1. CONTAINER ORCHESTRATION & PROFILES
# ======================================================================================================================
GHCR_OWNER_REPO=nextstep-software-solutions-inc/clinicez-arch2
IMAGE_TAG=latest
# Enabled service profiles: local-hub (default), laboratory, pharmacy, organization, billing
COMPOSE_PROFILES=local-hub,laboratory,pharmacy,billing

# ======================================================================================================================
# 2. SITE IDENTITY & ACCREDITATION (Provided by Portal on Facility Creation)
# ======================================================================================================================
TENANT_ID=11111111-2222-3333-4444-555555555555
EDGE_CELL_ID=edge-st-jude-hospital
EDGE_CELL_NAME=St Jude Hospital On-Premise Site
CLINIC_FACILITY_ID=22222222-3333-4444-5555-666666666666
CLINIC_FACILITY_NAME=St Jude Outpatient Clinic
LABORATORY_FACILITY_ID=33333333-4444-5555-6666-777777777777
LABORATORY_FACILITY_NAME=St Jude Diagnostic Lab
PHARMACY_FACILITY_ID=44444444-5555-6666-7777-888888888888
PHARMACY_FACILITY_NAME=St Jude Pharmacy
ORGANIZATION_FACILITY_ID=
ORGANIZATION_FACILITY_NAME=
BASE_DOMAIN=clinic.local
CORS_ALLOWED_ORIGINS=http://192.168.1.10:8080,http://192.168.1.11:8080

# ======================================================================================================================
# 3. FACILITY LICENSE VERIFICATION KEYS (Issued by Portal)
# ======================================================================================================================
FACILITY_LICENSE_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----
FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS=
HUB_SIGNING_REQUIRED=true

# ======================================================================================================================
# 4. UPSTREAM CLOUD HUB LINK (Local Hub ➔ Cloud Hub Connection)
# ======================================================================================================================
UPSTREAM_ENABLED=true
UPSTREAM_HUB_URL=https://hub.clinicez.com
UPSTREAM_CLIENT_ID=edge-st-jude-hospital-cell-client
UPSTREAM_CLIENT_SECRET=k9M2vR7xL4pQ1wS8tY0zB3aC6dE9fG2h3j4k5l6m
EDGE_HUB_SIGNING_KEY=-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----
CLINIC_PUBLIC_UPLOAD_BASE_URL=https://portal.clinicez.com/upload/lab

# ======================================================================================================================
# 5. LOCAL INTEROP HUB & LOCAL MESSAGING CLIENTS
# ======================================================================================================================
MESSAGING_HUB_URL=http://interop-hub:8080

CLINIC_HUB_CLIENT_ID=site-clinic
CLINIC_HUB_CLIENT_SECRET=a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0
CLINIC_HUB_SIGNING_KEY=-----BEGIN EC PRIVATE KEY-----\n...
CLINIC_HUB_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...

BILLING_HUB_CLIENT_ID=site-billing
BILLING_HUB_CLIENT_SECRET=b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1
BILLING_HUB_SIGNING_KEY=-----BEGIN EC PRIVATE KEY-----\n...
BILLING_HUB_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...

LABORATORY_HUB_CLIENT_ID=site-laboratory
LABORATORY_HUB_CLIENT_SECRET=c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2
LABORATORY_HUB_SIGNING_KEY=-----BEGIN EC PRIVATE KEY-----\n...
LABORATORY_HUB_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...

PHARMACY_HUB_CLIENT_ID=site-pharmacy
PHARMACY_HUB_CLIENT_SECRET=d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3
PHARMACY_HUB_SIGNING_KEY=-----BEGIN EC PRIVATE KEY-----\n...
PHARMACY_HUB_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...

HUB_PAYLOAD_ENCRYPTION_KEY=8fK9xL2pQ1vR4mS7tW0zX3yA6bC9dE2f
HUB_BIND=127.0.0.1
HUB_LAN_PORT=8090

# ======================================================================================================================
# 6. LOCAL POSTGRESQL DATABASE
# ======================================================================================================================
POSTGRES_USER=clinicez
POSTGRES_PASSWORD=pA3sS9wO0rD1eF2g3H4i5J6k7L8m9N0o

# ======================================================================================================================
# 7. LOCAL SERVICE JWT & DOCUMENT SIGNING SECRETS
# ======================================================================================================================
CLINIC_JWT_SIGNING_KEY=wK9xL2pQ1vR4mS7tW0zX3yA6bC9dE2fG
BILLING_JWT_SIGNING_KEY=xL2pQ1vR4mS7tW0zX3yA6bC9dE2fG3hI
LABORATORY_JWT_SIGNING_KEY=yP1vR4mS7tW0zX3yA6bC9dE2fG3hI4jK
PHARMACY_JWT_SIGNING_KEY=zR4mS7tW0zX3yA6bC9dE2fG3hI4jK5lM

CLINIC_ENCRYPTION_MASTER_SECRET=r3M9vX2pL8wQ1tY4zB6aC0dE5fG7hI1j
CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0=

CLINIC_DOCUMENT_SIGNING_KEY=k9M2vR7xL4pQ1wS8tY0zB3aC6dE9fG2h
LABORATORY_DOCUMENT_SIGNING_KEY=m2R7xL4pQ1wS8tY0zB3aC6dE9fG2h3j4
GAMOT_UPSC_SECRET_KEY=n7xL4pQ1wS8tY0zB3aC6dE9fG2h3j4k5
HANGFIRE_DASHBOARD_PASSWORD=hA8nG9fI0rE1pA2sS3wO4rD5

# ======================================================================================================================
# 8. LOCAL WEB WORKSTATION PORTS
# ======================================================================================================================
CLINIC_WEB_PORT=8080
LABORATORY_WEB_PORT=8081
PHARMACY_WEB_PORT=8082
CASHIER_WEB_PORT=8083

# ======================================================================================================================
# 9. BACKUP & RETENTION
# ======================================================================================================================
BACKUP_DIR=./backups
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=14
```

---

### PART 3: Portal Platform Administrator Settings (Managed Live via Database / Portal UI)

System feature rules and defaults are stored in PostgreSQL (`portal_dashboard.system_settings`) and managed by Super Administrators in the **Portal UI** (`/admin/settings`):

| Category | Key | Description | Default Value |
| :--- | :--- | :--- | :--- |
| **Licensing** | `Licensing:TtlDays` | Default license validity period | `30` days |
| **Licensing** | `Licensing:GraceDays` | Offline grace period before facility lock | `14` days |
| **Licensing** | `Licensing:RenewBeforeDays` | Auto-renew heartbeat threshold window | `7` days |
| **Licensing** | `Workspace:MaxOwnedPerUser` | Max owned active workspaces per owner | `1` |
| **Billing** | `Billing:TrialDays` | Default workspace trial period | `14` days |
| **Billing** | `Billing:DefaultPlanSlug` | Initial plan assigned on signup | `starter` |
| **Storage** | `Storage:LabUploadMaxFileBytes` | Max public upload file size | `10485760` (10MB) |
| **Storage** | `Storage:LabUploadRateLimitPermits` | Rate limit max permits | `5` permits |
| **Storage** | `Storage:LabUploadRateLimitWindowMinutes` | Rate limit window duration | `1` minute |
| **Mailer** | `Mailer:SmtpHost` / `Mailer:SmtpPort` / `Mailer:SmtpSecurity` | SMTP server host config | `smtp.mailgun.org` / `587` / `StartTls` |
| **Mailer** | `Mailer:SmtpFromEmail` / `Mailer:SmtpFromName` | System notification email sender | `no-reply@clinicez.com` / `ClinicEZ Support` |
| **Mailer** | `Mailer:SmtpReplyTo` / `Mailer:ContactInbox` | Notification reply & support inbox | `support@clinicez.com` / `contact@clinicez.com` |

---

## 🔒 Tenancy & Offline-First Strategy

1. **Patient App Offline-First**:
   - **Authentication & Booking**: Enforces online connectivity to authenticate via Clerk and secure appointment slots without collision.
   - **Medical Records**: Cached locally in SQLite via Drizzle ORM. Full read/write accessibility when offline, automatically synchronized through the background queue to `patient-api` upon reconnecting.
2. **Operational Apps (Clinic, Lab, Pharmacy)**:
   - Designed to run across Web, Desktop (Tauri), and Tablets.
   - For on-premise facilities, services run directly on the local LAN server via Docker Compose, guaranteeing 100% continuous care during network disruptions.

---

## 🐳 Deployment & Infrastructure

- **Server Stacks**: Stored under `/opt/docker-stack/clinicez-<service>/` on the target VPS.
- **Compose Files**: All compose files live under [`deploy/`](deploy/README.md), one folder per stack, each a standard `docker-compose.yml`.
- **Zero Exposed Host Ports**: Containers communicate through internal Docker networks:
  - `npm-default`: Incoming requests reverse-proxied by Nginx Proxy Manager (NPM).
  - `data-network`: Internal communication with PostgreSQL (`postgres:5432`) and Redis (`redis:6379`).
- **Database Naming Convention**: Standardized across services to `CLINICEZ_<SERVICE>_DB`.
- **Automated CI/CD**: Powered by GitHub Actions in `.github/workflows/` with discrete workflows per service.
- **Container Images**: [`publish-images.yml`](.github/workflows/publish-images.yml) builds multi-arch (amd64 + arm64) images for every service and web app and publishes them to GHCR (`ghcr.io/<owner>/<repo>/<image>`) on `v*` tags.

---

## 🔗 Messaging & Interop Hub

Services never talk to each other directly and there is no message broker. Cross-service and cross-cell messages are signed envelopes delivered through the [Interop Hub](services/interop-hub/README.md) (store-and-forward mailboxes):

- Every service embeds the interop SDK in [`packages/shared-dotnet/Interop`](packages/shared-dotnet/Interop) (transactional outbox, idempotent inbox, handler registry) and is configured through the `Messaging` section (`Messaging__Transport`, `Messaging__Service`, `Messaging__HubUrl`, `Messaging__ClientId`, `Messaging__ClientSecret`).
- Message types are declared once in `InteropTypes`; see the [message matrix](docs/architecture/message-matrix.md) for who sends and handles each one.
- The no-broker rule is enforced by [`scripts/check-no-broker.ps1`](scripts/check-no-broker.ps1) (run in backend CI).

Architecture docs: [`docs/architecture/`](docs/architecture) — [platform contract](docs/architecture/platform-contract.md), [message matrix](docs/architecture/message-matrix.md), [interop hub](docs/architecture/interop-hub.md), [data ownership](docs/architecture/data-ownership.md), [billing](docs/architecture/billing.md), [edge cell](docs/architecture/edge-cell.md).

## 🏥 On-Premise Edge Cell

A facility that must keep working without internet runs a single-tenant **edge cell**: the facility APIs, web apps, PostgreSQL with backups and a local Interop Hub in Local mode that reaches the cloud over outbound HTTPS only. The bundle, installer and runbook are in [`deploy/edge/`](deploy/edge/README.md); the design is in [`docs/architecture/edge-cell.md`](docs/architecture/edge-cell.md).