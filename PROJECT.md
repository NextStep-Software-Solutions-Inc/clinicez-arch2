# Project: ClinicEZ Tri-Domain Decoupling & Publishing Governance

## Architecture
ClinicEZ multi-tenant architecture decouples three distinct operational domains:
1. **Facility Network Domain (B2B Interoperability)**:
   - Governs cross-tenant inter-facility communication and clinical routing (e.g., clinic-to-laboratory requisitions, billing transmittals).
   - Handled via `portal-api`, `packages/shared-dotnet/Interop`, and `services/interop-hub` using ECDSA P-256 signed envelopes and `FacilityVisibility` (`Private`, `Network`, `Public`).
2. **Online Presence Domain (Patient Directory Discovery)**:
   - Governs public discovery on the consumer patient mobile app directory (`apps/patient-app` and `services/patient-api`).
   - Controlled by a two-tier publishing model:
     - Tier 1: Workspace owner controls master directory eligibility (`IsPatientDiscoveryEligible`) in `portal-web` / `portal-api`. Newly provisioned facilities default to `Draft / Private`.
     - Tier 2: Clinic manager in `clinic-app` / `clinic-api` verifies pre-flight readiness (Operating Hours, Licensed Doctors with PRC numbers, Service Catalog), toggles "Publish to Patient Directory", and dynamically toggles "Pause Online Booking".
   - Synchronized downstream to `patient-api`'s PostgreSQL database (`Clinics` and `ClinicHealthcareProviders` tables) via resilient Interop Hub event `facility.directory.updated`.
3. **Service Catalog & Clinical Intake Domain (Booking & Gated Access)**:
   - Governs patient booking and intake access to clinical procedures, doctor schedules, and slots.
   - Supports hybrid gated access for institutions with public online profiles but restricted intake (e.g. campus health centers like USTP CDO - UHC, corporate occupational health clinics):
     - Public clinic profile card (address, hours, contact, accreditation) is discoverable by all patients.
     - Clinical services and doctor appointment booking remain locked until unlocked via a 6-character Clinic Join Code / reception QR scan, or linked partner Organization membership.

