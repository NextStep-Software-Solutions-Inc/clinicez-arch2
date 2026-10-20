# Backend Architectural Survey: Clinical Document Customization Studio & Tri-Mode Doctor Signing

## 1. Observation

### 1.1 `StaffMember` Entity and Profile Credential Management
- **Entity Location**: `services/clinic-api/ClinicEz.Clinic.Domain/Entities/StaffMember.cs` (lines 10-100).
- **Existing Professional Credentials**:
  - `PrcLicenseNumber` (string, max 50)
  - `PtrNumber` (string, max 50)
  - `S2LicenseNumber` (string, max 50)
  - `Specialty` (string, max 100)
  - `PhilHealthPan` (string, max 50)
- **Database Mapping**: In `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`:
  - `StaffMembers` DbSet on line 33.
  - Multi-tenant query filter on line 120: `modelBuilder.Entity<StaffMember>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);`
  - Fluent configuration on lines 214-238.
  - Enums are automatically converted to strings via convention (`configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(50);`, lines 90-92).
- **Current Gaps in `StaffMember`**:
  - Missing `SignatureSpecimen` (needs `string?` storing base64 transparent PNG data URI or raw base64, configured as `text` column in EF Core).
  - Missing `DefaultSignatureMode` (needs enum `SignatureMode` defaulting to `SignatureMode.ESignatureSpecimen`).
