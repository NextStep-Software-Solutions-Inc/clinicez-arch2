# Clinic EZ Architecture & Ecosystem

Welcome to the **Clinic EZ** monorepo! This repository houses the unified next-generation multi-tenant platform architecture for Clinic EZ, supporting SaaS and on-premise deployments across Web, Mobile, and Desktop.

---

## 🏛️ Monorepo Structure

The monorepo follows an intuitive, modular, industry-standard layout:

```
clinicez/
├── apps/                                  # All client applications & user-facing frontends
│   ├── portal-web/                        # Next.js 16 Web Portal (Marketing, SuperAdmin, Tenant Workspace)
│   ├── patient-app/                       # Universal React Native Expo App (iOS, Android & Web)
│   ├── clinic-app/                        # [Roadmap] Cross-Platform Clinic Operational App (Web, Desktop, Tablet)
│   ├── laboratory-app/                    # [Roadmap] Cross-Platform Laboratory Operational App
│   └── pharmacy-app/                      # [Roadmap] Cross-Platform Pharmacy Operational App
│
├── services/                              # All backend microservices & APIs (.NET 10 / ASP.NET Core)
│   ├── portal-api/                        # Central Control Plane API (Tenants, Licensing, Billing, Facilities)
│   ├── patient-api/                       # Patient API (EHR records, sync engine, booking coordination)
│   ├── clinic-api/                        # Clinic Operational Microservice (Consultations, EHR, Triage)
│   ├── laboratory-api/                    # Laboratory Operational Microservice (LIS, Diagnostics)
│   ├── pharmacy-api/                      # Pharmacy Operational Microservice (PMS, Inventory, Dispensary)
│   ├── organization-api/                  # Umbrella Healthcare Network / Org Management
│   └── philhealth-proxy/                  # PhilHealth Konsulta Integration Gateway
│
├── packages/                              # Shared cross-cutting libraries
│   ├── shared-dotnet/                     # C# Shared Library (CLINICEZ.Shared: ApiResponse, Events, Exceptions)
│   └── shared-ts/                         # TypeScript Shared Library (@shared/safe utilities)
│
├── CLINICEZ.sln                           # Master .NET Solution file
├── Directory.Build.props                  # MSBuild compiler configuration
└── package.json                           # Bun / npm workspace root (apps/*, packages/*)
```

---

## 🚀 Getting Started

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (and .NET 9 for PhilHealthProxy)
- [Bun](https://bun.sh/) (v1.2+)
- [Docker & Docker Compose](https://www.docker.com/)

### 1. Build .NET Backend Services
Build all 35 service projects from the root solution file:
```powershell
dotnet restore CLINICEZ.sln
dotnet build CLINICEZ.sln --no-restore
```

### 2. Run the Web Portal (Marketing, SuperAdmin & Tenant Console)
```powershell
cd apps/portal-web
bun install
bun run dev
```
Navigate to `http://localhost:3000`.

### 3. Run the Central Control Plane API
```powershell
cd services/portal-api/MainPortalBE.Api
dotnet run
```
Interactive OpenAPI documentation is available at `https://localhost:7xxx/scalar/v1`.

### 4. Run the Patient App (Mobile & Web)
```powershell
cd apps/patient-app
bun install
# Start for Mobile (iOS / Android):
npx expo start
# Or start for Web:
npx expo start --web
```

---

## 🔒 Tenancy & Offline-First Strategy

1. **Patient App Offline-First**:
   - **Authentication & Booking**: Enforces online connectivity to authenticate via Clerk and secure appointment slots without collision.
   - **Medical Records**: Cached locally in SQLite via Drizzle ORM. Full read/write accessibility when offline, automatically synchronized through the background queue to `patient-api` upon reconnecting.
2. **Operational Apps (Clinic, Lab, Pharmacy)**:
   - Designed to run across Web, Desktop (Tauri), and Tablets.
   - For on-premise clinics, services run directly on the local LAN server via Docker Compose, guaranteeing 100% continuous care during network disruptions.