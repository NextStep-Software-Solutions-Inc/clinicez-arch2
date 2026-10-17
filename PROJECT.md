# Project: Clinic-Wide Audit Log and Forensic Activity Trail

## Architecture
Comprehensive, clinic-wide Audit Log and Forensic Activity Trail system for Clinic Administrators in ClinicEZ:
- `services/clinic-api`:
  - `ClinicEz.Clinic.Domain`: `ClinicAuditEntry` entity inheriting `BaseEntity`, `ClinicPermissions.AuditRead` (`audit:read`) and `ClinicPermissions.AuditExport` (`audit:export`).
  - `ClinicEz.Clinic.Infrastructure`: `ApplicationDbContext` persistence with `ClinicId == CurrentClinicId` global query filter, dual-layer WORM immutability guard in `SaveChangesAsync` and `SaveChanges` throwing `InvalidOperationException`, `PhiRedactionService`, `AuditLogQueue` (`Channel<AuditLogMessage>`), and `AuditLogBackgroundWorker : BackgroundService`.
  - `ClinicEz.Clinic.Application`: MediatR `AuditLoggingBehavior<TRequest, TResponse>` intercepting all state-modifying commands and auditable queries, `GetAuditLogQueryHandler`, `ExportAuditLogQueryHandler`, and PhilHealth Yakap statutory audit decorators.
  - `ClinicEz.Clinic.Api`: `AuditController` exposing `GET /api/v1/audit`, `GET /api/v1/audit/{id}`, and `GET /api/v1/audit/export`.
- `apps/clinic-app`:
  - Dedicated Clinic Admin Workstation UI at `/audit` and `Settings.screen.tsx` tab `'audit'`.
  - `AuditWorkstationView.tsx`, `AuditFilterBar.tsx` (6 category pills, date range with `ValidatedDateInput`, quick presets, actor search), `AuditTable.tsx`, `AuditRow.tsx`.
  - Urgency & Severity badges consuming `@clinicez/design-tokens` (`emergencyBg`, `urgentBg`, `routineBg`).
  - Defensive states: `<AuditTableSkeleton rows={8}>`, contextual `<EmptyState>`, inline date validation alert, `<ErrorState>`.
  - Desktop slide-out inspection drawer ($\ge 1024\text{px}$) with masked patient identity (`J*** D***` / `12-****5678-9`) and sanitized forensic diff with `[Clinical Text Redacted - DPA RA 10173]` and `[REDACTED_SECRET]`.
  - Backward cursor pagination (`before` timestamp).
  - 100% token usage (0 raw hex values).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Security & Auth Interception | Intercept logins, login failures/lockouts, logouts, password resets, role grants/revocations, staff activation/deactivation | M2 | R1 |
