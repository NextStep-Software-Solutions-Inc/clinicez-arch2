# Project: Clinic Census Report (Interactive Workstation, QuestPDF Landscape, ClosedXML Excel)

## Architecture Overview
The Clinic Census Report provides clinical administrators, medical directors, supervising nurses, and regulatory bodies with an operational, diagnostic, and statutory outpatient census covering all clinic encounters across any selected date range.

The architecture comprises:
- **Backend Application (`services/clinic-api/ClinicEz.Clinic.Application`)**:
  - `ClinicCensusReportDto.cs` & sub-DTOs: Strongly-typed contracts for census summary, demographics, providers, and 25-column register items.
  - `GetClinicCensusReportQuery.cs`: MediatR CQRS query handler correlating 6 entities (`QueueItem`, `Patient`, `PatientVitals`, `ConsultationEncounter`, `Procedure`, `Invoice`/`PaymentRecord`). Computes turnaround minutes and deterministic lifetime New vs Returning status.
  - `IClinicCensusExcelService.cs`: Abstract interface for ClosedXML workbook generation.
  - `IClinicDocumentPdfService.cs`: Extended with `GenerateClinicCensusReportPdf`.
- **Backend Infrastructure (`services/clinic-api/ClinicEz.Clinic.Infrastructure`)**:
  - `ClinicCensusExcelService.cs`: ClosedXML spreadsheet engine creating a multi-tab workbook (Sheet 1: 25-column Census Register with Navy `#1E3A8A` header, white bold text, auto-fit widths, frozen row, auto-filter, formatted numbers/dates/currency; Sheet 2: Executive Summary & Statistics).
  - `ClinicDocumentPdfService.cs`: QuestPDF landscape vector document generator with clinic letterhead, accreditation number, facility contact, executive telemetry KPI cards, repeating table headers across page breaks, alternating row colors, Page X of Y, and formal dual signature blocks.
  - `DependencyInjection.cs`: Service registration for `IClinicCensusExcelService`.
- **Backend API Layer (`services/clinic-api/ClinicEz.Clinic.Api`)**:
  - `ReportsController.cs`: Exposes `GET /api/v1/reports/census` (JSON), `GET /api/v1/reports/census/pdf` (`application/pdf`), and `GET /api/v1/reports/census/excel` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). Uses backward-compatible constructor for existing tests.
