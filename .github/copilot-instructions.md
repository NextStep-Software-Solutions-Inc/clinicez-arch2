# Copilot Instructions for Clinic EZ Monorepo

Welcome to the **Clinic EZ** monorepo. Follow these guidelines and conventions whenever creating, modifying, or refactoring code.

---

## 🏛️ Monorepo Architecture

The monorepo is divided into three distinct layers:

```text
clinicez/
├── apps/                                  # All frontend client applications
│   ├── portal-web/                        # Next.js 16 Web Portal (SuperAdmin, Tenant Console, Marketing)
│   ├── patient-app/                       # Universal React Native Expo App (iOS, Android, Web)
│   ├── clinic-app/                        # Operational Clinic App (Web, Desktop, Tablet)
│   ├── laboratory-app/                    # Operational Laboratory App (LIS, Diagnostics)
│   ├── pharmacy-app/                      # Operational Pharmacy App (PMS, Inventory)
│   └── cashier-app/                       # Cashier / Billing App (per-cell cashiering)
│
├── services/                              # All backend microservices (.NET 10 / ASP.NET Core)
│   ├── portal-api/                        # Central Control Plane (Tenants, Licensing, Xendit Billing)
│   ├── interop-hub/                       # Interop Hub (store-and-forward mailboxes between services and cells)
│   ├── patient-api/                       # Patient EHR, Sync Engine, Hangfire Background Queue
│   ├── clinic-api/                        # Clinic EHR, Consultations, Triage
│   ├── laboratory-api/                    # Laboratory Information System (LIS)
│   ├── organization-api/                  # Healthcare Organization & Umbrella Network Management
│   ├── pharmacy-api/                      # Pharmacy Inventory, Dispensary, Formulary
│   ├── billing-api/                       # Per-cell cashiering, invoices, payments
│   └── philhealth-proxy/                  # PhilHealth Konsulta Integration Gateway
│
├── packages/                              # Shared cross-cutting libraries
│   ├── shared-dotnet/                     # C# Shared Library (ClinicEz.Shared: ApiResponse, Interop SDK, Exceptions)
│   └── shared-ts/                         # TypeScript Shared Library (@shared/safe utilities)
│
├── deploy/                                # One docker-compose folder per stack (+ edge/ on-premise bundle)
├── docs/                                  # Deployment configuration and architecture docs
├── scripts/                               # Repository guard scripts (check-no-broker.ps1)
│
├── CLINICEZ.sln                           # Master .NET Solution file (all services + shared-dotnet + tests)
├── Directory.Build.props                  # Centralized MSBuild configuration
└── package.json                           # Bun workspace root (apps/*, packages/*)
```

---

## 🛠️ Tooling & Workflows

### TypeScript & Frontend Apps (`apps/*`, `packages/shared-ts`)
- **Package Manager**: **Bun** is strictly enforced. Never use npm or yarn.
- **Root Scripts**:
  - `bun run typecheck:all` — Runs TypeScript checks across all 4 Expo apps.
  - `bun run lint:portal` — Lints `@clinicez/portal-web`.
  - `bun run build:portal` — Production build for `@clinicez/portal-web`.
- **Monorepo Dependency Imports**: Internal libraries are referenced via workspace protocol (e.g. `"@shared/safe": "workspace:*"`).

### .NET Backend Services (`services/*`, `packages/shared-dotnet`)
- **Framework**: .NET 10 (with .NET 9 for `philhealth-proxy`).
- **Solution File**: `CLINICEZ.sln` includes all 36 projects across all services, test projects, and `ClinicEz.Shared`.
- **Build & Test**:
  - Restore: `dotnet restore CLINICEZ.sln`
  - Build: `dotnet build CLINICEZ.sln --no-restore`
  - Test: `dotnet test CLINICEZ.sln --no-build`
- **Naming & Namespaces**: Follows the strict convention `ClinicEz.<Service>.<Layer>` (e.g., `ClinicEz.Portal.Api`, `ClinicEz.Patient.Application`).

---

## 🧩 Architectural & Coding Conventions

### 1. Backend Services (`services/*`)
- **Clean Architecture**: Strictly maintain the 4-layer separation:
  - `Api`: Minimal API endpoints implementing `IEndpoint`, Program.cs, middleware, Scalar OpenAPI.
  - `Application`: CQRS Commands/Queries, MediatR/FluentValidation behaviors, service interfaces.
  - `Domain`: Pure entities, value objects, domain events, repository interfaces. No external dependencies.
  - `Infrastructure`: EF Core `ApplicationDbContext`, migrations, repositories, external API clients, message consumers.
- **API Response Wrapper**: Always return responses using `ApiResponse<T>` from `ClinicEz.Shared`.
- **Database & Migration Tooling**: Use EF Core 10 with PostgreSQL (`CLINICEZ_<SERVICE>_DB`).
- **Cross-service messaging & Service Boundaries**: Use the interop SDK (`packages/shared-dotnet/Interop`) over the Interop Hub — see "Messaging & Interop Hub" below. **Direct inter-service HTTP communication is strictly forbidden across all services EXCEPT `portal <-> patient`**. Every facility service (`clinic-api`, `laboratory-api`, `pharmacy-api`, `organization-api`, `billing-api`) runs in outbound-only on-premise Edge Cells (`Hub:Mode=Local`, zero inbound ports) and MUST communicate exclusively via `services/interop-hub`.

