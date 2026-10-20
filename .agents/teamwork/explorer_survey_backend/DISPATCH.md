## 2026-10-20T01:57:43Z
[Message] timestamp=2026-10-20T01:57:43Z sender=f15f02a3-efcd-418a-934f-74dd68d6a346 priority=MESSAGE_PRIORITY_HIGH content=You are explorer_survey_backend.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend
You MUST read the requirements file first: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md

Mission: Survey the backend architecture for the Clinical Document Customization Studio and Tri-Mode Doctor Signing project.
Investigate:
1. `services/clinic-api` and `packages/shared-dotnet`:
   - Inspect `StaffMember` entity, its current fields, EF Core configuration, migrations, repository, and DTOs. How to extend it with `SignatureSpecimen` (transparent PNG data/URI) and `DefaultSignatureMode` (`ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`).
   - Inspect `TenantPrintoutConfig` and `ClinicDocumentPdfService.cs` (QuestPDF). How are documents (Medical Certificate, Electronic Prescription, Diagnostic Requisition Slip, Clinical Referral Letter) currently constructed?
   - How to support the 3 signature modes:
     * E-Signature Specimen Mode (doctor's transparent signature specimen image above line + printed credentials + green '✓ Digitally Certified & Locked' badge + tamper-evident verification QR code)
     * Digital Verification Seal Mode (printed credentials + digital certification badge + verification QR code, no raw signature)
     * Wet Signature Mode (clean blank signature line for physical pen signing, omit electronic signature image, omit 'Digitally Certified' badge, preserve header/footer verification hashes)
   - How clinic logo image bytes are handled and rendered in document headers.
   - Inspect `DocumentsController.cs`, `PrescriptionsController.cs`, and `LabOrdersController.cs` for adding `?wet=true|false` query parameters and how they route to the PDF service.
   - Inspect `services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj` and existing document generation tests.
2. Produce a comprehensive report with file paths, existing symbols, exact diff proposals, and potential technical hurdles.
Save your report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/handoff.md` and send a message to parent (me) when complete.