| F1.2 | Clinic Admin Interception | Intercept schedule templates, doctor leaves, room reassignments, fee schedules, custom fields, settings updates, EOD closures | M2 | R1 |
| F1.3 | Patient Access Interception | Intercept patient registrations, duplicate checks, demographic edits, and chart views/access audit trail (`patient.chart.viewed`) | M2 | R1 |
| F1.4 | Appointments & Queue Interception | Intercept booking, rescheduling, cancellations, check-in, triage assessments, call to room, queue transitions, completion | M2 | R1 |
| F1.5 | Clinical Care & EMR Interception | Intercept consultation creation, signing (doctor PAN/PRC snapshot), vitals, problems, allergies, physical exams (`lib_pe*`), labs, prescriptions, immunizations | M2 | R1 |
| F1.6 | Billing & Cashier Interception | Intercept invoice generation, item additions, SC/PWD discounts, payments, receipts, shifts, invoice voids (with mandatory audited reasons), refunds | M2 | R1 |
| F1.7 | PhilHealth Yakap Interception | Intercept PIN validation, masterlist sync, eKAS generation, ATC generation, GAMOT dispensation, UPSC vouchers, XML transmittals (`KonsultaData_v1.14.dtd`), AES encryption, SOAP submission, accept/rejection with reasons, claim voids | M2 | R1 |
| F1.8 | Auditing the Auditor | Automatic immutable logging of `audit.log.viewed` (on query/filter) and `audit.log.exported` (on CSV/JSON export) | M2 | R1 |
| F1.9 | Asynchronous Non-Blocking Interception | MediatR `AuditLoggingBehavior`, bounded `Channel<AuditLogMessage>`, and hosted `AuditLogBackgroundWorker` insulating core transactions from audit storage | M1 | R1 |
| F2.1 | Medical Narrative Prose Redaction | `PhiRedactionService` stripping SOAP subjective/objective, psychiatric details, remarks, and clinical notes across 11 entities into `[Clinical Text Redacted - DPA RA 10173]` | M1 | R2 |
| F2.2 | Cryptographic Prose Checksums | Computation of SHA-256 text checksums for redacted narratives, ensuring forensic non-repudiation and tamper evidence without storing PHI | M1 | R2 |
| F2.3 | Secrets Sanitization | Regex-based sanitization of passwords, PINs, tokens, private keys, PhilHealth certificates, and AES keys into `[REDACTED_SECRET]` | M1 | R2 |
| F2.4 | Patient Identity Masking | Deterministic masking of patient names (`J*** D***`), PhilHealth PINs (`12-****5678-9`), phone numbers, and emails for administrative views | M1 | R2 |
| F2.5 | Structural Metadata Preservation | Preserving changed field names, ICD-10 codes, `lib_pe*` codes, statutory symptom codes, transmittal numbers, transaction numbers, and payload hashes | M1 | R2 |
| F2.6 | WORM Immutability Guard | Blocking modifications and deletions on `ClinicAuditEntry` in EF Core `SaveChangesAsync` and `SaveChanges` (throwing `InvalidOperationException`) and DB trigger | M1 | R2 |
| F3.1 | Admin Workstation Navigation | Direct sidebar item `Audit Log` (`/audit`) + Settings tab `'audit'`, gated by `usePermission(PERMISSIONS.auditRead)` | M3 | R3 |
| F3.2 | Categorized Multi-Filter Controls | 6 category pills (`All`, `Security`, `Operations`, `Billing`, `Clinical Access`, `PhilHealth Yakap`), date range picker with `ValidatedDateInput`, quick presets, actor/entity search, reset CTA | M3 | R3 |
| F3.3 | Severity Visual Badges | Visual urgency coding consuming `@clinicez/design-tokens`: Emergency/High Risk (red), Urgent/Warning (orange), Routine/Info (teal) | M3 | R3 |
| F3.4 | Defensive State Handling | Animated `<AuditTableSkeleton rows={8}>`, contextual `<EmptyState>`, inline date validation alert (`startDate <= endDate`), `<ErrorState>` | M3 | R3 |
| F3.5 | Desktop Slide-Over Inspection Drawer | High-density 480px slide-out drawer ($\ge 1024\text{px}$) with masked patient identity, credentials, action verb, and sanitized forensic diff; modal fallback on mobile | M3 | R3 |
| F3.6 | Backward Cursor Pagination & Telemetry | Stream cursor pagination (`before` timestamp) with "Load Earlier Activity" button and automated view/export telemetry | M3 | R3 |
| F3.7 | Strict Design Token Compliance | 100% token usage from `@clinicez/design-tokens`, 0 raw hex color literals, validated via `check-tokens.mjs --strict` | M3 | R3 |
| F4.1 | RBAC Permissions Definition | `ClinicPermissions.AuditRead = "audit:read"` and `ClinicPermissions.AuditExport = "audit:export"` declared in `ClinicPermissions.cs` and `ClinicPermissions.All` | M1 | R4 |
| F4.2 | Role Seeding & Policy Gating | Seeding `audit:read` and `audit:export` into "Clinic Administrator" role in `ClinicRoleSeeder.cs`, endpoint gating via `[HasPermission(...)]` | M1 | R4 |
| F4.3 | Multi-Tenant Global Query Filter | `modelBuilder.Entity<ClinicAuditEntry>().HasQueryFilter(e => e.ClinicId == CurrentClinicId)` in `ApplicationDbContext.cs` | M1 | R4 |
| F4.4 | Audit API Endpoints | `GET /api/v1/audit`, `GET /api/v1/audit/{id}`, `GET /api/v1/audit/export` in `AuditController.cs` | M2 | R4 |
| F5.1 | Backend Test Suite | Multi-tenancy isolation, WORM immutability, PHI redaction, channel throughput, Yakap transmittal audit events, auditing the auditor, RBAC gating | M4 | Quality |
| F5.2 | Frontend Test Suite | Category pills, date validation, urgency badges, desktop inspection drawer, cursor pagination, token compliance | M4 | Quality |
| F5.3 | Adversarial Forensic Audit | Binary integrity verification, stress testing, zero facade/dummy implementations | M4 | Quality |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Backend Audit Core, WORM Immutability, Multi-Tenancy & Privacy Redaction Engine | F1.9, F2.1, F2.2, F2.3, F2.4, F2.5, F2.6, F4.1, F4.2, F4.3 | none | PLANNED |
| 2 | M2: Exhaustive Clinic-Wide & PhilHealth Yakap Event Interception Pipeline | F1.1, F1.2, F1.3, F1.4, F1.5, F1.6, F1.7, F1.8, F4.4 | M1 | PLANNED |
| 3 | M3: High-Density Clinic Admin Audit Workstation UI & Design Tokens | F3.1, F3.2, F3.3, F3.4, F3.5, F3.6, F3.7 | M1, M2 | PLANNED |
| 4 | M4: Dual-Track Verification, E2E Test Suite & Adversarial Forensic Audit | F5.1, F5.2, F5.3 | M1, M2, M3 | PLANNED |