- **DTOs and CQRS Commands Affected**:
  - `StaffMemberDto.cs` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Staff/DTOs/StaffMemberDto.cs`, lines 7-76): Needs `string? SignatureSpecimen = null` and `SignatureMode DefaultSignatureMode = SignatureMode.ESignatureSpecimen`.
  - `CreateStaffMemberCommand.cs` (lines 21-37): Needs `string? SignatureSpecimen = null` and `SignatureMode? DefaultSignatureMode = null`.
  - `UpdateStaffMemberCommand.cs` (lines 18-35): Needs `string? SignatureSpecimen = null` and `SignatureMode? DefaultSignatureMode = null`.
  - `UpdateMyProfileCommand.cs` (lines 17-30): Needs `string? SignatureSpecimen = null` and `SignatureMode? DefaultSignatureMode = null`.
  - `StaffController.cs` (lines 44-69, 209-220): `UpdateMyProfileRequest` and `UpdateStaffMemberRequest` need to expose `SignatureSpecimen` and `DefaultSignatureMode`.

### 1.2 `TenantPrintoutConfig` and `packages/shared-dotnet` Documents Pipeline
- **Configuration Entity**: `packages/shared-dotnet/Documents/Configuration/TenantPrintoutConfig.cs`:
  - Paper sizes defined: `DocumentPaperSize { Letter, A4, A5 }` (lines 8-13).
  - Branding properties: `PrimaryLogoUrl`, `PrimaryLogoBytes`, `SecondaryLogoUrl`, `SecondaryLogoBytes`, `PrimaryColorHex`, `AccentColorHex` (lines 18-24).
  - Layout: `PaperSize`, `PageMarginMm` (lines 26-27).
  - Facility Details: `FacilityName`, `FacilitySubHeader`, `PhysicalAddress`, `ContactNumbers`, `EmailAndWeb`, `DohLicenseToOperate`, `PhilHealthAccreditationNumber` (lines 30-36).
  - Footer & Security: `CustomDisclaimerText`, `ShowSecurityQrCode` (lines 39-41).
- **Header Rendering**: `TenantLetterheadComponent.cs` (lines 22-27):
  ```csharp
  if (_config.PrimaryLogoBytes != null && _config.PrimaryLogoBytes.Length > 0)
  {
      row.ConstantItem(55).Height(50).Image(_config.PrimaryLogoBytes);
  }
  ```
- **Footer Rendering**: `DocumentFooterComponent.cs` (lines 27-60):
  - Renders QR code image (`_qrCodeBytes`), `_config.CustomDisclaimerText`, and `Security Hash: {_verificationCode}`.

### 1.3 `ClinicDocumentPdfService.cs` Construction Across the 4 Document Types
Located in `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs`:
1. **Medical Certificate** (`GenerateMedicalCertificatePdf`, lines 39-189):
   - Computes HMAC-SHA256 digest (`_securityService.ComputeDocumentDigest(...)`).
   - Generates verification QR code (`_qrCodeService.GenerateQrCodePng(verifyUrl, 4)`).
   - Renders letterhead, clinical findings, fitness status, rest recommendation, purpose.
   - Doctor stamp box (lines 167-181) has hardcoded blank line with fixed 35pt height and hardcoded text:
     `stamp.Item().PaddingTop(2).AlignCenter().Text("✓ Digitally Certified & Locked").FontSize(7.5f).Bold().FontColor("#16A34A");`
2. **Diagnostic Requisition Slip** (`GenerateLabRequisitionSlipPdf`, lines 191-365):
   - Renders patient demographics, requested tests table, dual-path interop dropzone QR.
   - Doctor stamp box (lines 347-357) has 30pt height and signature line, but no dynamic signature image.
3. **Electronic Prescription** (`GeneratePrescriptionPdf`, lines 367-561):
   - Renders ℞ symbol, patient & physician info, allergy alerts, generic medications list with dosages, refills, and dangerous drug flags.
   - Doctor stamp box (lines 539-554) has fixed text:
     `stamp.Item().PaddingTop(2).AlignCenter().Text("✓ Officially Signed e-Prescription (FDA Circular 2020-004)").FontSize(7f).Bold().FontColor("#16A34A");`
4. **Clinical Referral Letter** (`GenerateReferralLetterPdf`, lines 564-738):
   - Renders target facility/department, patient strip, provisional diagnosis, reason for referral, medications, diagnostics.
   - Referring physician block (lines 709-730) has credentials and text:
     `stamp.Item().PaddingTop(3).AlignCenter().Text("✓ Officially Certified Clinical Referral & Transfer").FontSize(7.5f).Bold().FontColor("#16A34A");`
   - Note: Lacks a horizontal signing line above doctor name.

### 1.4 Clinic Logo Decoding Gap
- `ClinicSettings.cs` has `public string? PrimaryLogoUrl { get; set; }` (line 54).
- `ClinicDocumentPdfService.MapToTenantConfig(ClinicSettings settings)` (lines 851-869) sets `FacilityName`, `FacilitySubHeader`, `PhysicalAddress`, `ContactNumbers`, `PhilHealthAccreditationNumber`, `PrimaryColorHex`, `PaperSize`, `CustomDisclaimerText`.
- **Finding**: `MapToTenantConfig` completely omits `PrimaryLogoBytes` and `DohLicenseToOperate`. Custom clinic logo URLs (data URIs or base64) are currently never decoded into byte arrays, leaving headers without logos.

### 1.5 Controllers and Query Routing for `?wet=true|false`
- `DocumentsController.cs`:
  - `GET /api/v1/documents/medical-certificates/{id:guid}/pdf` (line 56): Missing `[FromQuery] bool? wet`. Calls `_pdfService.GenerateMedicalCertificatePdf(cert, settings, patient)`.
  - `GET /api/v1/documents/referrals/{id:guid}/pdf` (line 77): Missing `[FromQuery] bool? wet`. Calls `_pdfService.GenerateReferralLetterPdf(referral, settings, patient, doctor)`.
  - `GET /api/v1/documents/verify/{securityDigestOrNumber}` (line 99): Checks `CertificateNumber == trimmed`, `ReferralNumber == trimmed`, `PrescriptionNumber == trimmed`, `OrderNumber == trimmed`. Does not check `SecurityDigest == trimmed`.
- `PrescriptionsController.cs`:
  - `GET /api/v1/prescriptions/{consultationId:guid}/slip-pdf` (line 48): Missing `[FromQuery] bool? wet`.
  - `GET /api/v1/prescriptions/by-number/{prescriptionNumber}/slip-pdf` (line 76): Missing `[FromQuery] bool? wet`.
  - No PDEA S2 automatic wet signature fallback logic currently in controller.
- `LabOrdersController.cs`:
  - `GET /api/v1/lab-orders/{id}/slip-pdf` (line 63): Missing `[FromQuery] bool? wet`.
- `SettingsController.cs`:
  - Lacks a test sample PDF endpoint (`/api/v1/settings/sample-document-pdf`) for the Document Studio's "Print Sample Test PDF" button.

### 1.6 Existing Test Suite Status
- Command run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"`
- **Result**: 9 passed, 0 failed, Duration 842ms.
- Tests currently test Letter and A5 PDFs with default digital certification text, but do NOT yet test the 3 signature modes, the transparent PNG specimen embedding, or wet signature blank line assertions across all 4 document types.

