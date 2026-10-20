# Project: Clinical Document Customization Studio & Tri-Mode Doctor Signing

## Architecture
- **Monorepo Structure**:
  - `packages/shared-dotnet`: Shared contracts, `TenantPrintoutConfig`, `SignatureMode`, document paper sizes.
  - `packages/design-tokens`: UI/UX design tokens (`lightColors`, `darkColors`, typography, spacing).
  - `services/clinic-api`: ASP.NET Core backend (Clean Architecture: Domain, Application, Infrastructure, Api). Entity Framework Core on PostgreSQL with multi-tenant filtering. QuestPDF document generation engine.
  - `apps/clinic-app`: Expo/React Native Web workstation for clinicians, nurses, and administrative staff.
  - `apps/portal-web`: Public patient verification portal at `/verify/[token]` for scanning QR codes.

- **Data Flow & Tri-Mode Signing Protocol**:
  1. **E-Signature Specimen Mode**: Doctor uploads transparent PNG or draws signature -> stored as base64 on `StaffMember.SignatureSpecimen`. When printing documents, QuestPDF embeds signature specimen above line + printed credentials + green "✓ Digitally Certified & Locked" badge + HMAC-SHA256 verification QR code.
  2. **Digital Verification Seal Mode**: For doctors without signature or preferring seal-only -> QuestPDF renders clean spacing, printed credentials, green digital verification seal, and QR code (no raw signature image).
  3. **Wet Signature Mode**: For manual ink signing or PDEA S2 regulated drugs -> QuestPDF renders a clean blank line for physical pen signing + printed credentials. **OMITS** raw signature image. **OMITS** "Digitally Certified & Locked" badge. **PRESERVES** cryptographic security hash, document number, and QR code in header/footer.
  4. **PDEA S2 Regulatory Safeguard**: In accordance with RA 9165 / DOH-PDEA regulations, any prescription containing a dangerous drug (`isDangerousDrug == true`) automatically defaults to Wet Signature Mode with a prominent regulatory warning badge.

