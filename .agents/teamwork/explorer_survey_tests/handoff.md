# Test Infrastructure Survey & Hardening Plan

**Target Workspace**: `/Users/macuser/projects/github/nextstep/clinicez-docs-studio`  
**Milestone**: Clinical Document Customization Studio & Tri-Mode Doctor Signing (Acceptance Verification)  
**Surveyor**: `explorer_survey_tests`  

---

## 1. Observation

### 1.1 Workspace Architecture & Toolchain Runtimes
- **OS & Architecture**: macOS (Darwin 24.6.0 arm64).
- **.NET SDK**: `10.0.402` at `~/.dotnet/dotnet`.
- **Bun Runtime**: `1.4.3 (c6da4a4d3)` at `~/.bun/bin/bun`.
- **Node Binary**: Located at `/Users/macuser/.bun/bin/node` (symlinked/managed by Bun).
- **Git Worktree Status**:
  `/Users/macuser/projects/github/nextstep/clinicez-docs-studio` is a git worktree on branch `feature/clinical-document-customization-studio` linked to base repository `/Users/macuser/projects/github/nextstep/clinicez-arch2`.
- **Dependency Prerequisites & Resolution**:
  - Because `clinicez-docs-studio` is a fresh worktree, `node_modules` was initially absent at both root and `apps/clinic-app/node_modules`.
  - Running `~/.bun/bin/bun test apps/clinic-app/tests/` initially produced:
    ```text
    error: Cannot find package 'react' from '/Users/macuser/projects/github/nextstep/clinicez-docs-studio/apps/clinic-app/tests/auditWorkstation.test.ts'
    ...
    102 fail, 96 errors
    ```
  - Parity check with sibling worktree `/Users/macuser/projects/github/nextstep/clinicez-dental-fix` revealed established symlinks:
    ```text
    /Users/macuser/projects/github/nextstep/clinicez-dental-fix/node_modules -> /Users/macuser/projects/github/nextstep/clinicez-arch2/node_modules
    /Users/macuser/projects/github/nextstep/clinicez-dental-fix/apps/clinic-app/node_modules -> /Users/macuser/projects/github/nextstep/clinicez-arch2/apps/clinic-app/node_modules
    ```
  - Replicating these symlinks in `clinicez-docs-studio` resolved package resolution immediately.
  - Furthermore, `apps/clinic-app/tests/auditWorkstation.test.ts:1198` executes child process `execSync('node "${scriptPath}" --strict')`. Because non-interactive subshells (`/bin/sh`) do not inherit `~/.bun/bin` by default, prepending `PATH="$HOME/.bun/bin:$PATH"` is required for child node execution.

---

### 1.2 Mandatory Suite 1: Backend .NET Suite
- **File**: `services/clinic-api/ClinicEz.Clinic.Application.Tests/HardenedDocumentGenerationTests.cs` (392 lines).
- **Project File**: `services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`.
  - Framework: `net10.0`
  - Packages: `xunit (2.9.3)`, `FluentAssertions (8.10.0)`, `NSubstitute (5.3.0)`, `Microsoft.NET.Test.Sdk (17.14.1)`, `Microsoft.EntityFrameworkCore.InMemory (10.0.12)`.
- **Command Executed**:
  ```bash
  ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
  ```
- **Execution Result**:
  ```text
  Passed! - Failed: 0, Passed: 9, Skipped: 0, Total: 9, Duration: 1 s - ClinicEz.Clinic.Application.Tests.dll (net10.0)
  ```
- **Existing Test Cases in `HardenedDocumentGenerationTests.cs`**:
  1. `ClinicDocumentPdfService_Should_Generate_Valid_MedicalCertificate_PDF_With_Security_Seal` (Line 24): Single Letter test with `IsSigned = true`.
  2. `ClinicDocumentPdfService_Should_Generate_Valid_Lab_Requisition_Slip_PDF_With_Dropzone_QR` (Line 92): Single Letter test.
  3. `ClinicDocumentPdfService_Should_Generate_Valid_Prescription_PDF_Generics_Act_Compliant` (Line 143): Single A5 test.
  4. `IssueMedicalCertificateCommand_Should_Generate_Sequential_Numbers_Safely` (Line 228): Sequential numbering test.
  5. `ClinicDocumentPdfService_Should_Generate_Valid_Referral_Letter_PDF_With_Security_Seal` (Line 273): Single A4 test.
  6. `DocumentVerificationResultDto_MaskName_Should_Protect_Patient_Privacy` (Line 351): `[Theory]` with 3 `[InlineData]` cases.
  7. `ClinicDocumentPdfService_Should_Generate_Valid_Reception_Placard_PDF` (Line 361): Placard generation.

