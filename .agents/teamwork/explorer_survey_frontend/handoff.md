# Frontend Survey Report: Clinical Document Customization Studio & Tri-Mode Doctor Signing

**Author:** explorer_survey_frontend  
**Timestamp:** 2026-10-20T02:10:00Z  
**Target Repository:** `/Users/macuser/projects/github/nextstep/clinicez-docs-studio`  
**Milestone:** Survey / Architectural Analysis (Read-Only)

---

## 1. Observations

### 1.1 Settings Navigation & Tab Architecture
- **Tab Key Registry (`apps/clinic-app/components/settings/types.ts` lines 1–10)**:
  ```typescript
  export type SettingsTabKey =
    | 'general'
    | 'readiness'
    | 'staff'
    | 'rbac'
    | 'services'
    | 'fields'
    | 'philhealth'
    | 'license'
    | 'audit';
  ```
  Currently missing `'documents'` key in the union.
- **Settings Screen (`apps/clinic-app/navigation/screens/Settings.screen.tsx` lines 336–424, 468–591)**:
  - Builds tab list dynamically based on RBAC permissions (`isAdmin`, `canManageStaff`, `canManageRoles`, `canViewAudit`).
  - Active tab rendered inside a main `ScrollView` using conditional expressions (`{activeTab === 'general' && <GeneralSettingsTab ... />}`).
  - Tab switcher is `<SettingsTabBar tabs={tabs} activeTab={activeTab} onSelectTab={setActiveTab} />`.
- **Existing Stationery Fields in `GeneralSettingsTab.tsx` (lines 286–365, 370–450)**:
  - Lines 344–360: Form currently renders inputs for `letterheadHeader`, `letterheadAddress`, and `letterheadContact`.
  - Lines 370–450: Renders Clinic Branding card with logo preview, `pickClinicLogo` (from `utils/logoUploader.ts`), `LogoCropModal`, and `<ColorBrandingSection />`.
  - Lines 498–502: Specialty mode and dental module toggle.
- **Settings Data Contract (`apps/clinic-app/services/clinicService.ts` lines 1761–1806)**:
  ```typescript
  export interface ClinicSettingsRecord {
    id: string;
    tenantId: string;
    clinicId: string;
    clinicName: string;
    taxIdentificationNumber?: string;
    accreditationNumber?: string;
    operatingHours: string;
    defaultSlotDurationMinutes: number;
    queuePrefix: string;
    invoicePrefix: string;
    defaultConsultationFee: number;
    vatRate: number;
    letterheadHeader?: string;
    letterheadSubHeader?: string;
    letterheadAddress?: string;
    letterheadContact?: string;
    letterheadFooter?: string;
    preferredChartLayout?: 'modal' | 'split' | 'drawer';
    primaryLogoUrl?: string | null;
    primaryColorHex?: string;
    // ...
  }
  ```
  Note: `PaperSize` is already in backend `ClinicSettings.cs` (line 55: `public string PaperSize { get; set; } = "Letter";`) and `UpdateClinicSettingsCommand.cs` (line 30: `string? PaperSize = null;`), but needs to be added to `ClinicSettingsRecord` and `updateSettings()` payload in `clinicService.ts`. Also `dohLicenseToOperate` is in backend `TenantPrintoutConfig.cs` (line 35: `public string? DohLicenseToOperate { get; set; }`).

---

### 1.2 Clinician E-Signature Specimen Management
- **Doctor Stamp in Profile Screen (`apps/clinic-app/navigation/screens/Profile.screen.tsx` lines 349–388)**:
  - Renders an "Official Doctor Stamp Live Specimen" in `styles.stampBox`:
    ```tsx
    <View style={styles.stampBox}>
      <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.stampName}>
        {`${title ? `${title} ` : 'DR. '}${firstName || 'First'} ${lastName || 'Last'}`.toUpperCase()}
      </ThemedText>
      <ThemedText variant="small" color={theme.colors.textSecondary}>
        {specialty || 'General / Primary Care Medicine'}
      </ThemedText>
      <View style={styles.stampDivider} />
      <ThemedText variant="small" color={theme.colors.text}>
        {prc ? `PRC License No. ${prc}` : 'PRC License No. [Required for Prescriptions]'}
      </ThemedText>
      {ptr ? <ThemedText variant="caption" color={theme.colors.textMuted}>{ptr}</ThemedText> : null}
      {pan ? <ThemedText variant="caption" color={theme.colors.textMuted}>{`PhilHealth PAN: ${pan}`}</ThemedText> : null}
      {s2 ? <ThemedText variant="captionBold" color={theme.colors.emergency}>{s2}</ThemedText> : null}
    </View>
    ```
  - Observation: There is **no signature upload or drawing pad** in `Profile.screen.tsx`.