```
+-----------------------------------------------------------------------------------------+
|                                    WORKSPACE LEVEL                                      |
|  portal-web / portal-api: Workspace Admin sets IsPatientDiscoveryEligible               |
|  Default: Draft / Private (not visible in patient directory)                            |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------------+
|                                    FACILITY LEVEL                                       |
|  clinic-app / clinic-api: Clinic Admin verifies Readiness Checklist:                    |
|  - Operating Hours defined                                                              |
|  - Licensed Doctors with PRC license numbers                                            |
|  - Active Service Catalog items                                                         |
|  Actions: "Publish to Directory" & Dynamic "Pause Online Booking" Toggle                |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼ Interop Hub Event: facility.directory.updated
+-----------------------------------------------------------------------------------------+
|                                     INTEROP HUB                                         |
|  Resilient Outbox / Relay forwards validated envelope to patient-api                    |
|  Authorizes both Portal control plane and Clinic facility senders                       |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------------+
|                                     CONSUMER LEVEL                                      |
|  patient-api: Upserts Clinics, ClinicHealthcareProviders, ClinicServices.               |
|  CatalogSeeder hardened: zero deletion of real tenant clinics; real clinics prioritized.|
|  patient-app: Discover / Explore screens render published clinics.                      |
|  - Public Clinic: Open service catalog & appointment booking.                           |
|  - Hybrid Gated Clinic: Public profile card + Locked Catalog CTA                        |
|    (Unlock via 6-char Join Code / QR Scan or Partner Organization membership).          |
+-----------------------------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Master Directory Eligibility (`IsPatientDiscoveryEligible`) | Workspace owner control in `portal-api` & `portal-web`. Newly created facilities default to `Draft / Private`. | M1, M2 | Survey 1.1, 2.1 |
| 2 | Facility Readiness Evaluation & Checklist | Enforce Operating Hours, Licensed Doctors with PRC numbers, and Active Services before publishing in `clinic-api` & `clinic-app`. | M1, M2 | Survey 1.2, 2.2 |
| 3 | Clinic Publishing & Booking Pause Controls | Clinic manager toggles "Publish to Patient Directory" and dynamically toggles "Pause Online Booking" in `clinic-api` & `clinic-app`. | M1, M2 | Survey 1.2, 2.2 |
| 4 | Resilient Interop Hub Directory Synchronization | Event `facility.directory.updated` carries services and booking status; `patient-api` handler accepts clinic & portal senders and upserts PostgreSQL `Clinics`, `Providers`, `Services`. | M1 | Survey 1.3 |
| 5 | Catalog Seeder Hardening & Real Clinic Prioritization | Prevent `CatalogSeeder.cs` from wiping real synced tenant clinics on dev startup; prioritize real clinics over demo seeds. | M1 | Survey 1.4 |
| 6 | Hybrid Gated Intake Access Backend | `patient-api` endpoints support gated clinic detail, join code unlock (`JoinClinicByCodeCommand`), and organization membership resolution. | M1 | Survey 1.4 |
| 7 | Workspace Governance UI in `portal-web` | Add "Enable Patient App Discovery" toggle and status badges in `FacilitySettingsHub.tsx` conforming to `@clinicez/design-tokens`. | M2 | Survey 2.1 |
| 8 | Clinic Governance & Capacity Workstation in `clinic-app` | Readiness checklist card with Operating Hours, Directory Publishing switch, and Capacity Pause switch conforming to `@clinicez/design-tokens`. | M2 | Survey 2.2 |
| 9 | Patient App Discovery of Published Clinics | Patient app displays published clinics in `/clinics` search and Explore tab, filtering out unpublished/draft clinics. | M3 | Survey 3.1 |
| 10 | Hybrid Gated Service Catalog UI in `patient-app` | `<GatedServiceCatalogLockedCard>` displaying public clinic details with "Enter Join Code / Scan QR" CTA and "Join Partner Organization". | M3 | Survey 3.2 |
| 11 | Join Code & QR Scan Unlock Modal in `patient-app` | Interactive 6-character code entry and QR scan to unlock clinic services and booking in real time. | M3 | Survey 3.2 |
| 12 | Design System Compliance & Quality Audit | Zero raw hex values, 4-state UI coverage, clinical urgency tokens across all apps, and passing automated test suites. | M4 | Survey 1.5, 2.3, 3.3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Tri-Domain Backend Models, Governance & Interop Sync | `portal-api`, `clinic-api`, `patient-api`, `packages/shared-dotnet`, `interop-hub` | none | DONE |
| M2 | Two-Tier Governance UI in Portal & Clinic App | `apps/portal-web`, `apps/clinic-app` | M1 | DONE |
| M3 | Patient App Public Discovery & Hybrid Gated Intake | `apps/patient-app` | M1, M2 | DONE |
| M4 | E2E Testing, Token Audits & Regression Defense | All apps, test runners, token linters | M1, M2, M3 | DONE |

## Interface Contracts

### 1. `portal-api` ↔ Workspace Admins
- `Facility`:
  - `IsPatientDiscoveryEligible`: bool (default `false`)
- `PUT /api/v1/facilities/{id}/discovery-eligibility`:
  - Request: `{ isEligible: boolean }`
  - Response: HTTP 200 `{ facilityId, isEligible, updatedAt }`

### 2. `clinic-api` ↔ Clinic Managers
- `ClinicSettings`:
  - `IsDirectoryPublished`: bool (default `false`)
  - `IsOnlineBookingPaused`: bool (default `false`)
- `GET /api/v1/clinic-settings/readiness`:
  - Response: `{ isReady: boolean, checks: { hasOperatingHours: bool, hasLicensedDoctors: bool, hasActiveServices: bool, hasLetterhead: bool } }`
- `PUT /api/v1/clinic-settings/directory-publishing`:
  - Request: `{ isPublished: boolean }`
  - Validates `isReady && isWorkspaceEligible`. Enqueues `facility.directory.updated`.
- `PUT /api/v1/clinic-settings/booking-pause`:
  - Request: `{ isPaused: boolean }`
  - Enqueues `facility.directory.updated`.

### 3. Interop Hub Event: `facility.directory.updated`
- Topic / Type: `InteropTypes.FacilityDirectoryUpdated` (`"facility.directory.updated"`)
- Senders Authorized:
  - `Party.Portal`
  - `Party.ForFacility(facilityId, FacilityType.Clinic)`
- Payload (`FacilityCreatedEvent` / directory contract):
  - `ResourceId`: Guid
  - `TenantId`: Guid
  - `Name`: string
  - `FacilityType`: FacilityType
  - `IsPublic`: bool (`IsPatientDiscoveryEligible && IsDirectoryPublished`)
  - `SupportsAppointments`: bool (`!IsOnlineBookingPaused`)
  - `IsGated`: bool (true if clinic has private service catalog)
  - `JoinCode`: string? (6-character code)
  - `OperatingHours`: string?
  - `Providers`: IReadOnlyList<FacilityProviderDto>
  - `Services`: IReadOnlyList<ClinicServiceDto>

### 4. `patient-api` ↔ `patient-app`
- `GET /api/v1/clinics`:
  - Returns published clinics (`IsPublic == true`), sorted by `FeaturedScore` descending, then name.
- `GET /api/v1/clinics/{id}`:
  - Response: `{ id, name, address, operatingHours, accreditation, isGated, isUnlocked, isBookingPaused, services: [...], providers: [...] }`
  - If `isGated && !isUnlocked`, `services` and `providers` are redacted/empty with `isUnlocked: false`.
- `POST /api/v1/clinics/{id}/unlock`:
  - Request: `{ joinCode?: string, organizationId?: Guid }`
  - Response: `{ success: boolean, isUnlocked: boolean, message?: string }`

## Code Layout
- `services/portal-api/`: Workspace & facility management, master directory eligibility.
- `services/clinic-api/`: Clinic settings, readiness evaluator, publishing commands, capacity pause.
- `services/patient-api/`: Consumer clinic catalogue, seeder hardening, hybrid gated access handler.
- `packages/shared-dotnet/`: Interop contracts, `FacilityCreatedEvent`, common DTOs.
- `apps/portal-web/`: Next.js workspace admin UI, `FacilitySettingsHub.tsx`.
- `apps/clinic-app/`: React Native Expo clinic workstation, `FacilityReadinessTab.tsx`, `Settings.screen.tsx`.
- `apps/patient-app/`: React Native Expo consumer patient app, `ExploreClinics.screen.tsx`, `ClinicDetails.screen.tsx`, `GatedServiceCatalogLockedCard.tsx`.
- `packages/design-tokens/`: Semantic tokens, typography, radii, palettes.