---

### 1.3 Mandatory Suite 2: Design Tokens Suite
- **File**: `packages/design-tokens/src/tokens.test.ts` (63 lines).
- **Package**: `packages/design-tokens/package.json`.
- **Command Executed**:
  ```bash
  ~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts
  ```
- **Execution Result**:
  ```text
  27 pass
  0 fail
  167 expect() calls
  Ran 27 tests across 1 file. [50.00ms]
  ```
- **Linter Script Check**:
  ```bash
  PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict
  ```
- **Execution Result**:
  ```text
  Token guard: 0 violation(s) in 0 file(s).
  ```

---

### 1.4 Mandatory Suite 3: Clinic App Suite
- **Directory**: `apps/clinic-app/tests/` (129 files).
- **Test Framework**: Bun test runner (`bun:test`), React 19.2.3, `react-dom/server` (`renderToStaticMarkup`), custom RN component mocks (`data-component`, `aria-label`, `role`).
- **Command Executed**:
  ```bash
  PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/
  ```
- **Execution Result**:
  ```text
  2342 pass
  0 fail
  269984 expect() calls
  Ran 2342 tests across 129 files. [21.36s]
  ```
- **Typecheck Status**:
  ```bash
  PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic
  ```
  Exited with code 0 in 3.1s (`tsc --noEmit -p apps/clinic-app`).

---

### 1.5 Codebase Inventory & Current Implementation Gaps

| Requirement / Component | Current State in Codebase | What is Missing |
|---|---|---|
| **R1. DocumentTemplatesSettingsTab** | Does not exist in `apps/clinic-app/components/settings/`. `types.ts` does not include `'documents'` in `SettingsTabKey`. | New tab component `DocumentTemplatesSettingsTab.tsx`, route registration, two-column workstation layout (form controls on left, live canvas preview on right), document switcher, sample test PDF button. |
| **R2. Clinician E-Signature Specimen** | `StaffMember.cs` has PRC, PTR, S2, PAN, but NO `SignatureSpecimen` or `DefaultSignatureMode`. | Entity properties in `StaffMember.cs`, `UpdateMyProfileCommand`, `UpdateStaffMemberCommand`, signature pad / file upload in `Profile.screen.tsx` and `StaffManagementTab.tsx`, Physician Stamp Imprint preview. |
| **R3. Tri-Mode PDF Engine & Logo** | `ClinicDocumentPdfService.cs` hardcodes "✓ Digitally Certified & Locked" in `stamp.Item()` (line 179). Signature height is empty `Height(35)` (line 172). Logo bytes are not rendered. Controllers lack `?wet=` query param. | Extension of `TenantPrintoutConfig` with `SignatureMode`, `SignatureSpecimenBytes`, `PrimaryLogoBytes`. Logic in `ClinicDocumentPdfService.cs` to render signature image or blank line, suppress certification text in wet mode, and render custom logo bytes. `?wet=` query param on `DocumentsController`, `PrescriptionsController`, and `LabOrdersController`. |
| **R4. PDEA S2 Print Hardening** | `PrescriptionSlipModal.tsx` and `Consultations.screen.tsx` do not provide `[🖋️ E-Signed PDF]` vs `[📝 Wet Signature (Pen)]` selector. | Mode selector, auto-default to Wet Signature when `isDangerousDrug == true`, statutory warning badge rendering. |

---

## 2. Logic Chain

