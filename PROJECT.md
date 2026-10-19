# Project: Universal Pluggable Search Provider Framework across ClinicEZ

## Architecture
- **Layer 1: Shared Platform Standards (`packages/shared-dotnet` & `packages/shared-ts`)**:
  - C# contracts (`ISearchProvider`, `SearchResultItemDto`, `SearchResponseDto`, `SearchBadgeDto`, `SearchQuery`) and reflection-based assembly scanning extension (`AddPluggableSearch<TAssemblyMarker>()`) in `packages/shared-dotnet/Search/`.
  - TypeScript registry (`UniversalSearchRegistry`, singleton `universalSearchRegistry`), `SearchContributor`, `SearchItem`, and DTOs in `packages/shared-ts/search/`.
  - Decoupled, zero-dependency foundation enabling any backend microservice and frontend app to register domain entities dynamically.
- **Layer 2: Clinic Backend Pluggable Service (`services/clinic-api`)**:
  - MediatR query `GlobalClinicSearchQuery` and orchestrator `GlobalClinicSearchQueryHandler` executing active providers concurrently via `Task.WhenAll` with 500ms timeout, fault-isolated try-catch, tenant isolation (`ClinicId == CurrentClinicId`), and RBAC permission checks (`HasPermission`).
  - 7 domain feature search providers in feature folders: `PatientSearchProvider`, `ConsultationSearchProvider`, `AppointmentSearchProvider`, `SettingSearchProvider`, `QueueSearchProvider`, `BillingSearchProvider`, `LabOrderSearchProvider`.
  - REST API endpoint `SearchController` (`GET /api/v1/search?q={query}&category={category}&limit={limit}`).
- **Layer 3: Clinic Workstation Command Palette UX (`apps/clinic-app`)**:
  - Header search trigger pill in `ClinicHeaderBar` and global hotkey listener (`Cmd+K`, `Ctrl+K`, `/` outside inputs, `Esc`) in `workstationShortcuts.web.ts`.
  - Command palette `GlobalSearchModal` with 200ms debouncing, dynamic category tabs, arrow-key navigation, 4 explicit UI states (skeleton loading, empty state, zero-state quick actions, active results with semantic urgency badges: routine/urgent/emergency/neutral).
  - Direct deep navigation dispatch to clinical records and Settings tabs (`general`, `services`, `staff`, `access`/`rbac`, `facility`/`readiness`, `philhealth`, `license`, `audit`).
  - Strict compliance with `@clinicez/design-tokens` (brand teal `#0D6963`, semantic colors, 0 raw hex codes).
- **Layer 4: Portal Web Cross-App Integration (`apps/portal-web`)**:
  - Integration of `@shared/safe/search` registry into `WorkspaceSearchDialog.tsx` for cross-platform unified search parity.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `ISearchProvider` C# Interface | Universal contract for pluggable backend search providers | M1 | Survey |
| 2 | `SearchResultItemDto` & DTOs | Unified immutable records for search items and envelopes | M1 | Survey |
| 3 | `AddPluggableSearch<T>` DI Extension | Reflection assembly scanning for zero-touch provider registration | M1 | Survey |
| 4 | Shared TS Registry & Contributor | `universalSearchRegistry.ts` and `SearchContributor` contracts | M1 | Survey |
| 5 | Shared Contracts Unit Tests | Tests for shared .NET and TS search contracts and registry | M1 | Survey |
| 6 | `GlobalClinicSearchQuery` & Handler | MediatR concurrent orchestrator using `Task.WhenAll` | M2 | Survey |
| 7 | Backend Fault Tolerance & Timeout | 500ms linked CTS timeout and per-provider try-catch isolation | M2 | Survey |
| 8 | Multi-Tenant & Clinic Isolation | Enforcement of `ClinicId == CurrentClinicId` across all queries | M2 | Survey |
| 9 | RBAC Permission Pre-Filtering | Skipping unpermitted providers before query execution | M2 | Survey |
| 10 | `PatientSearchProvider` | Queries patients by name, PIN, code, DOB, contact, Senior/PWD | M2 | Survey |
| 11 | `ConsultationSearchProvider` | Queries encounters by SOAP notes, diagnoses, ICD-10, clinician | M2 | Survey |
| 12 | `AppointmentSearchProvider` | Queries appointments by patient, doctor, date, status, reason | M2 | Survey |
| 13 | `QueueSearchProvider` | Queries active OPD tickets by number, priority, station | M2 | Survey |
| 14 | `LabOrderSearchProvider` | Queries diagnostic orders by order number, test name, panic flags | M2 | Survey |
| 15 | `BillingSearchProvider` | Queries financial records by invoice number, patient, balance | M2 | Survey |
| 16 | `SettingSearchProvider` | Queries rooms, services catalog & fees, staff roster, facility info | M2 | Survey |
| 17 | `SearchController` REST Endpoint | `GET /api/v1/search` with whitespace query early return | M2 | Survey |
| 18 | Backend Unit & Integration Tests | Automated test suite for query handler and 7 providers | M2 | Survey |
| 19 | Clinic Header Bar Search Pill | Desktop search input pill and mobile search icon in `ClinicHeaderBar` | M3 | Survey |
| 20 | Workstation Global Hotkeys | `Cmd+K`, `Ctrl+K`, and `/` outside inputs with `isInput` guard | M3 | Survey |
| 21 | Debounced Query Execution (200ms) | Keystroke debounce delaying network queries by 200ms | M3 | Survey |
| 22 | Command Palette 4 UI States | Skeletons, empty state, zero-state quick actions, active results | M3 | Survey |
| 23 | Dynamic Category Filter Tabs | Horizontal category pills dynamically derived from active providers | M3 | Survey |
| 24 | Keyboard Result Navigation | Arrow Up/Down navigation, active index highlight, Enter dispatch, Esc | M3 | Survey |
| 25 | Deep Navigation Dispatch | Direct routing to target records and Settings tabs | M3 | Survey |
| 26 | Design Token Governance | Strict `@clinicez/design-tokens` compliance (0 raw hex codes) | M3 | Survey |
| 27 | Portal Web Search Integration | Integration of shared registry into `WorkspaceSearchDialog.tsx` | M4 | Survey |
| 28 | Comprehensive E2E Verification | 100% pass of Tiers 1-4 E2E tests and Tier 5 adversarial hardening | M5 | Survey |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Shared Platform Search Standards | `packages/shared-dotnet/Search/` and `packages/shared-ts/search/` | none | IN_PROGRESS |
| M2 | Clinic Backend Pluggable Search Core & 7 Feature Providers | `services/clinic-api` MediatR orchestrator, 7 domain providers, `SearchController`, unit tests | M1 | PLANNED |
| M3 | Clinic Workstation Command Palette UX & Deep Navigation | `apps/clinic-app` `GlobalSearchModal`, `ClinicHeaderBar`, shortcuts, category tabs, deep navigation | M1, M2 | PLANNED |
| M4 | Portal Web Cross-App Integration | `apps/portal-web` `WorkspaceSearchDialog` integration with shared search | M1 | PLANNED |
| M5 | Final Milestone: 100% E2E Test Pass & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4) and Tier 5 adversarial stress testing | M2, M3, M4 | PLANNED |