- **Doctor Stamp in Staff Directory (`apps/clinic-app/components/settings/StaffManagementTab.tsx` lines 1564–1612)**:
  - Dedicated `stampModalStaff` preview modal rendering `styles.stampBoxLarge` with identical textual credentials.
  - Observation: No e-signature specimen overlay or default signing mode selection exists.
- **Staff Entity Definition (`apps/clinic-app/services/clinicService.ts` lines 61–88)**:
  - Currently stores: `id`, `tenantId`, `clinicId`, `firstName`, `lastName`, `middleName`, `title`, `role`, `email`, `phoneNumber`, `prcLicenseNumber`, `ptrNumber`, `s2LicenseNumber`, `philHealthPan`, `specialty`, `isActive`.
  - Observation: `signatureSpecimen` (transparent PNG URI / base64) and `defaultSignatureMode` (`ESignatureSpecimen` | `DigitalSealOnly` | `WetSignature`) are **not yet defined** on `StaffMember`, `CreateStaffPayload`, or `UpdateMyProfilePayload`.
- **Drawing & Upload Precedents**:
  - Image upload with base64 conversion is in `apps/clinic-app/utils/logoUploader.ts` (`pickClinicLogo()`).
  - Web canvas handling is in `apps/clinic-app/components/settings/LogoCropModal.tsx` lines 391–405 (`document.createElement('canvas')`, `toDataURL('image/png')`).

---

### 1.3 Workstation Print & Issuance Hardening (PDEA S2 Safeguard)
- **Prescription Slip Modal (`apps/clinic-app/components/PrescriptionSlipModal.tsx` lines 41–67, 234–240)**:
  - Print handler:
    ```typescript
    const handlePrint = async () => {
      try {
        const url = slip.consultationId
          ? clinicService.getPrescriptionSlipPdfUrl(slip.consultationId)
          : clinicService.getPrescriptionSlipPdfByNumberUrl(slip.prescriptionNumber);
        const opened = await openPrintableUrl(url);
        // ...
      }
    };
    ```
  - Line 239: Item already flags dangerous drugs:
    ```tsx
    {item.isDangerousDrug ? <Badge label="Dangerous drug (PDEA)" variant="emergency" /> : null}
    ```
  - Observation: Currently only has a single "Download / print PDF" button. There is no `[ 🖋️ E-Signed PDF ]` | `[ 📝 Wet Signature (Pen) ]` option selector, no automatic defaulting to wet signature when `item.isDangerousDrug == true`, and no regulatory warning banner.
- **Consultation Workstation (`apps/clinic-app/navigation/screens/Consultations.screen.tsx`)**:
  - Line 1838: `const hasDangerousDrug = prescriptions.some((p) => p.isDangerousDrug);`
  - Line 2243: `const s2Valid = !hasDangerousDrug || !!(doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim());`
  - Lines 4785–4814: `previewDocModal` for Medical Certificate and Referral Letter triggers `downloadPdf(clinicService.getMedicalCertificatePdfUrl(issuedMedCert.id), ...)` and `downloadPdf(clinicService.getReferralLetterPdfUrl(issuedReferral.id), ...)`.
  - Observation: These PDF URL builders currently lack `{ wet: boolean }` query parameters (`?wet=true|false`).
- **Backend API Endpoints (`services/clinic-api/ClinicEz.Clinic.Api/Controllers/`)**:
  - `DocumentsController.cs` (lines 48, 77):
    - `[HttpGet("medical-certificates/{id:guid}/pdf")]`
    - `[HttpGet("referrals/{id:guid}/pdf")]`
  - `PrescriptionsController.cs` (line 120):
    - `[HttpGet("{consultationId:guid}/slip-pdf")]`
  - `LabOrdersController.cs` (line 74):
    - `[HttpGet("{id:guid}/pdf")]`
  - Observation: Controllers currently do not take `[FromQuery] bool wet = false`.

---

### 1.4 Design Tokens & Lint Verification
- **Token Test Suite**:
  - Ran: `~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`
  - Result: **27 passed, 0 failed, 167 expect() calls**.
  - Verified: Semantic tokens (`lightColors`, `darkColors`), contrast ratio >= 4.5:1, typography minimum 12px.
- **Design Token Guard (`apps/clinic-app/scripts/check-tokens.mjs`)**:
  - Ran: `~/.bun/bin/bun run lint:tokens`
  - Result: **0 violations**.
  - Strict Rules Enforced:
    1. No hex / rgb(a) color literals outside `constants/`.
    2. No numeric `fontSize: <number>`.
    3. No numeric `*Radius: <number>` (except `shadowRadius`).
    4. **No raw emojis/pictographs in JSX strings** (e.g. 🖋️, 📝, ⚠️). Must use `<Icon name="..." />` or Lucide icons to avoid lint failure.