```
[Observation 1.1: Worktree missing node_modules & non-interactive PATH lacking node]
        │
        ▼
[Step 1: Environment Baseline Setup]
Establish symlinks to base worktree node_modules and prepend ~/.bun/bin to PATH.
Verifies all 2,342 existing clinic-app tests and 27 design-token tests pass with 0 regressions.
        │
        ▼
[Observation 1.2: HardenedDocumentGenerationTests currently only tests 1 mode and partial paper sizes]
        │
        ▼
[Step 2: Acceptance Criteria Gap Analysis for Backend]
Acceptance criteria requires testing all 4 document types (MedCert, e-Rx, Lab Slip, Referral)
across all 3 signature modes (ESignatureSpecimen, DigitalSealOnly, WetSignature)
and all 3 paper sizes (Letter, A4, A5) = 36-combination matrix.
Current suite only runs 9 tests covering single fixed combinations.
        │
        ▼
[Observation 1.4 & 1.5: Frontend lacks DocumentTemplates tab, signature upload, and PDEA modal selector]
        │
        ▼
[Step 3: Frontend Test Suite Construction]
Three dedicated Bun test suites must be created to verify R1, R2, and R4:
1. documentTemplatesSettingsTab.test.ts (2-column layout, 4 doc switchers, 4 UI states, token compliance)
2. staffSignatureSpecimen.test.ts (specimen upload, stamp preview, mode preference)
3. pdeaPrescriptionHardening.test.ts (dangerous drug detection, forced wet default, statutory badge)
        │
        ▼
[Step 4: End-to-End Regression & Regulatory Integrity]
Synthesize 4-tier edge cases into executable assertions:
Tier 1: Domain/Entities -> Tier 2: QuestPDF & Controllers -> Tier 3: Workstation UI -> Tier 4: Regulatory Issuance.
```

---

## 3. Detailed Survey: Existing Tests vs. New Tests Needed

### 3.1 Backend: `services/clinic-api/ClinicEz.Clinic.Application.Tests`

#### Existing Tests (in `HardenedDocumentGenerationTests.cs`):
1. `ClinicDocumentPdfService_Should_Generate_Valid_MedicalCertificate_PDF_With_Security_Seal`: Verifies MedCert PDF bytes > 1000, begins with `%PDF-` and ends with `%%EOF`.
2. `ClinicDocumentPdfService_Should_Generate_Valid_Lab_Requisition_Slip_PDF_With_Dropzone_QR`: Verifies Lab Requisition PDF generation.
3. `ClinicDocumentPdfService_Should_Generate_Valid_Prescription_PDF_Generics_Act_Compliant`: Verifies Prescription PDF generation with generic and brand names on A5.
4. `IssueMedicalCertificateCommand_Should_Generate_Sequential_Numbers_Safely`: Verifies sequential certificate numbering.
5. `ClinicDocumentPdfService_Should_Generate_Valid_Referral_Letter_PDF_With_Security_Seal`: Verifies Referral Letter PDF generation on A4.
6. `DocumentVerificationResultDto_MaskName_Should_Protect_Patient_Privacy`: Verifies privacy masking on names.
7. `ClinicDocumentPdfService_Should_Generate_Valid_Reception_Placard_PDF`: Verifies reception placard PDF.

#### New Tests Required in `HardenedDocumentGenerationTests.cs`:
1. **Full 4x3x3 Matrix Parameterized Theory**:
   ```csharp
   [Theory]
   [MemberData(nameof(DocumentGenerationMatrixData))]
   public void GeneratePdf_Across_All_DocumentTypes_SignatureModes_And_PaperSizes_Should_Produce_Valid_Pdf(
       DocumentType docType,
       DocumentSignatureMode mode,
       DocumentPaperSize paperSize)
   ```
   Generates all 36 combinations (4 document types × 3 signature modes × 3 paper sizes: Letter, A4, A5), asserting valid PDF headers, non-empty content, and correct size definitions.

2. **Wet Signature Regulatory Suppression & Hash Preservation Test**:
   - Asserts that when `mode == DocumentSignatureMode.WetSignature`:
     - Text "✓ Digitally Certified & Locked" is **NOT** present in the rendered document.
     - No electronic signature specimen image is embedded.
     - Document footer **still contains** valid cryptographic digest and verification QR code.
     - Signature area contains an empty physical pen signing line.

3. **E-Signature Specimen Embedding & Stamp Verification Test**:
   - Asserts that when `mode == DocumentSignatureMode.ESignatureSpecimen` with transparent PNG bytes provided:
     - Signature image is rendered above the signature line.
     - "✓ Digitally Certified & Locked" green badge text is present.
     - Physician credentials (PRC, PTR, S2, PAN) are rendered.

4. **Digital Verification Seal Mode Test**:
   - Asserts that when `mode == DocumentSignatureMode.DigitalSealOnly`:
     - No signature image bytes are embedded.
     - Printed credentials + "✓ Digitally Certified & Locked" text are present.

5. **Custom Clinic Logo Rendering Test**:
   - When `PrimaryLogoBytes` (sample PNG bytes) is provided in `TenantPrintoutConfig` / `ClinicSettings`, PDF successfully embeds the logo without throwing, falling back gracefully to text when bytes are null.