---

## 2. Logic Chain

1. **Signature Mode Enumeration Placement**:
   - Both `TenantPrintoutConfig` in `packages/shared-dotnet` and `ClinicDocumentPdfService` in `clinic-api` need to reference `SignatureMode`.
   - `ClinicEz.Clinic.Domain` already references `ClinicEz.Shared.csproj` (`packages/shared-dotnet/ClinicEz.Shared.csproj`).
   - Therefore, declaring `SignatureMode` (`ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`) in `ClinicEz.Shared.Documents.Configuration` (or `ClinicEz.Shared.Documents`) allows universal usage across domain entities, EF Core mapping, shared printout configuration, and PDF rendering.

2. **Database Persistence for `StaffMember`**:
   - `StaffMember.SignatureSpecimen` will contain transparent PNG base64 strings (often 20KB - 200KB). Mapping as `HasColumnType("text")` in EF Core prevents size truncation.
   - `StaffMember.DefaultSignatureMode` maps to a varchar(50) enum string (`"ESignatureSpecimen"`, `"DigitalSealOnly"`, `"WetSignature"`), handled automatically by EF Core conventions.
   - Storing these fields enables doctor-level preferences to default automatically during consultation issuance.

3. **Logo Decoding Logic**:
   - Clinic logos uploaded via the web workstation typically produce a data URI (`data:image/png;base64,...` or `data:image/jpeg;base64,...`).
   - A robust static helper (`ImageDecoderHelper.TryDecode(string? input)`) that strips the data URI header and executes `Convert.FromBase64String` enables `MapToTenantConfig` to populate `config.PrimaryLogoBytes`.
   - Once `config.PrimaryLogoBytes` is set, `TenantLetterheadComponent` automatically renders the logo.

4. **Tri-Mode QuestPDF Rendering Engine**:
   - **Mode 1 (`ESignatureSpecimen`)**:
     - Embeds decoded transparent PNG image in a fixed-height container (`Height(38)` to `Height(42)`) above the line.
     - Followed by horizontal line (`LineHorizontal(1).LineColor("#111827")`).
     - Followed by printed doctor name, title, PRC, PTR, and S2 license.
     - Followed by green badge: `"✓ Digitally Certified & Locked"` (or document-specific official digital seal).
     - Retains QR code and verification digest in header/footer.
   - **Mode 2 (`DigitalVerificationSeal`)**:
     - Omits raw signature image. Uses clean spacing (`Height(25)`).
     - Renders horizontal line, printed credentials, green digital certification badge, and QR code.
   - **Mode 3 (`WetSignature`)**:
     - Allocates a clean, blank signature line (`Height(40)`) for physical pen signing.
     - Renders horizontal line and printed credentials.
     - **OMITS** any electronic signature image.
     - **OMITS** `"Digitally Certified & Locked"` badge and digital certificate text.
     - **PRESERVES** header/footer security hashes, document numbers, and QR codes (the document was officially issued by the clinic).