- **Frontend Workstation (`apps/clinic-app`)**:
  - `services/clinicService.ts`: TypeScript contracts and API methods (`getCensusReport`, `getCensusPdfUrl`, `getCensusExcelUrl`).
  - `services/documentOpener.ts`: `downloadDocument(url, filename)` for clean binary Excel file downloads without browser tab leaks.
  - `navigation/screens/Dashboard.screen.tsx`: SegmentedControl "Clinic census" option, date range presets (Today, Yesterday, Last 7 Days, Month, Custom), summary KPI cards, searchable 25-column register table, and action buttons ("Export PDF", "Export Excel (.xlsx)", "Print").

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Enriched Census DTO Schema | Define `ClinicCensusReportDto`, `CensusSummaryDto`, `CensusItemDto` (all 25 columns), `CensusDemographicsBreakdownDto`, `CensusAcuityBreakdownDto`, `CensusProviderBreakdownDto` | M1 | Survey Explorer 1 |
| F1.2 | 6-Entity Correlation CQRS Query | `GetClinicCensusReportQuery` correlating QueueItem, Patient, PatientVitals, ConsultationEncounter, Procedure, Invoice/PaymentRecord | M1 | Survey Explorer 1 |
| F1.3 | Turnaround & Lifecycle Metrics | Calculate `TurnaroundMinutes = CompletedTime - CheckInTime` (fallback to DischargedAt/SignedAt) and clinic-wide average | M1 | Survey Explorer 1 |
| F1.4 | Deterministic New vs Returning Classification | Query `Min(CheckInTime)` across patient history; mark New if visit is first lifetime encounter, else Returning | M1 | Survey Explorer 1 |
| F1.5 | Service Contracts | Define `IClinicCensusExcelService` and extend `IClinicDocumentPdfService` | M1 | Survey Explorer 1 |
| F2.1 | ClosedXML Sheet 1 ("Census Register") | Generate 25 columns with Navy `#1E3A8A` header, white bold text, auto-fit columns with safety bounds, frozen header row, Excel auto-filter, currency format `₱#,##0.00`, date format `yyyy-mm-dd hh:mm` | M1 | Survey Explorer 2 |
| F2.2 | ClosedXML Sheet 2 ("Executive Summary & Statistics") | Structured summary tables for KPI counts, new vs return, demographics, providers, and disposition | M1 | Survey Explorer 2 |
| F2.3 | QuestPDF Landscape Vector Document | Formal letterhead, accreditation number, facility contact, 4 KPI telemetry cards, compact demographics/acuity grid, repeating table headers across page breaks, alternating row colors, Page X of Y, and dual signature blocks | M1 | Survey Explorer 2 |
| F2.4 | Infrastructure Dependency Injection | Register `IClinicCensusExcelService` as scoped service in `DependencyInjection.cs` | M1 | Survey Explorer 2 |
| F3.1 | ReportsController Census JSON Endpoint | Expose `GET /api/v1/reports/census` returning `ApiResponse<ClinicCensusReportDto>` with `[HasPermission(ClinicPermissions.ReportsRead)]` | M1 | Survey Explorer 2 |
| F3.2 | ReportsController Census PDF Endpoint | Expose `GET /api/v1/reports/census/pdf` returning binary PDF file stream `application/pdf` | M1 | Survey Explorer 2 |
| F3.3 | ReportsController Census Excel Endpoint | Expose `GET /api/v1/reports/census/excel` returning binary Excel file stream `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | M1 | Survey Explorer 2 |
| F3.4 | Controller Backward Compatibility | Preserve existing 3-parameter constructor in `ReportsController` with optional `excelService = null` fallback | M1 | Survey Explorer 2 |
| F4.1 | Frontend API Client & Types | Add TypeScript types and methods `getCensusReport`, `getCensusPdfUrl`, `getCensusExcelUrl` in `clinicService.ts` | M2 | Survey Explorer 3 |
| F4.2 | Clean Binary Document Downloader | Implement `downloadDocument(url, filename)` in `documentOpener.ts` to fetch binary blobs and download `.xlsx` without popup leaks | M2 | Survey Explorer 3 |
| F4.3 | Dashboard Workstation Census Navigation | Add `'CENSUS'` to `ReportType`, SegmentedControl with "Clinic census", and `'yesterday'` to date preset range logic | M2 | Survey Explorer 3 |
| F4.4 | Workstation Summary KPI Telemetry Cards | Total Census, New vs Return, Consultations, Standalone Procedures, Diagnostics, Demographics (Pediatric, Adult, Senior, PWD, PhilHealth), and Acuity | M2 | Survey Explorer 3 |
| F4.5 | Searchable Patient Census Register Table | Horizontal-scrolling table with search/filtering, Doctor Dx, Nurse Impression, Attending Doctor & Nurse, Systems Reviewed, Timestamps, Custom Fields, acuity badges, and disposition tags | M2 | Survey Explorer 3 |
| F4.6 | Workstation Action Buttons | "Export PDF", "Export Excel (.xlsx)", and "Print" buttons wired to report services | M2 | Survey Explorer 3 |
| F5.1 | E2E & Integration Test Suite | Comprehensive tests covering CQRS query, ClosedXML spreadsheet, QuestPDF document, controller streaming, and workstation UI (`censusReportWorkstation.test.ts`) | M3 | E2E Testing Track |
| F5.2 | Static Typecheck & Design Token Linting | Verify zero errors via `bun run typecheck:clinic` and `bun run lint:clinic` | M3 | E2E Testing Track |


---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Core, Export Services & Endpoints (`services/clinic-api`) | F1.1 - F1.5, F2.1 - F2.4, F3.1 - F3.4 | none | DONE |
| M2 | Frontend Services & Workstation UI (`apps/clinic-app`) | F4.1 - F4.6 | M1 interface contracts | DONE |
| M3 | Full Integration, 100% E2E Test Suite, Adversarial Review & Forensic Audit | F5.1 - F5.2 (All features) | M1, M2 | DONE |






---

## Interface Contracts

### 1. `ClinicCensusReportDto` & Query Contract
```csharp
namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public class ClinicCensusReportDto
{
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
    public string ClinicName { get; set; } = string.Empty;
    public string? ClinicCode { get; set; }
    public string? AccreditationNumber { get; set; }
    public CensusSummaryDto Summary { get; set; } = new();
    public CensusDemographicsBreakdownDto Demographics { get; set; } = new();
    public CensusAcuityBreakdownDto Acuity { get; set; } = new();
    public List<CensusVisitTypeBreakdownDto> VisitTypes { get; set; } = new();
    public List<CensusProviderBreakdownDto> Providers { get; set; } = new();
    public List<CensusItemDto> Items { get; set; } = new();
}
```

### 2. `IClinicCensusExcelService` Contract
```csharp
namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicCensusExcelService
{
    byte[] GenerateClinicCensusExcel(ClinicCensusReportDto report, FacilitySettings settings);
}
```

### 3. `IClinicDocumentPdfService` Extension
```csharp
namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicDocumentPdfService
{
    // ... existing report methods ...
    byte[] GenerateClinicCensusReportPdf(ClinicCensusReportDto report, FacilitySettings settings, string? preparedByName = null);
}
```

### 4. Frontend `clinicService` Census Contracts
```typescript
export interface ClinicCensusReport {
  startDate: string;
  endDate: string;
  generatedAtUtc: string;
  clinicName: string;
  clinicCode?: string;
  accreditationNumber?: string;
  summary: CensusSummary;
  demographics: CensusDemographicsBreakdown;
  acuity: CensusAcuityBreakdown;
  visitTypes: Array<{ visitType: string; count: number; percentage: number }>;
  providers: CensusProviderBreakdown[];
  items: CensusItem[];
}
```

---

## Code Layout
```
services/clinic-api/
  ClinicEz.Clinic.Application/
    Features/Reports/
      DTOs/ClinicCensusReportDto.cs
      Queries/GetClinicCensusReportQuery.cs
    Common/Interfaces/
      IClinicCensusExcelService.cs
      IClinicDocumentPdfService.cs
  ClinicEz.Clinic.Infrastructure/
    Services/
      ClinicCensusExcelService.cs
      ClinicDocumentPdfService.cs
    DependencyInjection.cs
  ClinicEz.Clinic.Api/
    Controllers/
      ReportsController.cs
  ClinicEz.Clinic.Application.Tests/
    ClinicCensusReportTests.cs

apps/clinic-app/
  services/
    clinicService.ts
    documentOpener.ts
  navigation/screens/
    Dashboard.screen.tsx
  tests/
    censusReportWorkstation.test.ts
```
