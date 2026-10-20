# Project: Clinic Analytics and Statutory Reports Hardening

## Architecture
- **Layer 1: Shared Platform Standards (`packages/shared-dotnet`)**:
  - `TenantPrintoutConfig` with `TaxIdentificationNumber` and branding metadata.
  - `TenantLetterheadComponent` and `DocumentFooterComponent` with legal disclaimers, page numbering (`Page X of Y`), and cryptographic stamps.
  - `IDocumentSecurityService` (HMAC-SHA256 canonical digest `SEC-SHA256-{hex}`) and `IQrCodeService` (PNG byte matrix).
- **Layer 2: Clinic Backend Data & Query Engine (`services/clinic-api/ClinicEz.Clinic.Application` & `Infrastructure`)**:
  - Elimination of all mock fallbacks (dummy doctors, hardcoded diagnoses, static wait/consult times, fictitious invoices, hardcoded clinic names).
  - Server-side EF Core database aggregations (`SumAsync`, `CountAsync`, `GroupBy` projections) across reports.
  - `ApplicationDbContext.cs` composite temporal indexes on `(TenantId, ClinicId, Date)` for `ConsultationEncounters`, `PaymentRecords`, `ClinicalProcedures`, `ClinicLabOrders`, and `QueueItems`, plus query filter on `PaymentRecord`.
  - `ClinicSettings` integration: dynamic retrieval of clinic metadata (`ClinicName`, `DefaultConsultationFee`, `DefaultDoctorSharePercentage`).
  - QuestPDF vector report generation in `ClinicDocumentPdfService.cs` implementing `IClinicDocumentPdfService`.
  - Dedicated REST streaming endpoints in `ReportsController.cs` (`GET /api/v1/reports/{reportType}/pdf`).
- **Layer 3: Workstation Frontend & Interactive Charting (`apps/clinic-app`)**:
  - Pure vector SVG chart components in `apps/clinic-app/components/analytics/` (`TrendLineChart`, `WorkloadBarChart`, `TenderDonutChart`, `MorbidityDistributionChart`) using `react-native-svg` and `@clinicez/design-tokens`.
  - 4 core UI/UX states (Skeleton loader, Empty state with CTA, Error state with retry, Active data).
  - Interactive hover/touch tooltips, filter toggles, responsive scaling (<768px, 768-1023px, >=1024px), and Philippine Peso `₱` currency formatting.
  - `Dashboard.screen.tsx` modernization: removal of `maxWidth: theme.sizes.contentMaxWidth` on desktop, rich analytics layout, and complete replacement of raw monospace `<pre>` print modal with official QuestPDF vector streaming.
- **Layer 4: Dual Track Verification & Quality Gates**:
  - Parallel E2E Testing Track producing opaque-box requirement-driven test suite (Tiers 1-4) published via `TEST_READY.md`.
  - Final Milestone Phase 1 (100% E2E test pass) and Phase 2 (Adversarial coverage hardening).
  - Strict compliance with `bun run lint:tokens` (0 violations) and `bun run lint:hosts` (0 violations).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Remove Analytics Mock Wait/Consult Durations | Eliminate fallback 14.5m wait / 18.0m consult; return genuine 0.0 | M1 | Survey |