5. **PDEA S2 Automatic Safeguard**:
   - Under Philippine Comprehensive Dangerous Drugs Act (RA 9165) and DOH/PDEA administrative orders, prescriptions containing regulated dangerous drugs (PDEA S2) must be written on physical prescription forms or physically signed by the clinician.
   - In `PrescriptionsController` and `ClinicDocumentPdfService`:
     If any prescription item has `IsDangerousDrug == true` or doctor has `S2LicenseNumber`:
     If `wet` is not explicitly set to false, default to `SignatureMode.WetSignature` and render a prominent warning badge:
     `"⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."`

6. **Public Verification Query Resolution**:
   - The acceptance criteria require: *"Scanning document QR codes successfully resolves to the public verification portal at `/verify/<digest>`."*
   - `apps/portal-web/src/app/verify/[token]/page.tsx` calls `GET /api/v1/documents/verify/{token}`.
   - Currently, `DocumentsController.VerifyDocument` only matches against `CertificateNumber`, `ReferralNumber`, `PrescriptionNumber`, and `OrderNumber`.
   - Adding `SecurityDigest` lookup across `MedicalCertificates`, `ReferralLetters`, `Consultations`, and `LabOrders` ensures that `/verify/<digest>` resolves with `200 OK` and `IsVerified: true`.

---

## 3. Caveats

1. **Raw Base64 vs Corrupt Image Streams**:
   Doctors may upload arbitrary or corrupted images. `ImageDecoderHelper` must catch `FormatException` and GDI/Skia image validation errors gracefully and fall back to `DigitalSealOnly` rather than causing an HTTP 500 error during PDF rendering.
2. **Page Budget on A5 Size**:
   A5 paper is 148 x 210 mm. When rendering `ESignatureSpecimen` on A5 prescriptions with multiple items, the signature stamp height must not cause an unwanted second page. The signature stamp component should use compact padding (e.g. 35pt signature height, 2pt line padding).
3. **Multi-Doctor Clinics**:
   In `MedicalCertificate`, `ReferralLetter`, and `LabOrder`, the attending/ordering doctor ID is explicitly stored (`DoctorId`, `ReferringDoctorId`, `OrderedByDoctorId`). In `PrescriptionSlipDto`, `DoctorId` is not currently an explicit field on the DTO. We must ensure the controller or query handler looks up the attending doctor from the encounter to obtain their `SignatureSpecimen` and `DefaultSignatureMode`.

---

## 4. Conclusion & Concrete Implementation Blueprint

### 4.1 Exact File Changes & Diff Proposals

#### 1. `packages/shared-dotnet/Documents/Configuration/TenantPrintoutConfig.cs`
Add `SignatureMode` enum and extend `TenantPrintoutConfig`:
```csharp
namespace ClinicEz.Shared.Documents.Configuration;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum DocumentPaperSize
{
    Letter,
    A4,
    A5
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum SignatureMode
{
    ESignatureSpecimen,
    DigitalSealOnly,
    WetSignature
}

public sealed class TenantPrintoutConfig
{
    // ... branding properties ...
    public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;
    public byte[]? DoctorSignatureBytes { get; set; }
    // ...
}
```

#### 2. `services/clinic-api/ClinicEz.Clinic.Domain/Entities/StaffMember.cs`
Add fields to `StaffMember`:
```csharp
// E-Signature Specimen & Tri-Mode Signing
public string? SignatureSpecimen { get; set; }
public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;
```

#### 3. `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicSettings.cs`
Add DOH LTO number if distinct from accreditation number:
```csharp
public string? LetterheadDohLto { get; set; }
```

#### 4. `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`
In `OnModelCreating` under `modelBuilder.Entity<StaffMember>`:
```csharp
entity.Property(e => e.SignatureSpecimen).HasColumnType("text");
entity.Property(e => e.DefaultSignatureMode).HasConversion<string>().HasMaxLength(50);
```