## Interface Contracts
### ClinicAuditEntry Domain Model (M1)
- Entity: `ClinicEz.Clinic.Domain.Entities.ClinicAuditEntry`
  - `Guid Id` (BaseEntity)
  - `string TenantId`
  - `Guid ClinicId`
  - `DateTime Timestamp` (UTC)
  - `string Category` (`Security`, `Operations`, `Patient`, `Appointments`, `Queue`, `Clinical`, `Billing`, `PhilHealth`, `Audit`)
  - `string Severity` (`Routine`, `Urgent`, `Emergency`)
  - `string Action` (e.g. `auth.login.failure`, `clinical.consultation.signed`, `yakap.claim.rejected`)
  - `Guid? ActorStaffId`
  - `string ActorName`
  - `string ActorRole`
  - `string? ClientIpAddress`
  - `string? UserAgent`
  - `string TargetEntityType`
  - `string? TargetEntityId`
  - `Guid? PatientId`
  - `string? PatientNameMasked` (`J*** D***`)
  - `string? PatientPinMasked` (`12-****5678-9`)
  - `string Outcome` (`Success`, `Failure`, `Warning`)
  - `string Description` (Forensic summary)
  - `string MetadataJson` (Sanitized JSON diff, zero secrets, zero narrative prose, SHA-256 prose checksums, preserved ICD-10 & `lib_pe*`)

### PHI Redaction Engine (M1)
- Interface: `ClinicEz.Clinic.Application.Common.Privacy.IPhiRedactionService`
  - `string MaskPatientName(string? name)` -> `"Juan Dela Cruz"` -> `"J*** D*** C***"`
  - `string MaskPhilHealthPin(string? pin)` -> `"12-345678901-2"` -> `"12-****5678-9"`
  - `string RedactPayloadJson(string rawJson)` -> replaces medical prose with `"[Clinical Text Redacted - DPA RA 10173]"`, masks secrets with `"[REDACTED_SECRET]"`, preserves structural codes and computes text checksums.

### Audit API Endpoints (M2)
- `GET /api/v1/audit`
  - Query parameters: `category`, `severity`, `action`, `actorId`, `entityId`, `search`, `startDate`, `endDate`, `before` (cursor), `pageSize`
  - Response: `ApiResponse<AuditLogListDto>` (`Items: IReadOnlyList<ClinicAuditEntryDto>`, `HasMore: bool`, `NextCursor?: string`)
  - Side effect: Immutable recording of `audit.log.viewed`
- `GET /api/v1/audit/{id}`
  - Response: `ApiResponse<ClinicAuditEntryDetailDto>`
- `GET /api/v1/audit/export`
  - Query parameters: same as list + `format=csv|json`
  - Response: Streamed file download
  - Side effect: Immutable recording of `audit.log.exported`

### Frontend Client Contract (M3)
- `apps/clinic-app/services/clinicService.ts`:
  - `getAuditLogs(params: AuditFilterParams): Promise<ApiResponse<AuditLogListDto>>`
  - `exportAuditLogs(params: AuditFilterParams): Promise<Blob | string>`
  - `getAuditEntryDetail(id: string): Promise<ApiResponse<ClinicAuditEntryDetailDto>>`

## Code Layout
- Backend Domain: `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicAuditEntry.cs`, `Constants/ClinicPermissions.cs`
- Backend Application: `services/clinic-api/ClinicEz.Clinic.Application/Common/Privacy/`, `Features/Audit/`, `Behaviors/AuditLoggingBehavior.cs`
- Backend Infrastructure: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`, `Privacy/PhiRedactionService.cs`, `Audit/AuditLogQueue.cs`, `Audit/AuditLogBackgroundWorker.cs`
- Backend Controllers: `services/clinic-api/ClinicEz.Clinic.Api/Controllers/AuditController.cs`
- Backend Tests: `services/clinic-api/ClinicEz.Clinic.Application.Tests/Features/Audit/`
- Frontend App: `apps/clinic-app/components/audit/`, `navigation/screens/Audit.screen.tsx`, `navigation/screens/Settings.screen.tsx`, `components/layout/WorkstationSidebar.tsx`, `constants/permissions.ts`, `services/clinicService.ts`
- Frontend Tests: `apps/clinic-app/tests/auditWorkstation.test.ts`
