# BRIEFING — 2026-10-20T02:07:00Z

## Mission
Survey the backend architecture (`services/clinic-api` and `packages/shared-dotnet`) for the Clinical Document Customization Studio and Tri-Mode Doctor Signing project.

## 🔒 My Identity
- Archetype: explorer
- Roles: backend investigator, architecture synthesizer
- Working directory: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend
- Original parent: f15f02a3-efcd-418a-934f-74dd68d6a346
- Milestone: survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Produce a structured handoff report in handoff.md
- Adhere to the 5-component handoff protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method)

## Current Parent
- Conversation ID: f15f02a3-efcd-418a-934f-74dd68d6a346
- Updated: 2026-10-20T02:07:00Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (Requirements R1-R4, acceptance criteria)
  - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/StaffMember.cs`
  - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicSettings.cs`
  - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/MedicalCertificate.cs`
  - `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs`
  - `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`
  - `packages/shared-dotnet/Documents/Configuration/TenantPrintoutConfig.cs`
  - `packages/shared-dotnet/Documents/Components/TenantLetterheadComponent.cs`
  - `packages/shared-dotnet/Documents/Components/DocumentFooterComponent.cs`
  - `packages/shared-dotnet/Documents/Security/DocumentSecurityService.cs`
  - `packages/shared-dotnet/Documents/Security/VerificationUrlResolver.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/DocumentsController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/PrescriptionsController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/LabOrdersController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/StaffController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/SettingsController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Staff/...` (DTOs, Commands, Queries)
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Settings/...` (DTOs, Commands, Queries)
  - `services/clinic-api/ClinicEz.Clinic.Application.Tests/HardenedDocumentGenerationTests.cs`
  - `apps/portal-web/src/app/verify/...` (Public verification routing)
- **Key findings**:
  - `StaffMember` entity currently lacks `SignatureSpecimen` and `DefaultSignatureMode`. Can be extended with `public string? SignatureSpecimen { get; set; }` and `public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen`.
  - `TenantPrintoutConfig` in `packages/shared-dotnet` can define enum `SignatureMode { ESignatureSpecimen, DigitalSealOnly, WetSignature }` and store `DefaultSignatureMode` and `DoctorSignatureBytes`.
  - `ClinicDocumentPdfService` currently renders static text "✓ Digitally Certified & Locked" in stamp boxes without supporting image specimen embedding or wet mode blank signing lines.
  - PDEA S2 safeguard: Prescriptions containing dangerous drugs must default to `WetSignature` and render regulatory warning banner.
  - Logo bytes: `MapToTenantConfig` does not decode `settings.PrimaryLogoUrl` into `PrimaryLogoBytes`. A base64 image decoder helper will populate `PrimaryLogoBytes` for `TenantLetterheadComponent`.
  - `DocumentsController`, `PrescriptionsController`, and `LabOrdersController` lack `?wet=true|false` query parameters.
  - Verification: `DocumentsController.VerifyDocument` needs to match `SecurityDigest` in addition to document reference numbers to satisfy `/verify/<digest>` QR scan resolution.
  - Existing tests in `HardenedDocumentGenerationTests.cs` (9 tests) pass. Need to be extended to test all 4 documents x 3 modes x 3 paper sizes.
- **Unexplored areas**: None. Comprehensive survey complete.

## Key Decisions Made
- Architected the Tri-Mode signature rendering approach for QuestPDF.
- Formulated exact diff proposals for domain entities, DTOs, CQRS commands/queries, QuestPDF service, controllers, and tests.

## Artifact Index
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/DISPATCH.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/BRIEFING.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/progress.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/handoff.md