---

## 2. Logic Chain

1. **Settings Navigation Integration**:
   - `SettingsTabKey` in `components/settings/types.ts` is the single source of truth for tab keys. Adding `'documents'` allows `Settings.screen.tsx` to include the tab item `{ key: 'documents', label: 'Document & Stationery Studio', icon: 'file' }`.
   - Adding conditional branch `{activeTab === 'documents' && <DocumentTemplatesSettingsTab ... />}` mounts the studio without disturbing existing settings.

2. **High-Density Two-Column Workstation Layout**:
   - Clinicians need instantaneous visual confirmation when modifying letterhead, branding, margins, or statutory disclosures.
   - Left column (45% on desktop, stacked on mobile) encapsulates form controls for:
     - Facility Header, Sub-Header/Tagline, Address, Contact, DOH LTO, PhilHealth Accreditation.
     - Logo upload with preview and remove action (reusing `pickClinicLogo`).
     - Accent color picker (reusing `BRAND_COLOR_PRESETS` and `isUsableAccent`).
     - Paper Size selector (`Letter`, `A4`, `A5`) using `SegmentedControl`.
     - Statutory legal disclaimer footer textarea.
   - Right column (55% on desktop) encapsulates an interactive canvas:
     - Segmented switcher across 4 document types: Medical Certificate, e-Rx, Diagnostic Requisition Slip, Clinical Referral Letter.
     - Segmented switcher between E-Signature Specimen and Wet Signature mode.
     - Paper canvas scaled with aspect ratios (`Letter`: 0.772, `A4`: 0.707, `A5`: 0.705).
     - Live reactive updates: Any change in the left column immediately re-renders the right column canvas.
     - "Print Sample Test PDF" button: Triggers test PDF download/open.
   - 4 UI states required:
     - Skeleton: `<SkeletonList />` during initial load.
     - Empty: `<EmptyState />` if clinic settings cannot be found.
     - Error: `<ErrorState />` with retry on network failure.
     - Active: Full interactive studio.

3. **Clinician E-Signature Specimen Management**:
   - `StaffMember` entity must store:
     - `signatureSpecimen?: string | null` (transparent PNG Data URI `data:image/png;base64,...`).
     - `defaultSignatureMode?: 'ESignatureSpecimen' | 'DigitalSealOnly' | 'WetSignature'`.
   - In `Profile.screen.tsx` (for self) and `StaffManagementTab.tsx` (for doctors in staff directory):
     - Provide dual input: (a) "Upload Signature (PNG)" via file picker, and (b) "Draw Signature" via interactive signature pad canvas with Clear/Undo.
     - Mode selection dropdown or segmented control for `defaultSignatureMode`.
     - Real-time Physician Stamp Imprint preview: Doctor stamp box with PRC, PTR, PhilHealth PAN, and PDEA S2 credentials, with the doctor's signature specimen transparent PNG positioned directly over the stamp imprint.

4. **Workstation Print & Issuance Hardening**:
   - In `PrescriptionSlipModal.tsx` and `Consultations.screen.tsx` (`previewDocModal`):
     - Add print options segmented selector: `[ E-Signed PDF ]` | `[ Wet Signature (Pen) ]` with appropriate Lucide icons.
     - Defaulting Logic:
       - Attending doctor's `defaultSignatureMode` dictates default state.
       - **PDEA S2 Automatic Safeguard**: If `slip.items.some(i => i.isDangerousDrug)` or `prescriptions.some(p => p.isDangerousDrug)`:
         * System **forcibly defaults to Wet Signature Mode**.
         * Displays prominent warning badge:
           *"PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."*
     - PDF download queries: Append `?wet=${isWetMode}` to PDF URLs.

---

## 3. Caveats

1. **Emoji Token Lint Rule**:
   - The user request specifies `[ 🖋️ E-Signed PDF ]` | `[ 📝 Wet Signature (Pen) ]` and `⚠️ PDEA S2 Regulated Substance`.
   - However, `apps/clinic-app/scripts/check-tokens.mjs` strictly forbids emoji characters in code (`RULES.emoji`).
   - *Resolution*: Use Lucide icons via `<Icon name="checkCircle" />` / `<Icon name="pencil" />` / `<Icon name="alert" />` with textual labels "E-Signed PDF", "Wet Signature (Pen)", and warning badges. If raw emoji glyphs are strictly required in test strings, use `token-guard:ignore-file` or Unicode escape sequences.