#### 5. Image & Signature Decoding Helper: `ImageDecoderHelper.cs`
Create in `ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs` (or `ClinicEz.Shared.Documents`):
```csharp
public static class ImageDecoderHelper
{
    public static byte[]? TryDecode(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        try
        {
            var trimmed = input.Trim();
            if (trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                var commaIdx = trimmed.IndexOf(',');
                if (commaIdx >= 0)
                {
                    trimmed = trimmed[(commaIdx + 1)..];
                }
            }
            return Convert.FromBase64String(trimmed);
        }
        catch
        {
            return null;
        }
    }
}
```

#### 6. `IClinicDocumentPdfService.cs`
Extend signatures with optional `StaffMember? doctor = null` and `SignatureMode? signatureMode = null`:
```csharp
public interface IClinicDocumentPdfService
{
    byte[] GenerateMedicalCertificatePdf(
        MedicalCertificate cert,
        ClinicSettings settings,
        ClinicPatient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateLabRequisitionSlipPdf(
        LabOrderSlipDto slip,
        ClinicSettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GeneratePrescriptionPdf(
        PrescriptionSlipDto slip,
        ClinicSettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReferralLetterPdf(
        ReferralLetter referral,
        ClinicSettings settings,
        ClinicPatient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReceptionPlacardPdf(
        ClinicSettings settings,
        string qrUrl,
        string? joinCode = null,
        string? expiresAtFormatted = null);
}
```

#### 7. `ClinicDocumentPdfService.cs` Implementation Details
- In `MapToTenantConfig`:
  ```csharp
  var config = new TenantPrintoutConfig
  {
      FacilityName = settings.LetterheadHeader ?? settings.ClinicName,
      FacilitySubHeader = settings.LetterheadSubHeader ?? "Accredited Outpatient Medical Facility",
      PhysicalAddress = settings.LetterheadAddress ?? "Philippines",
      ContactNumbers = settings.LetterheadContact,
      DohLicenseToOperate = settings.LetterheadDohLto,
      PhilHealthAccreditationNumber = settings.AccreditationNumber,
      PrimaryColorHex = ResolveAccent(settings),
      PrimaryLogoBytes = ImageDecoderHelper.TryDecode(settings.PrimaryLogoUrl),
      PaperSize = settings.PaperSize?.ToLowerInvariant() switch
      {
          "a4" => DocumentPaperSize.A4,
          "a5" => DocumentPaperSize.A5,
          _ => DocumentPaperSize.Letter
      },
      CustomDisclaimerText = settings.LetterheadFooter ?? "Valid Philippine Medical Certificate & Prescription. Digitally issued via Clinic EZ in compliance with RA 8792 & RA 10173."
  };
  ```
- Signature Stamp Renderer helper:
  ```csharp
  private void RenderDoctorSignatureStamp(
      ColumnDescriptor col,
      string doctorName,
      string titleOrSpecialty,
      string prcLicense,
      string? ptrNumber,
      string? s2License,
      byte[]? signatureBytes,
      SignatureMode mode,
      string digitalSealBadgeText)
  {
      col.Item().Width(220).Column(stamp =>
      {
          if (mode == SignatureMode.ESignatureSpecimen && signatureBytes != null && signatureBytes.Length > 0)
          {
              stamp.Item().Height(40).AlignCenter().Image(signatureBytes).FitArea();
          }
          else
          {
              stamp.Item().Height(mode == SignatureMode.WetSignature ? 42 : 30);
          }

          stamp.Item().LineHorizontal(1).LineColor("#111827");
          stamp.Item().PaddingTop(3).AlignCenter().Text(doctorName).FontSize(10.5f).Bold().FontColor("#111827");
          stamp.Item().AlignCenter().Text(titleOrSpecialty).FontSize(8f).SemiBold().FontColor("#4B5563");
          stamp.Item().AlignCenter().Text($"PRC Lic. No.: {prcLicense}").FontSize(7.5f).FontColor("#4B5563");
          if (!string.IsNullOrWhiteSpace(ptrNumber))
              stamp.Item().AlignCenter().Text($"PTR No.: {ptrNumber}").FontSize(7.5f).FontColor("#4B5563");
          if (!string.IsNullOrWhiteSpace(s2License))
              stamp.Item().AlignCenter().Text($"PDEA S2: {s2License}").FontSize(7.5f).Bold().FontColor("#DC2626");

          if (mode != SignatureMode.WetSignature)
          {
              stamp.Item().PaddingTop(2).AlignCenter().Text(digitalSealBadgeText).FontSize(7f).Bold().FontColor("#16A34A");
          }
      });
  }
  ```

