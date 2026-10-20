# Project: ClinicEZ Dental Clinic Service Catalog Integration

## Architecture
This project extends the ClinicEZ Service Catalog across backend (`services/clinic-api`) and frontend (`apps/clinic-app`) to provide first-class support for Dental Clinics.
- **Backend Clean Architecture (`services/clinic-api`)**:
  - `ClinicServiceItem` domain entity supports `"Dental"` as a canonical category.
  - `DentalCatalogDefaults` defines 10 Philippine primary care dental service presets.
  - `GetClinicServicesQueryHandler` inspects `ClinicSettings.SpecialtyMode` when the fee schedule is empty:
    - `"Dental"` -> auto-seeds the 10 dental presets.
    - `"MultiSpecialty"` -> auto-seeds general medical primary care + 10 dental presets (19 total).
    - `"Medical"` (or unspecified) -> seeds general medical defaults (9 items).
  - `SeedDentalServicesCommand` provides idempotent on-demand preset population without duplicating or overwriting customized items.
  - `ServicesController` exposes `POST /api/v1/services/seed-dental` guarded by `[HasPermission(ClinicPermissions.ServicesManage)]`.
  - `PublishClinicToDirectoryCommand` includes active dental catalog items in directory events and maps `"Dental Clinic"`.
- **Frontend Architecture (`apps/clinic-app`)**:
  - `clinicService.ts` exposes `seedDentalServices()` invoking `/api/v1/services/seed-dental`.
  - `ServicesCatalogTab.tsx` maps `'Dental': 'Dental Services'`, renders filter chips with counts, enables `'Dental'` in Add/Edit modals, and provides an "Add Dental Services" button with loading and toast feedback.
  - `OrderCatalogSearchModal.tsx` supports `'Dental'` category tab, displays 5 clinical instruction chips (`Local anesthesia (Infiltration)`, `Mandibular nerve block`, `Rubber dam isolation`, `Post-extraction care instructions`, `Suture removal 7 days`), and includes dental in `'Procedure'` tab.
  - `Consultations.screen.tsx` opens order modal on `'Dental'` tab when clicking quick-order from the odontogram (`InlineDentalChartCard`), and includes `'dental'` in `procedureCatalog` so ordered dental procedures seamlessly populate Cashier invoice billing upon signing.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Canonical Dental Defaults | 10 canonical dental presets in `DentalCatalogDefaults.cs` (`DENT-CONS` to `DENT-PULP`) | M1 | R1 |
| 2 | Specialty-Aware Auto-Seeding | `GetClinicServicesQueryHandler` auto-seeds based on `ClinicSettings.SpecialtyMode` | M1 | R1 |
| 3 | First-Class Dental Category | Document and support `"Dental"` category on `ClinicServiceItem` | M1 | R1 |
| 4 | Idempotent Seed Command | `SeedDentalServicesCommand` adds missing dental presets without duplicating existing items | M1 | R2 |
| 5 | Seed Dental API Endpoint | `POST /api/v1/services/seed-dental` guarded with `[HasPermission(ClinicPermissions.ServicesManage)]` | M1 | R2 |
| 6 | Directory Publishing Verification | Active dental catalog items published via `PublishClinicToDirectoryCommand` with classification `"Dental Clinic"` | M1 | R5 |
| 7 | Backend Unit & Integration Tests | Tests in `ServicesCatalogTests.cs`, `Dental` filter, and `PublishClinicToDirectoryTests.cs` | M1 | Acceptance |
| 8 | Frontend Services API Client | `seedDentalServices()` method in `apps/clinic-app/services/clinicService.ts` | M2 | R3 |
| 9 | Services Catalog Category Mapping | `'Dental': 'Dental Services'` in `SERVICE_CATEGORY_LABEL` and category filter chips with counts | M2 | R3 |
| 10 | Services Catalog Modals Category | Support `'Dental'` in Add Service and Edit Service modal category selectors | M2 | R3 |
| 11 | "Add Dental Services" Button | Prominent button in `ServicesCatalogTab.tsx` with loading state and toast feedback | M2 | R3 |
| 12 | Order Catalog Modal Category Tab | Add `'Dental'` to `CategoryTab` and `CATEGORY_TABS` in `OrderCatalogSearchModal.tsx` | M2 | R4 |
| 13 | Order Catalog Dental Filtering | When `selectedCategory === 'Dental'`, filter dental items; when `'Procedure'`, include dental | M2 | R4 |
| 14 | Dental Clinical Instruction Chips | 5 dental clinical instruction chips rendered when dental category or tooth number is active | M2 | R4 |
| 15 | Odontogram Quick Order Pre-Selection | `handleQuickOrderDentalProcedure` sets `orderSearchInitialCategory('Dental')` | M2 | R4 |
| 16 | Procedure Catalog & Cashier Invoicing | `procedureCatalog` includes `'dental'`, mapping to Cashier invoice lines upon encounter signing | M2 | R4 |
| 17 | Frontend Unit Tests | `apps/clinic-app/tests/dentalServiceCatalog.test.ts` covering catalog, modal, and odontogram order flow | M2 | Acceptance |
| 18 | Design Token & Strict Audit | Zero raw hex colors, strict token compliance with `@clinicez/design-tokens` | M2 | R5 |
| 19 | Opaque-Box E2E Testing Suite | Multi-tier test suite validating full end-to-end dental catalog workflows | E2E Track | Dual Track |
| 20 | Final Milestone Acceptance | 100% pass across all backend tests, frontend tests, and E2E test suite | M3 (Final) | Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite (`TEST_INFRA.md`, `TEST_READY.md`) | none | DONE |
| M1 | Backend Catalog & Seeding | R1, R2, R5 (backend defaults, query auto-seeding, command, controller, tests) | none | DONE |
| M2 | Frontend Catalog UI & Order Integration | R3, R4, R5 (UI tabs, chips, modal, quick-order, cashier billing, tests) | M1 contract | DONE |
| M3 | Final E2E Verification & Hardening | Phase 1: 100% E2E test pass; Phase 2: Adversarial coverage hardening | M1, M2, E2E | DONE |