| 2 | Remove Analytics Mock Diagnoses | Eliminate hardcoded I10/J06.9/E11.9 fallback list in `GetClinicAnalyticsQuery` | M1 | Survey |
| 3 | Remove Morbidity Mock Diseases & Demographics | Eliminate 35yo male default and hardcoded DOH top 5 diseases in `GetMorbidityReportQuery` | M1 | Survey |
| 4 | Remove Hardcoded Clinic Name | Retrieve clinic name from `ClinicSettings` instead of hardcoded string | M1 | Survey |
| 5 | Remove Tax Discount Mock Invoices | Eliminate fake Maria Santos / Antonio Reyes mock invoices in `GetTaxDiscountAuditReportQuery` | M1 | Survey |
| 6 | Remove Doctor Shares Mock Doctors & Hardcoded Fee | Eliminate dummy doctors (Dr. Cruz/Reyes/Santos) and hardcoded ₱500 fee | M1 | Survey |
| 7 | Add DefaultDoctorSharePercentage to ClinicSettings | Configurable physician share percentage (default 70%) in `ClinicSettings` | M1 | Survey |
| 8 | Server-Side EF Core Aggregations for Daily EOD | Refactor unpaged `ToListAsync` to DB `GroupBy`, `SumAsync`, `CountAsync` projections | M1 | Survey |
| 9 | Server-Side EF Core Aggregations for Analytics | Refactor flow telemetry, revenue trend, tender shares, top services to DB | M1 | Survey |
| 10 | Server-Side EF Core Aggregations for Morbidity | Database-level projection and aggregation of ICD-10 diagnoses | M1 | Survey |
| 11 | Server-Side EF Core Aggregations for Tax Discounts | Direct projection to `TaxDiscountAuditRowDto` with DB sums | M1 | Survey |
| 12 | Server-Side EF Core Aggregations for Doctor Shares | Server-side grouped queries for encounters, procedures, and doctor revenue | M1 | Survey |
| 13 | Composite Temporal Indexes in ApplicationDbContext | Add `(TenantId, ClinicId, Date)` indexes on Encounters, Payments, Procedures, LabOrders, Queue | M1 | Survey |
| 14 | PaymentRecord Global Query Filter | Enforce multi-tenant `!e.IsDeleted && e.ClinicId == CurrentClinicId` on `PaymentRecord` | M1 | Survey |
| 15 | Backend Empty-Dataset Test Suite | Automated unit tests asserting genuine zeroes and empty lists on empty date ranges | M1 | Survey |
| 16 | TenantPrintoutConfig TIN Support | Add `TaxIdentificationNumber` to `TenantPrintoutConfig` and `TenantLetterheadComponent` | M2 | Survey |
| 17 | IClinicDocumentPdfService Reports Extension | Interface method contracts for all 5 operational and statutory reports | M2 | Survey |
| 18 | Daily EOD Reconciliation QuestPDF Builder | Multi-section vector PDF with census, financial summary, tender breakdown, sign-off | M2 | Survey |
| 19 | DOH Outpatient Morbidity QuestPDF Builder | Multi-page statutory disease report with age/sex cohorts and Repeating Header | M2 | Survey |
| 20 | BIR Tax & Discount Audit QuestPDF Builder | Multi-page statutory audit report with Senior/PWD discounts, VAT exempt sales, OR tracking | M2 | Survey |
| 21 | Doctor Shares Settlement QuestPDF Builder | Multi-page physician fees and facility retention settlement report | M2 | Survey |
| 22 | Executive Clinic Analytics QuestPDF Builder | Comprehensive analytics report with KPI telemetry, trends, tenders, top services | M2 | Survey |
| 23 | Cryptographic Tamper Seal & Security Digest | Canonical HMAC-SHA256 hash (`SEC-SHA256-`) stamped in statutory footers | M2 | Survey |
| 24 | Embedded QR Verification Code | Generated PNG QR matrix linking to document verification URL | M2 | Survey |
| 25 | ReportsController 5 Streaming PDF Endpoints | `GET /api/v1/reports/{reportType}/pdf` streaming vector PDF with `[HasPermission]` | M2 | Survey |
| 26 | Backend QuestPDF Generation Tests | Unit tests verifying valid PDF byte generation and empty-dataset handling | M2 | Survey |
| 27 | TrendLineChart SVG Component | Interactive line chart with revenue/visits toggle, hover/touch tooltips, 4 states | M3 | Survey |
| 28 | WorkloadBarChart SVG Component | Interactive bar chart with encounters/revenue toggle, rounded bars, tooltips, 4 states | M3 | Survey |
| 29 | TenderDonutChart SVG Component | Interactive donut chart with semantic token colors, center cutout KPI, 4 states | M3 | Survey |
| 30 | MorbidityDistributionChart SVG Component | Ranked horizontal bars with demographic age sub-bars, filter toggles, 4 states | M3 | Survey |
| 31 | Pure SVG & Zero External Chart Library | Implement all charts purely with `react-native-svg` and `@clinicez/design-tokens` | M3 | Survey |
| 32 | Design Token Audit Compliance | Strict `@clinicez/design-tokens` compliance (`bun run lint:tokens` 0 violations) | M3 | Survey |
| 33 | Network Isolation Audit Compliance | Strict LAN isolation (`bun run lint:hosts` 0 violations) | M3 | Survey |
| 34 | Chart Components Unit Tests | Comprehensive component unit tests covering all 4 states, scaling, and math edge cases | M3 | Survey |
| 35 | Full-Width Desktop Workstation Layout | Remove `maxWidth: theme.sizes.contentMaxWidth` constraint in `Dashboard.screen.tsx` | M4 | Survey |
| 36 | Analytics Tab Charting Integration | Embed `TrendLineChart`, `TenderDonutChart`, `MorbidityDistributionChart`, `WorkloadBarChart` | M4 | Survey |
| 37 | Frontend PDF Streaming URL Helpers | Add client helpers in `clinicService.ts` for all 5 report PDF endpoints | M4 | Survey |
| 38 | Elimination of Legacy Monospace Print Dialog | Remove raw ASCII text generator and `<pre>` modal in `Dashboard.screen.tsx` | M4 | Survey |
| 39 | 1-Click Vector PDF Export & Print | Integrate `openDocument(url)` with authenticated blob streaming in Reports and Analytics tabs | M4 | Survey |
| 40 | Dashboard Analytics Integration Tests | Automated tests in `apps/clinic-app/tests/` for analytics charts and PDF export triggers | M4 | Survey |
| 41 | E2E Test Suite (Tiers 1-4) Pass | 100% pass of requirement-driven opaque-box E2E test suite from `TEST_READY.md` | M5 | Survey |
| 42 | Tier 5 Adversarial Coverage Hardening | Adversarial stress testing via Challenger -> Worker -> Reviewer loop | M5 | Survey |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Database Aggregations, Indexing & Mock Elimination | `services/clinic-api` queries, `ApplicationDbContext.cs`, `ClinicSettings`, unit tests | none | DONE |
| M2 | Enterprise QuestPDF Vector PDF Document Builders & Streaming Endpoints | `packages/shared-dotnet`, `services/clinic-api` infrastructure & controller, PDF tests | M1 | DONE |
| M3 | Interactive SVG Charting Components & Design Token Hardening | `apps/clinic-app/components/analytics/`, tests, token & host linting | none | DONE |
| M4 | Workstation Dashboard Modernization & PDF Streaming Integration | `apps/clinic-app` `Dashboard.screen.tsx`, `clinicService.ts`, integration tests | M2, M3 | DONE |
| M5 | Final Milestone: 100% E2E Test Pass & Adversarial Hardening | Full stack verification (Tiers 1-4 pass + Tier 5 adversarial stress testing) | M1, M2, M3, M4 | DONE |