---

## Interface Contracts

### Shared .NET (`packages/shared-dotnet/Search/`)
- `ISearchProvider`:
  - `string Category { get; }`
  - `int Priority { get; }`
  - `string? RequiredPermission { get; }`
  - `Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(string query, Guid tenantId, int limit, CancellationToken ct);`
- `SearchResultItemDto(string Id, string Category, string Title, string Subtitle, string? BadgeText, string? BadgeVariant, string TargetRoute, Dictionary<string, string>? RouteParams, SearchBadgeDto? Badge)`
- `SearchResponseDto(IReadOnlyList<SearchResultItemDto> Items, int TotalCount)`
- `SearchServiceExtensions.AddPluggableSearch<TAssemblyMarker>(IServiceCollection services)`

### Shared TypeScript (`packages/shared-ts/search/`)
- `SearchBadgeVariant`: `'routine' | 'urgent' | 'emergency' | 'neutral'`
- `SearchItem`: `{ id, category, title, subtitle, badgeText?, badgeVariant?, targetRoute, routeParams?, onSelect? }`
- `SearchContributor`: `{ id, category, categoryLabel, priority?, requiredPermission?, search: (query, signal?) => Promise<SearchItem[]> | SearchItem[] }`
- `universalSearchRegistry`: `{ register(contributor), unregister(id), getContributors(), getCategories(), clear() }`

### REST API (`GET /api/v1/search`)
- Query parameters: `q` (string, required), `category` (string, optional), `limit` (int, optional, default 20)
- Response: `ApiResponse<SearchResponseDto>`

---

## Code Layout
- `packages/shared-dotnet/Search/`
  - `ISearchProvider.cs`
  - `SearchResultItemDto.cs`
  - `SearchResponseDto.cs`
  - `SearchBadgeDto.cs`
  - `SearchQuery.cs`
  - `SearchServiceExtensions.cs`
- `packages/shared-dotnet.Tests/Search/`
  - `SearchPluggableFrameworkTests.cs`
- `packages/shared-ts/search/`
  - `dto.ts`
  - `searchRegistry.ts`
  - `index.ts`
- `packages/shared-ts/`
  - `search.test.ts`
  - `index.ts` (re-exports `./search`)
- `services/clinic-api/ClinicEz.Clinic.Application/`
  - `Features/Search/Queries/GlobalClinicSearchQuery.cs`
  - `Features/Search/Queries/GlobalClinicSearchQueryHandler.cs`
  - `Features/Patients/Search/PatientSearchProvider.cs`
  - `Features/Consultations/Search/ConsultationSearchProvider.cs`
  - `Features/Appointments/Search/AppointmentSearchProvider.cs`
  - `Features/Queue/Search/QueueSearchProvider.cs`
  - `Features/LabOrders/Search/LabOrderSearchProvider.cs`
  - `Features/Billing/Search/BillingSearchProvider.cs`
  - `Features/Settings/Search/SettingSearchProvider.cs`
  - `DependencyInjection.cs`
- `services/clinic-api/ClinicEz.Clinic.Api/Controllers/`
  - `SearchController.cs`
- `services/clinic-api/ClinicEz.Clinic.Application.Tests/Features/Search/`
  - `GlobalClinicSearchQueryHandlerTests.cs`
  - `DomainSearchProvidersTests.cs`
- `apps/clinic-app/`
  - `components/search/GlobalSearchModal.tsx`
  - `components/search/SearchResultItemRow.tsx`
  - `components/search/SearchCategoryTabs.tsx`
  - `components/search/GlobalSearchProvider.tsx`
  - `components/layout/ClinicHeaderBar.tsx`
  - `components/layout/ResponsiveLayout.tsx`
  - `utils/workstationShortcuts.web.ts`
  - `utils/workstationShortcuts.ts`
  - `services/clinicService.ts`
  - `tests/globalSearchModal.test.ts`
- `apps/portal-web/`
  - `src/components/dashboard/WorkspaceSearchDialog.tsx`