### 2. Client & Mobile Applications (`apps/*`)
- **Expo Router**: Route files in `app/` should only define routes. Keep screen and component logic in `screens/` and `components/`.
- **Themed UI Components**: In React Native apps, always use `ThemedView` and `ThemedText` components instead of bare `View` and `Text`.
- **Local-First & Sync**: Patient and operational apps use local SQLite via Drizzle ORM. Mutations are enqueued in `syncQueue` and pushed to the corresponding service asynchronously.
- **Next.js Web Portal (`apps/portal-web`)**: Uses Next.js 16 App Router, React 19, Tailwind CSS v4, and Radix UI (`shadcn/ui`). Route protection is handled via `src/proxy.ts`. **Zero BFF Proxy Routes**: Next.js API route handlers (`src/app/api/...`) proxying to `portal-api` or `patient-api` are strictly forbidden. Frontend components connect directly to `portal-api` and `patient-api` using Clerk bearer tokens and domain-derived API URLs.

---

## 🔗 Messaging & Interop Hub

Direct inter-service HTTP communication is strictly forbidden across all services **except `portal <-> patient`**, and **there is no message broker** (no broker client packages, no broker containers, no `amqp` URLs). Every facility service (`clinic-api`, `laboratory-api`, `pharmacy-api`, `organization-api`, `billing-api`) can run in outbound-only on-premise Edge Cells (`Hub:Mode=Local`, zero inbound ports) and MUST communicate exclusively via signed `InteropEnvelope` messages through the **Interop Hub** (`services/interop-hub`, store-and-forward mailboxes `{cell}:{service}`). Each service embeds the SDK in `packages/shared-dotnet/Interop`: a transactional outbox, an idempotent inbox, a handler registry and relay/poller background services. Docs: `docs/architecture/{platform-contract,interop-hub,data-ownership,billing,edge-cell}.md` and `services/interop-hub/README.md`.

- **Guard**: `scripts/check-no-broker.ps1` fails when a broker product name or URL appears anywhere outside `docs/architecture/**`. It runs in `backend-ci.yml`; run `pwsh ./scripts/check-no-broker.ps1` before pushing. Say "message broker" in prose, never a product name.
- **Configuration** (section `Messaging`, env form `Messaging__*`): `Transport` (`Hub`, or `InProcess` in tests only), `Service` (mailbox: `clinic`, `laboratory`, `pharmacy`, `organization`, `patient`, `portal`, `billing`), `HubUrl`, `ClientId`, `ClientSecret`, `Enabled` (set `false` to skip the relay/poller). There are no default credentials; the host fails to start when a `Hub` transport is incomplete. Local development uses the hub in Development mode (`http://localhost:5290`, clients `dev-<service>` with secret `dev-<service>-secret`). Tests set `Messaging:Transport=InProcess` and/or `Messaging:Enabled=false`.
- **Wiring a service**: the service `DbContext` implements `IInteropDbContext` and calls `modelBuilder.ApplyInteropModel()`; register with `services.AddInterop<TDbContext>(configuration, b => b.Handle<TPayload, THandler>(InteropTypes.X))`.

### Adding a new message type
1. Add the type-string constant to `packages/shared-dotnet/Interop/InteropTypes.cs` (the single place type strings are declared; never inline string literals).
2. Add the payload `record` under `packages/shared-dotnet/Interoperability/`. Keep payloads additive-only; bump `schemaVersion` for breaking changes.
3. In the receiving service, implement `IInteropHandler<TPayload>` in the **Application** layer and register it in `AddInterop` (`b.Handle<TPayload, THandler>(InteropTypes.X)`). Delivery is at-least-once, so handlers **must be idempotent**; a handler's own `SaveChanges` is its commit point.
4. In the sending service, call `IInteropPublisher.Enqueue(type, from, to, correlationId, payload)` **before** the business `SaveChanges` so the outbox row commits in the same transaction. Never fire-and-forget after saving.
5. Address with `Party.ForFacility(tenantId, facilityId, type)`, `Party.ForPatient(patientId)` or `Party.Portal`; use a GUID `correlationId` that ties a request to its reply.
6. Add tests with the in-process transport, and add the type to the catalog table in `docs/architecture/platform-contract.md`.

---

## 🐳 Containerization & Deployment Conventions

- **Target Server Directory**: `/opt/docker-stack/clinicez-<service>/`.
- **Compose Files**: All compose files live under `deploy/<stack>/docker-compose.yml` (no `.deploy.yml` suffix); see `deploy/README.md`.
- **Networks**: Services connect to two external networks:
  - `npm-default`: Ingress via Nginx Proxy Manager (routes to container port `8080` without host port exposure).
  - `data-network`: Internal access to `postgres`. Names come from `DATA_NETWORK` / `NPM_NETWORK` (defaults `data-network` / `npm-default`).
- **Container Names & Labels**:
  - `container_name: clinicez-<service>`
  - `labels: ["project=clinicez", "environment=dev"]`
  - `expose: ["8080"]`

---

## 🎯 Code Quality & Principles

1. **SOLID & DRY**: Always design for single responsibility, open/closed extension, and zero duplication.
2. **Type Safety**: Strictly typed TypeScript with zero `any` unless explicitly required by external un-typed libraries. In C#, utilize nullable reference types (`<Nullable>enable</Nullable>`).
3. **No Dead Code**: Do not leave commented-out code, temporary debug scripts, or unused imports in production files.