---

## Interface Contracts

### 1. Backend Report DTOs & Query Endpoints (`services/clinic-api`)
- `GetDailyEodReportQuery(DateTime? Date)` -> `DailyEodReportDto`
- `GetClinicAnalyticsQuery(DateTime? StartDate, DateTime? EndDate)` -> `ClinicAnalyticsDto`
- `GetMorbidityReportQuery(DateTime? StartDate, DateTime? EndDate)` -> `MorbidityReportDto`
- `GetTaxDiscountAuditReportQuery(DateTime? StartDate, DateTime? EndDate)` -> `TaxDiscountAuditReportDto`
- `GetDoctorSharesReportQuery(DateTime? StartDate, DateTime? EndDate)` -> `DoctorSharesReportDto`

### 2. PDF Generator Interface (`ClinicEz.Clinic.Application.Common.Interfaces`)
- `IClinicDocumentPdfService`:
  - `byte[] GenerateDailyEodReportPdf(DailyEodReportDto report, ClinicSettings settings, string? preparedByName = null)`
  - `byte[] GenerateMorbidityReportPdf(MorbidityReportDto report, ClinicSettings settings, string? preparedByName = null)`
  - `byte[] GenerateTaxDiscountAuditReportPdf(TaxDiscountAuditReportDto report, ClinicSettings settings, string? preparedByName = null)`
  - `byte[] GenerateDoctorSharesReportPdf(DoctorSharesReportDto report, ClinicSettings settings, string? preparedByName = null)`
  - `byte[] GenerateClinicAnalyticsPdf(ClinicAnalyticsDto analytics, ClinicSettings settings, string? preparedByName = null)`

