# Test Infrastructure & 4-Tier Verification Architecture

This document defines the automated test methodology, toolchain execution commands, and comprehensive 4-tier test inventory for the **Clinical Document Customization Studio & Tri-Mode Doctor Signing** subsystem in ClinicEZ (`clinicez-docs-studio`).

---

## 1. 4-Tier Testing Methodology

The testing architecture follows a 4-tier verification model guaranteeing regulatory compliance, rendering precision, UI fidelity, and transactional security across Philippine healthcare standards (RA 8792 E-Commerce Act, RA 10173 Data Privacy Act, RA 9165 Comprehensive Dangerous Drugs Act, and FDA Circular 2020-004 e-Prescription Guidelines).

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ TIER 1: DOMAIN & ENTITY VALIDATION                                     │
 │ - StaffMember.DefaultSignatureMode enum parse & string conversion      │
 │ - Transparent PNG SignatureSpecimen base64 & data URI validation       │
 │ - DocumentPaperSize ("Letter", "A4", "A5") mapping                     │
 │ - Patient privacy name masking (RA 10173 DPA compliance)               │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TIER 2: BACKEND QUESTPDF ENGINE & CONTROLLER APIS                      │
 │ - 36-combination parameterized matrix (4 types × 3 modes × 3 sizes)    │
 │ - WetSignature text suppression ("✓ Digitally Certified" omitted)      │
 │ - Blank pen line spacing & verification hash/QR preservation           │
 │ - E-Signature transparent PNG specimen embedding above line            │
 │ - Custom clinic logo bytes decoding & letterhead rendering             │
 │ - Controller ?wet=true|false query parameter binding & routing         │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TIER 3: FRONTEND WORKSTATION & STUDIO COMPONENTS                       │
 │ - DocumentTemplatesSettingsTab 2-column workstation layout             │
 │ - Live canvas preview with 4-document segmented switcher               │
 │ - Paper size selector (Letter, A4, A5) & color overrides               │
 │ - 4 core UI states: Skeleton, Empty, Error, Active                     │
 │ - Doctor Physician Stamp Imprint with PRC, PTR, S2, PAN                │
 │ - Zero-violation @clinicez/design-tokens compliance                    │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TIER 4: REGULATORY & CLINICAL ISSUANCE FLOW (PDEA S2 SAFEGUARD)        │
 │ - Dangerous drug detection (isDangerousDrug == true)                   │
 │ - Automatic default/enforcement of Wet Signature Mode                  │
 │ - Prominent statutory amber regulatory warning badge                   │
 │ - Tamper-evident QR code resolution to /verify/<digest>                │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Execution Commands & Toolchain Setup

### Environment Prerequisites
- **.NET SDK**: `10.0.402` located at `~/.dotnet/dotnet`.
- **Bun Runtime**: `1.4.3` located at `~/.bun/bin/bun`.
- **Subshell PATH Requirement**: Non-interactive subshells must prepend `PATH="$HOME/.bun/bin:$PATH"` to enable child Node processes invoked by test runners and token guard scripts.

### 2.1 Backend .NET Test Suite
Runs the 36-combination document generation matrix, regulatory text suppression assertions, custom logo decoding, and controller query parameter routing:
```bash
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
```

### 2.2 Design Tokens Test Suite
Validates token parity, contrast ratios, and typography bounds (>= 12px):
```bash
~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts
```

### 2.3 Strict Design Token Guard Check
Ensures zero hardcoded hex codes, unapproved font sizes, or inline non-tokenized styling:
```bash
PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict
```

### 2.4 Clinic App Workstation Suites
Executes the full suite of clinic workstation component and workflow tests:
```bash
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/
```

Individual suite execution:
```bash
# Document Templates Studio Tab tests
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts

# Staff Signature Specimen & Physician Stamp tests
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/staffSignatureSpecimen.test.ts

# PDEA S2 Prescription Print Hardening tests
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/pdeaPrescriptionHardening.test.ts
```

### 2.5 Strict TypeScript Typecheck
Verifies type safety across all frontend components and contracts:
```bash
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic
```

---

## 3. Comprehensive 4-Tier Test Inventory