6. **Controller `?wet=true|false` Query Parameter Integration Tests**:
   - `DocumentsController_DownloadMedicalCertificatePdf_With_Wet_Param`: Verifies `?wet=true` passes `WetSignature` mode to `_pdfService`.
   - `DocumentsController_DownloadReferralLetterPdf_With_Wet_Param`: Verifies `?wet=true` passes `WetSignature` mode.
   - `PrescriptionsController_DownloadPrescriptionPdf_With_Wet_Param`: Verifies `?wet=true` passes `WetSignature` mode.
   - `LabOrdersController_DownloadLabOrderSlipPdf_With_Wet_Param`: Verifies `?wet=true` passes `WetSignature` mode.

7. **Staff Entity & Command Tests**:
   - Unit tests verifying `StaffMember.SignatureSpecimen` and `StaffMember.DefaultSignatureMode` persistence via `UpdateMyProfileCommand` and `UpdateStaffMemberCommand`.

---

### 3.2 Frontend: `apps/clinic-app/tests/`

#### Existing Tests:
- 129 test files, 2,342 passing tests covering OPD queue, audit workstation, patient directory, consultations, dental chart, etc.
- No tests currently cover `DocumentTemplatesSettingsTab.tsx`, staff signature specimen management, or PDEA S2 prescription print modal controls.

#### New Frontend Test Files Required:

| New Test File | Key Test Scenarios |
|---|---|
| `tests/documentTemplatesSettingsTab.test.ts` | 1. **High-Density Two-Column Layout**: Left column renders form inputs (Facility Header, Sub-Header, Physical Address, Contact, DOH LTO, PhilHealth Accreditation, Accent Color, Paper Size, Legal Disclaimer). Right column renders canvas preview.<br>2. **Document Type Switcher**: Switching tabs between `Medical Certificate`, `Prescription`, `Lab Order`, and `Referral Letter` updates preview model.<br>3. **Live Interactive Preview**: Updating form input fields reactively updates preview text.<br>4. **Signature Mode Toggle**: Toggling between E-Signature and Wet Signature updates preview stamp and badge.<br>5. **Sample Test PDF**: "Print Sample Test PDF" button triggers mock PDF generation / download.<br>6. **4 UI States**: Skeleton (loading settings), Empty (no facility profile), Error (API failure with Retry), Active (interactive studio).<br>7. **Design Token Guard**: Zero hardcoded hex colors, strict consumption of `theme.colors`. |
| `tests/staffSignatureSpecimen.test.ts` | 1. **Profile Signature Management**: Doctor profile allows uploading PNG or drawing on signature pad.<br>2. **Default Signing Mode Selector**: Selector for `ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`.<br>3. **Physician Stamp Imprint**: Real-time preview rendering doctor name, PRC Lic. No., PTR No., PDEA S2 No., and PhilHealth PAN overlaid with signature image.<br>4. **Staff Management Tab Gating**: Admin can inspect / configure doctor signature mode in `StaffManagementTab.tsx`. |
| `tests/pdeaPrescriptionHardening.test.ts` | 1. **Instant Print Options Selector**: Renders `[🖋️ E-Signed PDF]` and `[📝 Wet Signature (Pen)]` in `PrescriptionSlipModal.tsx` and `Consultations.screen.tsx`.<br>2. **Doctor Default Mode**: Preselects attending doctor's configured `DefaultSignatureMode`.<br>3. **PDEA S2 Automatic Default**: If prescription contains any dangerous drug (`isDangerousDrug === true` or PDEA S2), automatically overrides to **Wet Signature Mode**.<br>4. **PDEA S2 Statutory Warning Badge**: Renders regulatory alert: *"⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."*<br>5. **Non-Regulated Fallback**: Clean prescriptions without dangerous drugs allow free selection of E-Signature mode without forced restriction. |

---

### 3.3 Design Tokens: `packages/design-tokens`

#### Existing Tests:
- `tokens.test.ts` runs 27 tests checking key parity, valid formats, contrast ratios, and minimum typography (>= 12px).
- Linter script `apps/clinic-app/scripts/check-tokens.mjs --strict` scans AST/regex across all clinic-app components.

#### Verification Protocol for New UI:
- No new token definitions needed in `packages/design-tokens/src` unless accent color override requires a specific token interface.
- Any new component created must be verified with:
  `PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict`
  to guarantee zero regressions.