## Interface Contracts
### `services/clinic-api` ↔ `apps/clinic-app`
- **Endpoint**: `POST /api/v1/services/seed-dental`
  - Authorization: `[HasPermission(ClinicPermissions.ServicesManage)]`
  - Request: Empty body
  - Response: `ApiResponse<List<ClinicServiceItemDto>>`
  - DTO schema:
    ```typescript
    interface ClinicServiceItem {
      id: string;
      tenantId: string;
      clinicId: string;
      code: string;
      name: string;
      category: string; // e.g. "Dental"
      standardPrice: number;
      description?: string;
      isActive: boolean;
      philHealthCode?: string;
      philHealthDescription?: string;
      isPhilHealthFormulary?: boolean;
    }
    ```
- **Order Modal to Consultation Quick Action Contract**:
  - Prop: `initialCategory?: 'Diagnostic' | 'Procedure' | 'Dental' | 'All'`
  - Prop: `initialToothNumber?: number`
  - Prop: `initialToothSurface?: string`
  - Emitted order item:
    ```typescript
    {
      serviceItemId?: string;
      code?: string;
      name: string;
      category: 'Dental';
      standardPrice: number;
      instructions: string;
      toothNumber?: number;
      toothSurface?: string;
      fulfillmentMode: 'in_house';
    }
    ```

## Code Layout
- Backend Domain: `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicServiceItem.cs`
- Backend Application Common: `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Common/DentalCatalogDefaults.cs`
- Backend Application Common: `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Common/GeneralMedicalCatalogDefaults.cs`
- Backend Application Queries: `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Queries/GetClinicServicesQuery.cs`
- Backend Application Commands: `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Commands/SeedDentalServicesCommand.cs`
- Backend API Controllers: `services/clinic-api/ClinicEz.Clinic.Api/Controllers/ServicesController.cs`
- Backend Tests: `services/clinic-api/ClinicEz.Clinic.Application.Tests/ServicesCatalogTests.cs`
- Backend Tests: `services/clinic-api/ClinicEz.Clinic.Application.Tests/Features/Settings/PublishClinicToDirectoryTests.cs`
- Frontend Service Client: `apps/clinic-app/services/clinicService.ts`
- Frontend Settings UI: `apps/clinic-app/components/settings/ServicesCatalogTab.tsx`
- Frontend Consultation Modal: `apps/clinic-app/components/consultation/OrderCatalogSearchModal.tsx`
- Frontend Consultation Screen: `apps/clinic-app/navigation/screens/Consultations.screen.tsx`
- Frontend Unit Tests: `apps/clinic-app/tests/dentalServiceCatalog.test.ts`