| Tier | Test Suite File | Test Scenario / Method | Target Feature | Expected Output Derivation |
|---|---|---|---|---|
| **Tier 1** | `HardenedDocumentGenerationTests.cs` | `DocumentVerificationResultDto_MaskName_Should_Protect_Patient_Privacy` | F4 / DPA RA 10173 | Mathematical privacy masking rule: first/last letters visible, middle asterisks |
| **Tier 1** | `HardenedDocumentGenerationTests.cs` | `IssueMedicalCertificateCommand_Should_Generate_Sequential_Numbers_Safely` | F2 / F3 | Database monotonic sequence generation `MC-YYYYMMDD-0001` |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `GeneratePdf_Across_All_DocumentTypes_SignatureModes_And_PaperSizes_Should_Produce_Valid_Pdf` (36 parameterized matrix cases) | F3 (QuestPDF Tri-Mode Engine) | Valid PDF binary stream (`%PDF-` header, `%%EOF` trailer, size > 1000 bytes) across 4 doc types × 3 modes × 3 sizes |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `ClinicDocumentPdfService_When_WetSignature_Mode_Should_Suppress_Digital_Certification_Badges` | F3 (Wet Mode Hardening) | Absence of `"✓ Digitally Certified & Locked"` and `"✓ Officially Signed"`; presence of blank pen line; preservation of cryptographic security digest and verification QR |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `ClinicDocumentPdfService_When_ESignatureSpecimen_Mode_Should_Embed_Signature_Image` | F3 (E-Signature Embedding) | Binary embedding of signature specimen above signature line; presence of green digital certification badge |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `ClinicDocumentPdfService_When_CustomLogoBytes_Present_Should_Render_In_Header` | F3 (Custom Branding) | Decompression of header stream contains image XObject / logo bytes; fallback to facility text when null |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `ClinicDocumentPdfService_When_Prescription_Contains_Pdea_S2_Dangerous_Drug_Should_Default_To_Wet_Mode` | F3 / F7 (RA 9165 Safeguard) | Automatic fallback to WetSignature; presence of statutory regulatory text warning badge |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `DocumentsController_DownloadMedicalCertificatePdf_Should_Honor_Wet_Query_Param` | F4 (Controller Routing) | Controller passes `wet: true` to service; returns PDF with wet mode attributes |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `DocumentsController_DownloadReferralLetterPdf_Should_Honor_Wet_Query_Param` | F4 (Controller Routing) | Controller honors `?wet=true` query parameter for referral letters |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `PrescriptionsController_DownloadPrescriptionSlipPdf_Should_Honor_Wet_Query_Param` | F4 (Controller Routing) | Controller honors `?wet=true` query parameter for prescription slips |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `LabOrdersController_DownloadLabOrderSlipPdf_Should_Honor_Wet_Query_Param` | F4 (Controller Routing) | Controller honors `?wet=true` query parameter for lab requisitions |
| **Tier 2** | `HardenedDocumentGenerationTests.cs` | `DocumentsController_VerifyDocument_Should_Resolve_By_Security_Digest` | F4 (Verification Resolution) | `/api/v1/documents/verify/{digest}` resolves with `200 OK` and `isVerified: true` |
| **Tier 3** | `documentTemplatesSettingsTab.test.ts` | Two-column workstation layout rendering | F5 (Studio Layout) | Left column form controls, right column live preview canvas (responsive breakpoint >= 1024px) |
| **Tier 3** | `documentTemplatesSettingsTab.test.ts` | 4 Document type switcher reactivity | F5 (Studio Switcher) | Switching between MedCert, e-Rx, Lab Slip, and Referral Letter dynamically swaps canvas preview |
| **Tier 3** | `documentTemplatesSettingsTab.test.ts` | Paper size selector (`Letter`, `A4`, `A5`) | F5 (Stationery Dimensions) | State update triggers dimension recalculation and canvas aspect ratio adjustment |
| **Tier 3** | `documentTemplatesSettingsTab.test.ts` | 4 Core UI States (Skeleton, Empty, Error, Active) | F5 (UI Resilience) | Loading displays skeleton; error displays retry banner; empty displays setup guide; active displays full studio |
| **Tier 3** | `documentTemplatesSettingsTab.test.ts` | Design Token Guard compliance | F5 (Design Standards) | Strict adherence to `@clinicez/design-tokens`; 0 raw hex literals, semantic theme colors |
| **Tier 3** | `staffSignatureSpecimen.test.ts` | Signature upload & canvas draw pad | F6 (Clinician Specimen) | Transparent PNG file reader & base64 encoding; stroke recording on signature pad |
| **Tier 3** | `staffSignatureSpecimen.test.ts` | Default signature mode preference selector | F6 (Doctor Preferences) | Radio/picker allowing `ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature` selection |
| **Tier 3** | `staffSignatureSpecimen.test.ts` | Real-time Physician Stamp Imprint preview | F6 (Physician Stamp) | Renders doctor full name, PRC License, PTR Number, PDEA S2 Number, PhilHealth PAN overlaid with specimen |
| **Tier 4** | `pdeaPrescriptionHardening.test.ts` | Instant print options selector `[ E-Signed ]` \| `[ Wet Signature ]` | F7 (Issuance Hardening) | Modal displays selectable print format pills defaulting to clinician's configured preference |
| **Tier 4** | `pdeaPrescriptionHardening.test.ts` | PDEA S2 Dangerous drug auto-detection | F7 (RA 9165 Enforcement) | Items with `isDangerousDrug === true` lock or auto-default mode to Wet Signature |
| **Tier 4** | `pdeaPrescriptionHardening.test.ts` | Statutory PDEA S2 warning badge rendering | F7 (Regulatory Disclosure) | Renders warning: *"⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."* |
| **Tier 4** | `pdeaPrescriptionHardening.test.ts` | Non-dangerous prescription fallback | F7 (Clinical Flexibility) | Standard generic prescriptions without S2 drugs allow free toggle to E-Signed PDF |

---

## 4. Expected Output Derivation & Verification Oracles

All tests in this suite derive expected outputs from authoritative regulatory sources and formal interface specifications:
1. **Philippine FDA Circular No. 2020-004**: Dictates required components of valid electronic prescriptions (doctor digital signature/seal, PRC number, PTR, patient identifier, generic name precedence).
2. **Philippine Comprehensive Dangerous Drugs Act (RA 9165)**: Mandates wet ink signatures on physical prescription forms for Yellow Prescription / PDEA S2 regulated substances.
3. **Data Privacy Act (RA 10173)**: Mandates patient name masking on public document verification endpoints (`DocumentVerificationResultDto.MaskName`).
4. **ClinicEZ Design Tokens Specification (`@clinicez/design-tokens`)**: Authoritative source of truth for color semantics, typography scales, spacing units, and clinical urgency states.
