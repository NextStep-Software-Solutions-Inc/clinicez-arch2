# Original User Request

## 2026-10-20T01:54:45Z

Implement the Clinical Document Customization Studio and Tri-Mode Doctor Signing (E-Signature Specimen, Digital Verification Seal, and Wet Signature Print Mode) across Medical Certificates, Electronic Prescriptions, Diagnostic Requisition Slips, and Referral Letters.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-docs-studio
Integrity mode: development

## Requirements

### R1. Document & Stationery Studio Settings Tab (apps/clinic-app)
Add a dedicated `DocumentTemplatesSettingsTab.tsx` under the `'documents'` tab in clinic settings. Provide a high-density two-column workstation layout:
- Left Column: Form controls for Facility Header, Sub-Header/Tagline, Physical Address, Multi-channel Contact, DOH LTO Number, PhilHealth Accreditation, Logo upload, Accent color override, Paper Size selector (`Letter`, `A4`, `A5`), and Statutory Legal Disclaimer footer.
- Right Column: Interactive live previewer rendering the exact document canvas in real time with a segmented switcher across all 4 document types: Medical Certificate, Electronic Prescription (e-Rx), Diagnostic Requisition Slip, and Clinical Referral Letter. Include a toggle between E-Signature Specimen and Wet Signature preview, plus a "Print Sample Test PDF" button.
- Strictly adhere to `@clinicez/design-tokens` (no hardcoded colors, 4 core UI states: Skeleton, Empty, Error, Active).

### R2. Clinician E-Signature Specimen Management (apps/clinic-app & services/clinic-api)
- Extend `StaffMember` entity to store `SignatureSpecimen` (transparent PNG data/URI) and `DefaultSignatureMode` (`ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`).
- In `Profile.screen.tsx` and `StaffManagementTab.tsx`, add an E-Signature Specimen manager allowing doctors to upload a transparent PNG signature or draw directly on a signature pad.
- Display a real-time Physician Stamp Imprint previewing credentials (PRC, PTR, PDEA S2, PhilHealth PAN) overlaid with the signature specimen.

### R3. Backend Tri-Mode PDF Generation Engine (services/clinic-api & packages/shared-dotnet)
- Extend `TenantPrintoutConfig` and `ClinicDocumentPdfService.cs` (QuestPDF) to support:
  1. **E-Signature Specimen Mode**: Embeds doctor's transparent signature specimen image above the line + printed credentials + green "✓ Digitally Certified & Locked" badge + tamper-evident verification QR code.
  2. **Digital Verification Seal Mode**: Printed credentials + digital certification badge + verification QR code (no raw signature image).
  3. **Wet Signature Mode**: Clean blank signature line for physical pen signing, omitting the electronic signature image and omitting the "Digitally Certified" badge, while preserving header/footer verification hashes.
- Automatically load and render custom clinic logo image bytes in document headers.
- Extend `DocumentsController.cs`, `PrescriptionsController.cs`, and `LabOrdersController.cs` with `?wet=true|false` query parameters.

### R4. Workstation Print & Issuance Hardening with PDEA S2 Safeguard (apps/clinic-app)
- In `Consultations.screen.tsx` and `PrescriptionSlipModal.tsx`, provide an instant print options selector: `[ 🖋️ E-Signed PDF ]` | `[ 📝 Wet Signature (Pen) ]`.
- Default to the attending doctor's preferred signing mode.
- **PDEA S2 Automatic Default**: If an electronic prescription contains any medication flagged as a dangerous drug (`isDangerousDrug == true` or PDEA S2), automatically default to **Wet Signature Mode** and display a prominent regulatory badge: *"⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."*

## Acceptance Criteria

### Automated Verification
- [ ] `.NET` test suite passes: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"` generates valid PDFs for all 4 document types across all 3 signature modes and paper sizes (`Letter`, `A4`, `A5`).
- [ ] Design tokens test suite passes with 0 failures: `~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`.
- [ ] Clinic app tests pass: `~/.bun/bin/bun test apps/clinic-app/tests/`.

### Functional & UI/UX Verification
- [ ] Visiting `Settings` -> `Documents & Stationery` renders the two-column studio with live document switching and reactive preview updates.
- [ ] Uploading/drawing an e-signature in Doctor Profile reflects in both the stamp preview and generated documents.
- [ ] Downloading a prescription with a PDEA S2 drug defaults to Wet Signature Mode with the regulatory warning badge.
- [ ] Generating a wet signature PDF produces a clean blank pen signing line without the "Digitally Certified & Locked" text.
- [ ] Scanning document QR codes successfully resolves to the public verification portal at `/verify/<digest>`.
