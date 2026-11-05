# TEST_INFRA: Clinic Census Report (Interactive Workstation, QuestPDF Landscape, ClosedXML Excel)

## 1. Test Philosophy & Methodology

The Clinic Census Report test infrastructure enforces institutional-grade quality, statutory compliance, and clinical accuracy across the outpatient clinic application and API. Testing adheres to a rigorous **4-Tier Testing Methodology** that validates observable contracts, clinical workflows, data transformations, and UI component outputs without coupling to internal implementation trivia:

- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, `clinic_census_report_plan.md`, and Explorer surveys (`survey_backend_application.md`, `survey_backend_infrastructure.md`, `survey_frontend_workstation.md`).
- **Mathematical & Clinical Oracles**: All expected results for metrics (turnaround minutes, new vs returning patient classification, age cohorts, triage vitals, and billing totals) are calculated using independent reference oracles.
- **Design Token & Ergonomics Enforcement**: Workstation UI components are verified against `@clinicez/design-tokens` (teal `#0D6963` brand color, semantic acuity variants `routineBg`/`urgentBg`/`emergencyBg`, strict typography scales, and tokenized spacing/radii). Zero hardcoded hex colors, zero raw numeric font sizes, zero emojis.
- **Clean Document Downloader Architecture**: Spreadsheets (`.xlsx`) and vector documents (`.pdf`) are validated for clean binary streaming, proper MIME types (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `application/pdf`), and correct download behavior without browser popup leaks or filename corruption.

---

## 2. 4-Tier Test Architecture

```
                                 ┌──────────────────────────────────────────────────────────┐
                                 │ Tier 4: Real-World Operational Clinic Day Scenarios      │
                                 │ (Morning Rush, Triage, Minor Procedure, Audit, EOD)      │
                                 └────────────────────────────┬─────────────────────────────┘
                                                              │
                                 ┌────────────────────────────┴─────────────────────────────┐
                                 │ Tier 3: Cross-Feature Combinations & Workflows           │
                                 │ (Date Presets + Search + Acuity + Custom Fields + Export)│
                                 └────────────────────────────┬─────────────────────────────┘
                                                              │
                                 ┌────────────────────────────┴─────────────────────────────┐
                                 │ Tier 2: Boundary, Null & Corner Case Resilience          │
                                 │ (0 Visits, Missing Vitals, Long Text, Extreme Times)    │
                                 └────────────────────────────┬─────────────────────────────┘
                                                              │
                                 ┌────────────────────────────┴─────────────────────────────┐
                                 │ Tier 1: Isolated Feature & Interface Contract Coverage   │
                                 │ (SegmentedControl, Presets, Telemetry, 25-Col Table, URL)│
                                 └──────────────────────────────────────────────────────────┘
```

1. **Tier 1 (Feature Coverage)**: Isolated functional verification of each feature in the inventory (SegmentedControl option, date presets, telemetry cards, 25-column register table, export action triggers, and API URL generators).
2. **Tier 2 (Boundary & Corner Cases)**: Edge conditions, empty data sets (0 records), partial/missing vitals in triage, null turnaround times for in-progress visits, multi-type custom fields (string vs object vs null), and long clinical text truncation.
3. **Tier 3 (Cross-Feature Combinations)**: Multi-dimensional interactions between date presets, real-time search queries, acuity badges, provider workload filters, and export URL generation.
4. **Tier 4 (Real-World Application Scenarios)**: High-fidelity clinical day simulations reflecting standard Philippine outpatient operations (walk-in triage, doctor consultation with ICD-10 diagnosis, treatment bay procedures, university student ID custom fields, and statutory audit exports).

---

## 3. Feature Coverage Matrix (Tiers 1 to 4)

