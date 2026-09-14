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
│   └── pharmacy-app/                      # Operational Pharmacy App (PMS, Inventory)
│
├── services/                              # All backend microservices (.NET 10 / ASP.NET Core)
│   ├── portal-api/                        # Central Control Plane (Tenants, Licensing, Xendit Billing)
│   ├── patient-api/                       # Patient EHR, Sync Engine, Hangfire Background Queue
│   ├── clinic-api/                        # Clinic EHR, Consultations, Triage
│   ├── laboratory-api/                    # Laboratory Information System (LIS)
│   ├── organization-api/                  # Healthcare Organization & Umbrella Network Management
│   ├── pharmacy-api/                      # Pharmacy Inventory, Dispensary, Formulary
│   └── philhealth-proxy/                  # PhilHealth Konsulta Integration Gateway
│
├── packages/                              # Shared cross-cutting libraries
│   ├── shared-dotnet/                     # C# Shared Library (ClinicEz.Shared: ApiResponse, Events, Exceptions)
│   └── shared-ts/                         # TypeScript Shared Library (@shared/safe utilities)
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
- **Event Mesh**: Use MassTransit over RabbitMQ for cross-service events.

### 2. Client & Mobile Applications (`apps/*`)
- **Expo Router**: Route files in `app/` should only define routes. Keep screen and component logic in `screens/` and `components/`.
- **Themed UI Components**: In React Native apps, always use `ThemedView` and `ThemedText` components instead of bare `View` and `Text`.
- **Local-First & Sync**: Patient and operational apps use local SQLite via Drizzle ORM. Mutations are enqueued in `syncQueue` and pushed to the corresponding service asynchronously.
- **Next.js Web Portal (`apps/portal-web`)**: Uses Next.js 16 App Router, React 19, Tailwind CSS v4, and Radix UI (`shadcn/ui`). Route protection is handled via `src/proxy.ts`.

---

## 🐳 Containerization & Deployment Conventions

- **Target Server Directory**: `/opt/docker-stack/clinicez-<service>/`.
- **Compose Files**: Each service uses standard `docker-compose.yml` (no `.deploy.yml` suffix).
- **Networks**: Services connect to two external networks:
  - `npm-default`: Ingress via Nginx Proxy Manager (routes to container port `8080` without host port exposure).
  - `data-network`: Internal access to `postgres`, `rabbitmq`, and `redis`.
- **Container Names & Labels**:
  - `container_name: clinicez-<service>`
  - `labels: ["project=clinicez", "environment=dev"]`
  - `expose: ["8080"]`

---

## 🎯 Code Quality & Principles

1. **SOLID & DRY**: Always design for single responsibility, open/closed extension, and zero duplication.
2. **Type Safety**: Strictly typed TypeScript with zero `any` unless explicitly required by external un-typed libraries. In C#, utilize nullable reference types (`<Nullable>enable</Nullable>`).
3. **No Dead Code**: Do not leave commented-out code, temporary debug scripts, or unused imports in production files.