### 3. REST Streaming PDF Endpoints (`GET /api/v1/reports/...`)
- `GET /api/v1/reports/daily-eod/pdf?date={yyyy-MM-dd}` -> `application/pdf`
- `GET /api/v1/reports/morbidity/pdf?startDate={yyyy-MM-dd}&endDate={yyyy-MM-dd}` -> `application/pdf`
- `GET /api/v1/reports/tax-discounts/pdf?startDate={yyyy-MM-dd}&endDate={yyyy-MM-dd}` -> `application/pdf`
- `GET /api/v1/reports/doctor-shares/pdf?startDate={yyyy-MM-dd}&endDate={yyyy-MM-dd}` -> `application/pdf`
- `GET /api/v1/reports/analytics/pdf?startDate={yyyy-MM-dd}&endDate={yyyy-MM-dd}` -> `application/pdf`

### 4. Frontend SVG Chart Components (`apps/clinic-app/components/analytics/`)
- `TrendLineChart`: `{ data: DailyTrendPoint[], loading?: boolean, error?: string | null, onRetry?: () => void, height?: number }`
- `WorkloadBarChart`: `{ data: DoctorStat[], loading?: boolean, error?: string | null, onRetry?: () => void, height?: number }`
- `TenderDonutChart`: `{ data: TenderShare[], loading?: boolean, error?: string | null, onRetry?: () => void, height?: number }`
- `MorbidityDistributionChart`: `{ data: MorbidityItem[] | MorbidityDiseaseRow[], loading?: boolean, error?: string | null, onRetry?: () => void, height?: number }`

---

## Code Layout
- `packages/shared-dotnet/`
  - `Documents/Configuration/TenantPrintoutConfig.cs` (Add `TaxIdentificationNumber`)
  - `Documents/Components/TenantLetterheadComponent.cs` (Display TIN)
  - `Documents/Components/DocumentFooterComponent.cs`
  - `Documents/Security/DocumentSecurityService.cs`
  - `Documents/Security/QrCodeService.cs`
- `services/clinic-api/ClinicEz.Clinic.Domain/`
  - `Entities/ClinicSettings.cs` (Add `DefaultDoctorSharePercentage`)
- `services/clinic-api/ClinicEz.Clinic.Application/`
  - `Features/Settings/DTOs/ClinicSettingsDto.cs`
  - `Features/Settings/Commands/UpdateClinicSettingsCommand.cs`
  - `Features/Reports/Queries/GetDailyEodReportQuery.cs`
  - `Features/Reports/Queries/GetClinicAnalyticsQuery.cs`
  - `Features/Reports/Queries/GetMorbidityReportQuery.cs`
  - `Features/Reports/Queries/GetTaxDiscountAuditReportQuery.cs`
  - `Features/Reports/Queries/GetDoctorSharesReportQuery.cs`
  - `Common/Interfaces/IClinicDocumentPdfService.cs`
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/`
  - `Persistence/ApplicationDbContext.cs` (Composite temporal indexes & query filter)
  - `Services/ClinicDocumentPdfService.cs` (QuestPDF report builders)
- `services/clinic-api/ClinicEz.Clinic.Api/`
  - `Controllers/ReportsController.cs` (5 `/pdf` streaming endpoints)
- `services/clinic-api/ClinicEz.Clinic.Application.Tests/`
  - `ReportsAndAnalyticsTests.cs` (Add empty-dataset tests)
  - `HardenedDocumentGenerationTests.cs` (Add QuestPDF report tests)
- `apps/clinic-app/`
  - `components/analytics/`
    - `TrendLineChart.tsx`
    - `WorkloadBarChart.tsx`
    - `TenderDonutChart.tsx`
    - `MorbidityDistributionChart.tsx`
    - `index.ts`
  - `navigation/screens/Dashboard.screen.tsx`
  - `services/clinicService.ts`
  - `services/documentOpener.ts`
  - `tests/analyticsCharts.test.ts`
  - `tests/dashboardAnalyticsIntegration.test.ts`
- `tests/e2e/` (Derived and managed by E2E Testing Track)
  - `TEST_INFRA.md`
  - `TEST_READY.md`
