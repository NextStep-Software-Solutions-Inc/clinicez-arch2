# Original User Request

## Initial Request — 2026-11-05T07:46:35Z

Develop the institutional Clinic Census Report (interactive workstation view, vector PDF export via QuestPDF, and structured Excel export via ClosedXML) across the clinic application and API based on the approved implementation plan, capturing comprehensive lifecycle timestamps, patient custom fields, nurse assessment/impression, attending doctor/nurse, systems reviewed, and doctor diagnoses.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/improve_clinic_patient_ui
Integrity mode: development

Reference material:
- Implementation plan: /Users/macuser/.gemini/antigravity/brain/c7028f48-ba28-41aa-98ea-4632264de48b/clinic_census_report_plan.md

## Requirements

### R1. Interactive Workstation View in Dashboard Reports Tab
- Add 'CENSUS' to ReportType ('DAILY_EOD' | 'CENSUS' | 'MORBIDITY' | 'TAX_DISCOUNT' | 'DOCTOR_SHARES') and add a 'Clinic census' tab option in SegmentedControl in `apps/clinic-app/navigation/screens/Dashboard.screen.tsx`.
- Provide date range filtering presets (Today, Yesterday, Last 7 Days, This Month, Custom Date Range).
- Display summary KPI telemetry cards: Total Census, New vs Return, Consultations, Standalone Procedures, Diagnostics, Demographics (Pediatric, Adult, Senior, PWD, PhilHealth), and Acuity breakdown.
- Display a searchable patient census register table with search/filtering and columns reflecting Doctor Dx, Nurse Impression, Attending Nurse, Attending Doctor, Systems Reviewed, Timestamps, Custom Fields, acuity badges, and disposition tags.
- Provide action buttons: "Export PDF", "Export Excel (.xlsx)", and "Print".

### R2. Structured Excel Export (.xlsx) via ClosedXML
- Implement `IClinicCensusExcelService` and `ClinicCensusExcelService.cs` in `services/clinic-api` using `ClosedXML.Excel`.
- Generate a multi-tab workbook containing:
  - Sheet 1 ("Census Register"): 25 columns covering Seq #, Check-In Time, Triage Time, Call Time, Completed Time, Turnaround (Mins), Ticket No, Patient Code, Patient Name, Age/Sex/Civil Status, Classification (Senior/PWD/PhilHealth), Custom Fields, Visit Type, Chief Complaint, Nurse Assessment / Impression, Attending Nurse, Vitals Snapshot, Attending Doctor, Doctor Diagnosis & ICD-10, Clinical Assessment, Systems Reviewed & Physical Findings, In-Clinic Procedures Performed, Acuity/Priority, Disposition/Outcome, Billing Status/OR #/Amount Paid. Formatted with Navy header (#1E3A8A), white bold text, auto-fit columns, frozen header row, Excel auto-filter enabled on data headers, currency formatted as ₱#,##0.00, and dates formatted as yyyy-mm-dd hh:mm.
  - Sheet 2 ("Executive Summary & Statistics"): KPI tables for Total visits, New vs Return, Visit types, Demographics, Provider breakdown, and Disposition breakdown.

### R3. Vector PDF Export via QuestPDF
- Implement `GenerateClinicCensusReportPdf(ClinicCensusReportDto report, FacilitySettings settings, string? preparedByName = null)` in `ClinicDocumentPdfService.cs` under `services/clinic-api`.
- Render a landscape layout containing formal clinic letterhead, accreditation number, facility contact, executive telemetry KPI cards, compact demographics & acuity grid, repeating table headers across page breaks, alternating row backgrounds, page numbers (Page X of Y), and signature blocks ("Prepared By: [Name]", "Reviewed & Verified By: Medical Director / Supervising Officer").

### R4. Backend Reporting Endpoints and Frontend Integration
- In `services/clinic-api/ClinicEz.Clinic.Api/Controllers/ReportsController.cs`, expose:
  - `GET /api/v1/reports/census` returning JSON `ApiResponse<ClinicCensusReportDto>`
  - `GET /api/v1/reports/census/pdf` returning binary PDF file stream
  - `GET /api/v1/reports/census/excel` returning binary Excel `.xlsx` file stream
- In `services/clinic-api/ClinicEz.Clinic.Application`, implement `ClinicCensusReportDto` and `GetClinicCensusReportQuery` correlating QueueItem, Patient (demographics & CustomFields JSON), PatientVitals (triage vitals, nurse impression, staff name), ConsultationEncounter (doctor, diagnoses, assessment, systems reviewed, physical exams), Procedure, and Invoice/PaymentRecord.
- In `apps/clinic-app/services/clinicService.ts`, provide TypeScript interfaces and API methods (`getCensusReport`, `getCensusPdfUrl`, `getCensusExcelUrl`).
- In `apps/clinic-app/services/documentOpener.ts`, implement `downloadDocument(url, filename)` for clean binary Excel file downloads.

## Verification Resources
- Backend test command: `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Census"`
- Frontend test command: `cd apps/clinic-app && bun test tests/censusReportWorkstation.test.ts`
- Static checks: `bun run typecheck:clinic` and `bun run lint:clinic`

## Acceptance Criteria

### Interactive Workstation View
- [ ] SegmentedControl on Dashboard Reports tab includes "Clinic census" option.
- [ ] Date presets (Today, Yesterday, Last 7 Days, Month, Custom) trigger real-time telemetry and register updates.
- [ ] Summary KPI cards display accurate counts for Total Census, New vs Return, Consultations, Procedures, Demographics, and Acuity.
- [ ] Register table displays patient visits with Doctor Dx, Nurse Impression, Attending Doctor, Attending Nurse, Systems Reviewed, Timestamps, and Custom Fields.
- [ ] "Export PDF" and "Export Excel (.xlsx)" trigger corresponding download/view actions.

### Excel Export (.xlsx)
- [ ] `GET /api/v1/reports/census/excel` returns a valid, openable `.xlsx` file with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` MIME type.
- [ ] Sheet 1 ("Census Register") has frozen header row, active auto-filters, Navy `#1E3A8A` header styling, currency formatted as `₱#,##0.00`, and all 25 specified columns populated.
- [ ] Sheet 2 ("Executive Summary & Statistics") includes structured summary tables for KPIs, Demographics, and Providers.

### PDF Export (.pdf)
- [ ] `GET /api/v1/reports/census/pdf` returns a valid landscape PDF with `application/pdf` MIME type.
- [ ] PDF includes letterhead, accreditation number, summary telemetry badges, repeating table headers across page breaks, page numbers (`Page X of Y`), and formal signature blocks.

### API & Verification
- [ ] `GET /api/v1/reports/census` returns 200 OK with `ClinicCensusReportDto` containing calculated turnaround times, new vs return status, and correlated clinical/demographic fields.
- [ ] Backend tests in `ClinicEz.Clinic.Application.Tests` covering query calculations, ClosedXML generation, and QuestPDF generation pass cleanly via `dotnet test`.
- [ ] Frontend tests in `apps/clinic-app` pass cleanly via `bun test`.
- [ ] `bun run typecheck:clinic` and `bun run lint:clinic` pass with zero errors.