| Feature # | Feature Description | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Verification Target |
|:---------:|---------------------|:------------------:|:------:|:------:|:------:|:------:|---------------------|
| **F1.1** | Census DTO Schema & Register Contract | ORIGINAL_REQUEST R4, PROJECT.md F1.1 | ✓ | ✓ | ✓ | ✓ | `ClinicCensusReportDto.cs`, `clinicService.ts` |
| **F1.2** | 6-Entity Correlation Query Handler | ORIGINAL_REQUEST R4, PROJECT.md F1.2 | ✓ | ✓ | ✓ | ✓ | `GetClinicCensusReportQuery.cs` |
| **F1.3** | Turnaround Minutes Calculation | ORIGINAL_REQUEST R4, PROJECT.md F1.3 | ✓ | ✓ | ✓ | ✓ | Query Engine & Math Oracle |
| **F1.4** | Deterministic Lifetime New vs Returning | ORIGINAL_REQUEST R4, PROJECT.md F1.4 | ✓ | ✓ | ✓ | ✓ | Query Engine & Math Oracle |
| **F2.1** | ClosedXML Sheet 1 ("Census Register") | ORIGINAL_REQUEST R2, PROJECT.md F2.1 | ✓ | ✓ | ✓ | ✓ | `ClinicCensusExcelService.cs` |
| **F2.2** | ClosedXML Sheet 2 ("Executive Summary") | ORIGINAL_REQUEST R2, PROJECT.md F2.2 | ✓ | ✓ | ✓ | ✓ | `ClinicCensusExcelService.cs` |
| **F2.3** | QuestPDF Landscape Vector Document | ORIGINAL_REQUEST R3, PROJECT.md F2.3 | ✓ | ✓ | ✓ | ✓ | `ClinicDocumentPdfService.cs` |
| **F3.1** | ReportsController Census JSON Endpoint | ORIGINAL_REQUEST R4, PROJECT.md F3.1 | ✓ | ✓ | ✓ | ✓ | `ReportsController.cs` (`/reports/census`) |
| **F3.2** | ReportsController Census PDF Endpoint | ORIGINAL_REQUEST R4, PROJECT.md F3.2 | ✓ | ✓ | ✓ | ✓ | `ReportsController.cs` (`/reports/census/pdf`) |
| **F3.3** | ReportsController Census Excel Endpoint | ORIGINAL_REQUEST R4, PROJECT.md F3.3 | ✓ | ✓ | ✓ | ✓ | `ReportsController.cs` (`/reports/census/excel`) |
| **F4.1** | Frontend API Client & TypeScript Types | ORIGINAL_REQUEST R4, PROJECT.md F4.1 | ✓ | ✓ | ✓ | ✓ | `clinicService.ts` |
| **F4.2** | Clean Binary Document Downloader | ORIGINAL_REQUEST R4, PROJECT.md F4.2 | ✓ | ✓ | ✓ | ✓ | `documentOpener.ts` (`downloadDocument`) |
| **F4.3** | Dashboard Reports SegmentedControl Option | ORIGINAL_REQUEST R1, PROJECT.md F4.3 | ✓ | ✓ | ✓ | ✓ | `Dashboard.screen.tsx` (`CENSUS`) |
| **F4.4** | Date Presets (Today, Yesterday, 7d, 30d) | ORIGINAL_REQUEST R1, PROJECT.md F4.4 | ✓ | ✓ | ✓ | ✓ | `computeDatePresetRange` Helper |
| **F4.5** | Summary KPI Telemetry Cards | ORIGINAL_REQUEST R1, PROJECT.md F4.5 | ✓ | ✓ | ✓ | ✓ | Workstation Telemetry Cards |
| **F4.6** | Searchable 25-Column Register Table | ORIGINAL_REQUEST R1, PROJECT.md F4.6 | ✓ | ✓ | ✓ | ✓ | Workstation Census Register Table |
| **F4.7** | Workstation Export Actions (PDF, Excel) | ORIGINAL_REQUEST R1, PROJECT.md F4.7 | ✓ | ✓ | ✓ | ✓ | Export Action Buttons & Handlers |

---

## 4. Test Execution & Runner Commands

### 4.1 Frontend Workstation Test Suite
Executes the comprehensive 4-tier census workstation suite:
```bash
cd apps/clinic-app && bun test tests/censusReportWorkstation.test.ts
```

### 4.2 Backend Unit & Integration Test Suite
Executes CQRS query correlation, ClosedXML Excel workbook generation, and QuestPDF vector layout tests:
```bash
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Census"
```

### 4.3 Static Typecheck Gate
Ensures strict TypeScript compilation across the clinic application:
```bash
bun run typecheck:clinic
```

### 4.4 Design Token & Lint Gate
Enforces zero hardcoded colors, strict token adoption, and zero unauthorized dependencies:
```bash
bun run lint:clinic
```

---

## 5. Pass Criteria & Quality Gates

1. **100% Pass Rate**: All tests across Tiers 1 through 4 in `tests/censusReportWorkstation.test.ts` must pass with zero failures or skipped assertions.
2. **Zero Facade / Anti-Pattern Code**: No dummy tests, tautological `expect(true).toBe(true)`, or mocking that bypasses business logic validation.
3. **Boundary Resilience**: Clean error handling for 0 visits, missing vitals, null turnaround times, and malformed custom field structures.
4. **Design System Adherence**: Verified compliance with `@clinicez/design-tokens` (teal `#0D6963` brand palette, acuity tokens `emergencyBg`/`urgentBg`/`routineBg`, typography variants).
5. **Static Analysis & Type Safety**: Zero TypeScript compiler errors via `bun run typecheck:clinic` and zero token lint violations via `bun run lint:clinic`.