## Code Layout
- `packages/shared-dotnet/Documents/Configuration/TenantPrintoutConfig.cs`: Extended with `SignatureMode` enum (`ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`), `DoctorSignatureBytes`.
- `services/clinic-api/ClinicEz.Clinic.Domain/Entities/StaffMember.cs`: `SignatureSpecimen` (text) and `DefaultSignatureMode` (enum).
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`: Mapping for `StaffMember.SignatureSpecimen` and `DefaultSignatureMode`.
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs`: Helper to decode data URI / base64 logos and signatures into byte arrays.
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs`: Unified signature stamp rendering across all 4 document types (MedCert, e-Rx, Lab Slip, Referral), logo bytes integration, and wet mode badge suppression.
- `services/clinic-api/ClinicEz.Clinic.Api/Controllers/`: `DocumentsController.cs`, `PrescriptionsController.cs`, `LabOrdersController.cs` supporting `?wet=true|false`, plus `/verify/<digest>` lookup.
- `services/clinic-api/ClinicEz.Clinic.Application.Tests/HardenedDocumentGenerationTests.cs`: 36-test parameterized matrix across 4 types x 3 modes x 3 paper sizes (`Letter`, `A4`, `A5`), custom logo test, controller tests, and wet mode text suppression assertions.
- `apps/clinic-app/components/settings/types.ts`: Addition of `'documents'` tab key.
- `apps/clinic-app/navigation/screens/Settings.screen.tsx`: Route registration for `'documents'` tab.
- `apps/clinic-app/components/settings/DocumentTemplatesSettingsTab.tsx`: Two-column workstation layout. Left: form controls (Facility Header, Sub-Header, Address, Contact, DOH LTO, PhilHealth Accreditation, Logo upload, Accent color, Paper size selector, Disclaimer). Right: interactive live preview canvas with 4-document segmented switcher, signature mode toggle, and "Print Sample Test PDF" button.
- `apps/clinic-app/components/settings/SignatureSpecimenModal.tsx`: Upload transparent PNG or draw signature on canvas, with mode selection.
- `apps/clinic-app/navigation/screens/Profile.screen.tsx`: Doctor profile signature specimen manager with Physician Stamp Imprint preview.
- `apps/clinic-app/components/settings/StaffManagementTab.tsx`: Staff doctor modal signature specimen manager and stamp imprint preview.
- `apps/clinic-app/components/PrescriptionSlipModal.tsx`: Instant print option selector `[ E-Signed PDF ]` | `[ Wet Signature (Pen) ]`, auto-default to wet mode for dangerous drugs with PDEA S2 statutory warning badge.
- `apps/clinic-app/navigation/screens/Consultations.screen.tsx`: Workstation print options and PDEA S2 safeguards.
- `apps/clinic-app/tests/`: Frontend test suites for document studio, staff signature specimen, and PDEA S2 hardening.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Shared Contracts & SignatureMode Enum | `SignatureMode` enum and `TenantPrintoutConfig` extensions in `packages/shared-dotnet` | M1 | Survey |
| F2 | StaffMember Entity & DB Mapping | `StaffMember.SignatureSpecimen` & `DefaultSignatureMode` with DTOs and CQRS commands in `services/clinic-api` | M1 | Survey |
| F3 | QuestPDF Tri-Mode Document Engine | `ClinicDocumentPdfService.cs` supporting 3 modes across all 4 document types, logo bytes decoding, and wet badge suppression | M1 | Survey |
| F4 | Backend Controllers & Verification Routing | `?wet=true|false` on `DocumentsController`, `PrescriptionsController`, `LabOrdersController`, plus `/verify/<digest>` resolution | M1 | Survey |
| F5 | Document & Stationery Studio Settings Tab | `DocumentTemplatesSettingsTab.tsx` 2-column layout, form controls, live canvas preview, 4 document switcher, paper size selector, 4 UI states | M2 | Survey |
| F6 | Clinician E-Signature Specimen UI & Stamp Imprint | `Profile.screen.tsx` and `StaffManagementTab.tsx` upload/draw modal, default mode selector, Physician Stamp Imprint preview | M3 | Survey |
| F7 | Workstation Print & Issuance Hardening + PDEA S2 Safeguard | `PrescriptionSlipModal.tsx` & `Consultations.screen.tsx` print selector, dangerous drug auto-wet default, PDEA S2 warning badge | M4 | Survey |
| F8 | Comprehensive 4-Tier Automated E2E Testing Suite | 36-combination .NET matrix tests, design-token guard verification, and frontend Bun test suites | E2E Track | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Test infrastructure, 36-combination matrix in `HardenedDocumentGenerationTests.cs`, frontend Bun test suites (`documentTemplatesSettingsTab.test.ts`, `staffSignatureSpecimen.test.ts`, `pdeaPrescriptionHardening.test.ts`), `TEST_READY.md` | none | DONE |
| M1 | Backend Tri-Mode Engine & Entity Extension | F1, F2, F3, F4: `TenantPrintoutConfig`, `StaffMember` entity/DTOs/CQRS, `ClinicDocumentPdfService.cs`, `ImageDecoderHelper`, controller `?wet=` query params, `/verify/<digest>` lookup | none | DONE |
| M2 | Document & Stationery Studio Settings Tab | F5: `DocumentTemplatesSettingsTab.tsx` under `'documents'` tab in clinic settings, two-column layout, real-time live preview for 4 doc types, paper size selector, @clinicez/design-tokens compliance | M1 | DONE |
| M3 | Clinician E-Signature Specimen UI & Stamp Imprint | F6: `Profile.screen.tsx`, `StaffManagementTab.tsx`, `SignatureSpecimenModal.tsx`, Physician Stamp Imprint with PRC, PTR, PDEA S2, PhilHealth PAN | M1 | DONE |
| M4 | Workstation Print Hardening with PDEA S2 Safeguard | F7: `PrescriptionSlipModal.tsx`, `Consultations.screen.tsx`, `[ E-Signed PDF ]` / `[ Wet Signature ]` selector, PDEA S2 dangerous drug auto-default and warning badge | M1, M2, M3 | DONE |
| M5 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Phase 1: 100% pass across all 3 mandatory test suites (`HardenedDocumentGenerationTests`, `tokens.test.ts`, `apps/clinic-app/tests/`). Phase 2: Tier 5 Adversarial Coverage Hardening | E2E, M1, M2, M3, M4 | DONE |

## Interface Contracts

### 1. `packages/shared-dotnet` ↔ `services/clinic-api`
```csharp
namespace ClinicEz.Shared.Documents.Configuration;

public enum DocumentPaperSize { Letter, A4, A5 }
public enum SignatureMode { ESignatureSpecimen, DigitalSealOnly, WetSignature }

public sealed class TenantPrintoutConfig
{
    public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;
    public byte[]? DoctorSignatureBytes { get; set; }
    public byte[]? PrimaryLogoBytes { get; set; }
    // ...
}
```

### 2. `services/clinic-api` ↔ `apps/clinic-app`
- `StaffMemberDto`:
  - `string? SignatureSpecimen` (data URI `data:image/png;base64,...` or null)
  - `SignatureMode DefaultSignatureMode` (`ESignatureSpecimen` | `DigitalSealOnly` | `WetSignature`)
- Document Download Endpoints with `?wet=true|false`:
  - `GET /api/v1/documents/medical-certificates/{id:guid}/pdf?wet={bool}`
  - `GET /api/v1/documents/referrals/{id:guid}/pdf?wet={bool}`
  - `GET /api/v1/prescriptions/{consultationId:guid}/slip-pdf?wet={bool}`
  - `GET /api/v1/prescriptions/by-number/{prescriptionNumber}/slip-pdf?wet={bool}`
  - `GET /api/v1/lab-orders/{id:guid}/slip-pdf?wet={bool}`
  - `GET /api/v1/settings/sample-document-pdf?docType={type}&wet={bool}&paperSize={size}`
- Document Verification Endpoint:
  - `GET /api/v1/documents/verify/{securityDigestOrNumber}` -> matches document number OR security digest.
