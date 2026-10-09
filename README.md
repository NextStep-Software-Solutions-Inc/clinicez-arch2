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
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (and .NET 9 for `philhealth-proxy`)
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
# Type check all 4 Expo applications:
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