---

## 4. 4-Tier Edge Cases, Boundary Cases, and PDEA S2 Scenarios

```
   ┌────────────────────────────────────────────────────────┐
   │ TIER 1: DOMAIN & ENTITY VALIDATION                     │
   │ - StaffMember.DefaultSignatureMode enum parse          │
   │ - SignatureSpecimen PNG base64 validation              │
   │ - PaperSize enum ("Letter", "A4", "A5") mapping        │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ TIER 2: BACKEND QUESTPDF GENERATION & APIS             │
   │ - 36-combination matrix (4 types x 3 modes x 3 sizes)  │
   │ - Wet mode suppresses "Digitally Certified" badge      │
   │ - Blank pen line spacing & verification hash preserved │
   │ - Custom clinic logo bytes rendering & aspect ratio    │
   │ - Controllers ?wet=true|false query parameter binding  │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ TIER 3: FRONTEND WORKSTATION & STUDIO COMPONENTS       │
   │ - DocumentTemplatesSettingsTab 2-column layout (>=1024)│
   │ - Reactive debounced canvas live preview               │
   │ - 4 core UI states (Skeleton, Empty, Error, Active)    │
   │ - Doctor Physician Stamp Imprint with S2 & PhilHealth   │
   └──────────────────────────┬─────────────────────────────┘
                              │
   ┌──────────────────────────▼─────────────────────────────┐
   │ TIER 4: REGULATORY & PDEA S2 CLINICAL ISSUANCE FLOW    │
   │ - Dangerous drug detection (isDangerousDrug == true)   │
   │ - Automatic enforcement of Wet Signature Mode          │
   │ - Prominent PDEA S2 statutory warning banner           │
   │ - Tamper-evident QR code resolution to /verify/<digest>│
   └────────────────────────────────────────────────────────┘
```

### Detailed Edge Case Specification Matrix

| ID | Tier | Category | Scenario / Boundary Case | Expected Behavior |
|---|---|---|---|---|
| **E1** | Tier 1 | Domain | `SignatureSpecimen` exceeds maximum size (e.g. > 500KB raw base64) or is non-PNG MIME type | Rejection with clean 400 validation error; only transparent PNG accepted. |
| **E2** | Tier 1 | Domain | `DefaultSignatureMode` missing or null in database for legacy doctor record | Graceful fallback default to `ESignatureSpecimen` if signature exists, or `DigitalSealOnly` if no signature uploaded. |
| **E3** | Tier 2 | PDF Engine | `PaperSize == "A5"` compact canvas (148 × 210 mm) with multi-item prescription (6+ drugs) | Flow cleanly across pages or tighten vertical margins without text overlapping footer or barcode. |
| **E4** | Tier 2 | PDF Engine | `PrimaryLogoBytes` is corrupted / invalid image header | Catch decoder exception gracefully; suppress logo and render text facility header without crashing document generation. |
| **E5** | Tier 2 | PDF Engine | `AccentColorHex` has missing `#` or is 3-digit shorthand (e.g. `0D6` or `0D6963`) | `TenantPrintoutConfig.GetSafePrimaryColorHex()` normalizes to 6-digit `#RRGGBB` or falls back to `#0284C7`. |
| **E6** | Tier 2 | Regulatory | `WetSignature` mode on MedCert / Referral / Rx / Lab Slip | **Suppresses** "✓ Digitally Certified & Locked" green text; renders blank signature underline for physical pen signing; **preserves** cryptographic SHA-256 digest and QR code in footer. |
| **E7** | Tier 2 | API Binding | Controller receives `?wet=true` vs `?wet=false` vs omitted query string | Defaults `wet` to `false` when omitted; when `true`, instructs `_pdfService` to render in `WetSignature` mode. |
| **E8** | Tier 3 | Frontend UI | Viewport width is mobile (< 1024px) vs desktop workstation (>= 1024px) | Adapts from side-by-side two-column workstation to stacked editor/preview tab switcher without horizontal scroll blowout. |
| **E9** | Tier 3 | UI States | Initial settings fetch is loading vs network disconnected | Displays high-density Skeleton loader; on error displays error banner with "Retry" action; never flashes unstyled content. |
| **E10** | Tier 4 | PDEA S2 | Prescription contains 1 PDEA S2 dangerous drug (e.g. Morphine, Fentanyl, Methylphenidate) and 2 generic drugs | Modal automatically locks/defaults print option to **Wet Signature Mode**; renders statutory yellow/amber warning banner citing DOH-PDEA regulations. |
| **E11** | Tier 4 | PDEA S2 | Doctor attempts to override PDEA S2 prescription to E-Signature | UI displays alert dialog explaining physical wet ink signature on special DOH prescription pad is statutory under RA 9165 / PDEA regulations; blocks or requires explicit confirmation. |
| **E12** | Tier 4 | Verification | Scanning QR code on printed document (even wet-signed) | URL directs to public verification portal `/verify/<digest>`, verifying facility authenticity, document issue date, and doctor PRC without revealing private clinical prose (DPA RA 10173 compliance). |