2. **Offline Local Storage vs. Server Sync**:
   - In offline mode, signature specimens and clinic settings must fall back gracefully to local storage (`deviceStorage.ts`) and cache, just like clinic logo.
3. **Paper Size Support in Backend**:
   - QuestPDF in `ClinicDocumentPdfService.cs` already handles `PageSizes.Letter`, `PageSizes.A4`, and `PageSizes.A5`. The frontend paper size selector must map to `"Letter" | "A4" | "A5"`.

---

## 4. Conclusion & Concrete Plan for Implementers

### Component & File Changes Summary

| Target File | Changes Required |
|---|---|
| `apps/clinic-app/components/settings/types.ts` | Add `'documents'` to `SettingsTabKey`. |
| `apps/clinic-app/navigation/screens/Settings.screen.tsx` | Register `'documents'` tab (`label: 'Document & Stationery Studio'`, `icon: 'file'`), mount `<DocumentTemplatesSettingsTab />`. |
| `apps/clinic-app/components/settings/DocumentTemplatesSettingsTab.tsx` | **New file**: High-density 2-column workstation layout. Left: form controls (Header, Sub-Header, Address, Contact, DOH LTO, PhilHealth Acc., Logo upload, Accent color, Paper size, Disclaimer). Right: live reactive canvas with 4 document switcher, signature toggle, and "Print Sample Test PDF" button. |
| `apps/clinic-app/services/clinicService.ts` | 1. Add `paperSize?: 'Letter' \| 'A4' \| 'A5'`, `dohLicenseToOperate?: string` to `ClinicSettingsRecord`.<br>2. Add `signatureSpecimen?: string \| null`, `defaultSignatureMode?: 'ESignatureSpecimen' \| 'DigitalSealOnly' \| 'WetSignature'` to `StaffMember`, `CreateStaffPayload`, `UpdateStaffPayload`, `UpdateMyProfilePayload`.<br>3. Add `{ wet?: boolean }` options to `getPrescriptionSlipPdfUrl`, `getMedicalCertificatePdfUrl`, `getReferralLetterPdfUrl`, `getLabOrderSlipPdfUrl`.<br>4. Add `getSampleDocumentPdfUrl(type, options)`. |
| `apps/clinic-app/components/settings/SignatureSpecimenModal.tsx` | **New file**: Modal with dual tab: Upload transparent PNG or Draw on canvas/touchpad with Clear/Undo, plus default mode selection. |
| `apps/clinic-app/navigation/screens/Profile.screen.tsx` | Add Signature Specimen management section in Doctor credentials card with live Physician Stamp overlay. |
| `apps/clinic-app/components/settings/StaffManagementTab.tsx` | Add Signature Specimen upload/draw to Doctor edit modal and render signature overlay in `stampModalStaff`. |
| `apps/clinic-app/components/PrescriptionSlipModal.tsx` | Add `[ E-Signed PDF ]` \| `[ Wet Signature (Pen) ]` switcher. Add PDEA S2 dangerous drug check defaulting to wet mode with prominent regulatory warning badge. Pass `?wet=true\|false` to PDF download. |
| `apps/clinic-app/navigation/screens/Consultations.screen.tsx` | In `previewDocModal`, add wet vs e-signed selector before downloading MedCert and Referral PDFs. |
| `apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts` | **New test suite**: Verify 2-column layout, switcher between 4 document types, signature mode toggle, paper size selector, token compliance. |
| `apps/clinic-app/tests/pdeaPrescriptionPrintHardening.test.ts` | **New test suite**: Verify PDEA S2 automatic default to wet mode, warning badge rendering, and query parameter generation. |

---

## 5. Verification Method

### Automated Commands
```bash
# 1. Verify Design Tokens package (must be 27 passed, 0 failures)
~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts

# 2. Verify token lint compliance (must be 0 violations)
~/.bun/bin/bun run --cwd apps/clinic-app lint:tokens

# 3. Verify .NET Backend Tri-Mode PDF Tests
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"

# 4. Verify Frontend Test Suites
~/.bun/bin/bun test apps/clinic-app/tests/generalSettingsTab.test.ts
~/.bun/bin/bun test apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts
~/.bun/bin/bun test apps/clinic-app/tests/pdeaPrescriptionPrintHardening.test.ts
```

### Invalidation Conditions
- Any hardcoded hex colors, rgb values, or raw numeric font sizes in newly created `.tsx` files.
- Literal emoji pictographs in code causing `scripts/check-tokens.mjs` regression.
- Failure of `PrescriptionSlipModal` to default to Wet Signature mode when `isDangerousDrug == true`.
- Generated document preview failing to reactively update when letterhead inputs or paper size are modified.