#### 8. Controller Query Parameter Updates
- **`DocumentsController.cs`**:
  - `DownloadMedicalCertificatePdf([FromRoute] Guid id, [FromQuery] bool? wet = null, CancellationToken ct = default)`:
    Looks up doctor via `_staffRepo.GetByIdAsync(cert.DoctorId, ct)`, resolves mode (`wet == true ? SignatureMode.WetSignature : (doctor?.DefaultSignatureMode ?? SignatureMode.ESignatureSpecimen)`), and passes to `_pdfService`.
  - `DownloadReferralLetterPdf([FromRoute] Guid id, [FromQuery] bool? wet = null, CancellationToken ct = default)`:
    Looks up doctor via `_staffRepo.GetByIdAsync(referral.ReferringDoctorId, ct)`, resolves mode, and passes to `_pdfService`.
  - `VerifyDocument([FromRoute] string securityDigestOrNumber, CancellationToken ct)`:
    Updated to query `c.CertificateNumber == trimmed || c.SecurityDigest == trimmed` for MedicalCertificates and Referrals, so that QR scans pointing to `/verify/<digest>` return verified.
- **`PrescriptionsController.cs`**:
  - `DownloadPrescriptionPdfByConsultationId([FromRoute] Guid consultationId, [FromQuery] bool? wet = null, CancellationToken ct = default)`:
    Checks `slip.Items.Any(i => i.IsDangerousDrug)`. If true and `!wet.HasValue`, sets `wet = true`.
  - `DownloadPrescriptionPdfByNumber([FromRoute] string prescriptionNumber, [FromQuery] bool? wet = null, CancellationToken ct = default)`:
    Same safeguard.
- **`LabOrdersController.cs`**:
  - `DownloadLabOrderSlipPdf([FromRoute] Guid id, [FromQuery] bool? wet = null, CancellationToken ct = default)`:
    Resolves mode and passes to `_pdfService`.
- **`SettingsController.cs`**:
  - Add `DownloadSampleDocumentPdf([FromQuery] string docType = "med-cert", [FromQuery] bool wet = false, [FromQuery] string? paperSize = null, CancellationToken ct = default)`:
    Generates sample test PDF for live preview and printing from the studio.

---

## 5. Verification Method

To independently verify the implementation once coded:

1. **Automated Unit & Integration Tests**:
   Execute the target test suite:
   ```bash
   ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
   ```
   **Verification Criteria**:
   - 100% test passage (0 failed).
   - Generates valid PDFs (non-null byte array, starts with `%PDF-`, ends with `%%EOF`).
   - Asserts across all 4 document types: `MedicalCertificate`, `LabRequisitionSlip`, `Prescription`, `ReferralLetter`.
   - Asserts across all 3 signature modes: `ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`.
   - Asserts across all 3 paper sizes: `Letter`, `A4`, `A5`.
   - Wet signature assertion: text does NOT contain `"Digitally Certified & Locked"` or `"Officially Signed"`.
   - E-signature specimen assertion: PDF embeds transparent PNG bytes and includes green certification badge.
   - PDEA S2 prescription assertion: includes `"⚠️ PDEA S2 Regulated Substance"`.

2. **Public Document Verification Test**:
   - Call `VerifyDocument` with both Document Number (`MC-20261004-0001`) and Security Digest (`SEC-SHA256-...`).
   - Asserts that both resolve with `IsVerified == true` and HTTP 200 OK.