---

## 5. Caveats
1. **Worktree Environment Dependency**: In git worktrees within this monorepo, `node_modules` must be symlinked to the primary worktree (`/Users/macuser/projects/github/nextstep/clinicez-arch2/node_modules`) because npm/bun dependencies are gitignored and not copied into new worktrees. The symlinks have now been established in `clinicez-docs-studio`.
2. **Subshell PATH for Bun/Node**: In non-interactive test runs that invoke node scripts (such as AST design-token verification inside `auditWorkstation.test.ts`), `PATH="$HOME/.bun/bin:$PATH"` must be present in the execution environment so child processes can resolve `node`.
3. **No Direct Modifications**: In accordance with the Explorer archetype rules, no production source code was modified during this survey. Only the required metadata (`DISPATCH.md`, `BRIEFING.md`, `progress.md`, `handoff.md`) and the gitignored `node_modules` symlink were touched.

---

## 6. Conclusion
- The test harness across `clinicez-docs-studio` is fully operational and healthy:
  - **.NET**: Passes 9/9 tests in 1s.
  - **Design Tokens**: Passes 27/27 tests in 50ms, with 0 token violations in strict mode.
  - **Clinic App**: Passes all 2,342 existing tests across 129 files in 21s with 0 regressions.
- The existing codebase currently implements only baseline document generation. To satisfy the acceptance criteria of `ORIGINAL_REQUEST.md`, four distinct implementation and test efforts are required:
  1. **Backend Matrix Tests (`HardenedDocumentGenerationTests.cs`)**: Expand to 36-test parameterized matrix (4 doc types × 3 signature modes × 3 paper sizes), plus custom logo tests, `?wet=` controller tests, and wet signature text suppression checks.
  2. **Document Templates Studio Tab (`DocumentTemplatesSettingsTab.tsx` & test)**: Implement two-column workstation layout under `'documents'` tab with live preview and 4 UI states.
  3. **Doctor Profile E-Signature Specimen (`Profile.screen.tsx`, `StaffManagementTab.tsx` & test)**: Add specimen upload/draw, default signing mode picker, and real-time stamp imprint preview.
  4. **PDEA S2 Print Safeguard (`PrescriptionSlipModal.tsx`, `Consultations.screen.tsx` & test)**: Add instant `[🖋️ E-Signed]` / `[📝 Wet Signature]` selector with automatic wet default and statutory warning badge for dangerous drugs.

---

## 7. Verification Method

To independently verify the test infrastructure and findings reported herein, execute the following commands from `/Users/macuser/projects/github/nextstep/clinicez-docs-studio`:

### Verify Suite 1: .NET HardenedDocumentGenerationTests
```bash
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
```
*Expected*: Build succeeds and passes 9 tests in ~1s.

### Verify Suite 2: Design Tokens & Token Guard
```bash
~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts
PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict
```
*Expected*: `tokens.test.ts` passes 27 tests in <100ms; `check-tokens.mjs` reports 0 violations.

### Verify Suite 3: Full Clinic App Test Suite
```bash
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/
```
*Expected*: Passes 2,342 tests across 129 files in ~21s with 0 failures.

### Verify TypeScript Strict Typechecking
```bash
PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic
```
*Expected*: Clean exit with code 0 in ~3s.

### Invalidation Conditions
- Any changes that introduce raw hex color literals, un-tokenized font sizes, or unapproved icons into `apps/clinic-app` will trigger failure in `check-tokens.mjs --strict`.
- Generating a wet-signed PDF that inadvertently leaves "✓ Digitally Certified & Locked" in the canvas invalidates DOH-PDEA wet signature compliance.
- Omitting the `node_modules` symlinks or running without `~/.bun/bin` on `PATH` will fail package resolution or child process execution.
