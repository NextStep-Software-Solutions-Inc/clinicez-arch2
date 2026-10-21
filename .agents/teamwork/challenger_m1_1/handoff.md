# Milestone 1 Challenger Report: QuestPDF Document Generation Engine & Image Decoding

## Verdict: REQUEST_CHANGES

---

## 1. Observation

### 1.1 Empirical Test Execution Results
An empirical test harness was authored and executed in `services/clinic-api/ClinicEz.Clinic.Application.Tests/EmpiricalAdversarialDocumentTests.cs` covering all 4 boundary conditions required by the dispatch:
- Corrupted/invalid base64 image strings for logo and signature
- Extremely large signatures or edge-case dimensions
- Compact A5 paper size with multi-item prescription
- Missing doctor or credentials

**Command**:
```bash
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~EmpiricalAdversarialDocumentTests"
```

**Result**:
```
Failed!  - Failed: 3, Passed: 33, Skipped: 0, Total: 36, Duration: 865 ms - ClinicEz.Clinic.Application.Tests.dll (net10.0)
```

### 1.2 Verbatim Failure Traces

#### Failure 1: Corrupted / Non-Image Base64 Signature Specimen
- **Test**: `ClinicEz.Clinic.Application.Tests.EmpiricalAdversarialDocumentTests.Valid_Base64_Of_NonImage_Bytes_As_Signature_Should_Not_Crash_Document_Generation`
- **Error**:
  ```
  QuestPDF.Drawing.Exceptions.DocumentComposeException : Cannot decode the provided image.
     at QuestPDF.Infrastructure.StaticImageCache.DecodeImage(SkData imageData, Boolean isShared)
     at QuestPDF.Infrastructure.Image.FromBinaryData(Byte[] imageBytes)
     at QuestPDF.Fluent.ImageExtensions.Image(IContainer parent, Byte[] imageData)
     at ClinicEz.Clinic.Infrastructure.Services.ClinicDocumentPdfService.<>c__DisplayClass13_0.<RenderDoctorSignatureStamp>b__0(ColumnDescriptor stamp) in services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs:line 953
     at ClinicEz.Clinic.Infrastructure.Services.ClinicDocumentPdfService.RenderDoctorSignatureStamp(...) in services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs:line 949
     at ClinicEz.Clinic.Infrastructure.Services.ClinicDocumentPdfService.GenerateMedicalCertificatePdf(...) in services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs:line 205
  ```

#### Failure 2: Corrupted / Non-Image Base64 Primary Clinic Logo
- **Test**: `ClinicEz.Clinic.Application.Tests.EmpiricalAdversarialDocumentTests.Valid_Base64_Of_NonImage_Bytes_As_PrimaryLogo_Should_Not_Crash_Document_Generation`
- **Error**:
  ```
  QuestPDF.Drawing.Exceptions.DocumentComposeException : Cannot decode the provided image.
     at QuestPDF.Infrastructure.StaticImageCache.DecodeImage(SkData imageData, Boolean isShared)
     at QuestPDF.Infrastructure.Image.FromBinaryData(Byte[] imageBytes)
     at QuestPDF.Fluent.ImageExtensions.Image(IContainer parent, Byte[] imageData)
     at ClinicEz.Shared.Documents.Components.TenantLetterheadComponent.<Compose>b__2_1(RowDescriptor row) in packages/shared-dotnet/Documents/Components/TenantLetterheadComponent.cs:line 26
  ```

#### Failure 3: Truncated PNG Stream Header in Signature Specimen
- **Test**: `ClinicEz.Clinic.Application.Tests.EmpiricalAdversarialDocumentTests.Truncated_Png_Header_In_Signature_Should_Not_Crash_Document_Generation`
- **Payload**: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA` (Valid PNG signature and partial IHDR chunk, truncated before dimensions/scanlines)
- **Error**:
  ```
  QuestPDF.Drawing.Exceptions.DocumentComposeException : Cannot decode the provided image.
     at QuestPDF.Infrastructure.StaticImageCache.DecodeImage(SkData imageData, Boolean isShared)
     at QuestPDF.Infrastructure.Image.FromBinaryData(Byte[] imageBytes)
     at QuestPDF.Fluent.ImageExtensions.Image(IContainer parent, Byte[] imageData)
     at ClinicEz.Clinic.Infrastructure.Services.ClinicDocumentPdfService.<>c__DisplayClass13_0.<RenderDoctorSignatureStamp>b__0(ColumnDescriptor stamp) in services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs:line 953
  ```

### 1.3 Inspection of Code Artifacts
1. `services/clinic-api/ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs: lines 34-40`:
   ```csharp
   if (string.IsNullOrWhiteSpace(trimmed))
       return null;

   return Convert.FromBase64String(trimmed);
   ```
   `ImageDecoderHelper.TryDecode` only tests whether the string is valid Base64 syntax. It performs **no validation** that the decoded bytes correspond to a valid image format (PNG, JPEG, WEBP, etc.) or that Skia can decode them.

2. `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs: line 953`:
   ```csharp
   if (mode == SignatureMode.ESignatureSpecimen && signatureBytes != null && signatureBytes.Length > 0)
   {
       stamp.Item().Height(38).AlignCenter().Image(signatureBytes).FitArea();
   }
   ```
   If `signatureBytes` is non-null and length > 0, it is directly passed to QuestPDF's `.Image(signatureBytes)`. When Skia encounters corrupted bytes, `Image.FromBinaryData` throws an unhandled `DocumentComposeException`.

3. `packages/shared-dotnet/Documents/Components/TenantLetterheadComponent.cs: lines 24-27`:
   ```csharp
   if (_config.PrimaryLogoBytes != null && _config.PrimaryLogoBytes.Length > 0)
   {
       row.ConstantItem(55).Height(50).Image(_config.PrimaryLogoBytes);
   }
   ```
   Identical vulnerability: corrupt primary or secondary logo bytes are passed directly to `.Image()`.

---

## 2. Logic Chain

1. **Mission Requirement**:
   The dispatch explicitly instructs:
   *"1. Test extreme boundary cases: Corrupted or invalid base64 image strings for logo and signature (must not throw 500 or crash)."*

2. **Empirical Findings on Boundary Cases**:
   - **Case 1 (Invalid/Corrupted Base64 Images)**: **FAILED**.
     When `PrimaryLogoUrl` or `SignatureSpecimen` contains valid base64 strings of non-image data (e.g. `data:image/png;base64,SGVsbG8gV29ybGQ=` ["Hello World"], HTML errors, SVGs, or truncated PNGs), `ImageDecoderHelper.TryDecode` returns the raw bytes. When QuestPDF renders the document, Skia fails to decode the image and throws `DocumentComposeException: Cannot decode the provided image.` This unhandled exception bubbles up through `ClinicDocumentPdfService` and causes an unhandled HTTP 500 error on any document download (`/pdf`, `/slip-pdf`, `/sample-document-pdf`).
   - **Case 2 (Extremely Large Signatures / Edge Dimensions)**: **PASSED**.
     Tested using a real 3.5MB PNG image file (`apps/portal-web/public/og-image.png`). `RenderDoctorSignatureStamp` uses `.Height(38).AlignCenter().Image(signatureBytes).FitArea()`, which correctly scales down the 3.5MB image into the 230pt column without memory exhaustion or layout failure (<200ms render time).
   - **Case 3 (Compact A5 Paper Size with Multi-Item Prescription)**: **PASSED**.
     Tested `DocumentPaperSize.A5` across 1, 3, 6, 10, 15, and 25 items on `PrescriptionSlipDto`, as well as 20 items on `LabOrderSlipDto`. QuestPDF cleanly paginated across 5 pages with repeated headers, running footers (`Page X of Y`), verification hashes, and doctor signature stamps without layout loops or exceptions.
   - **Case 4 (Missing Doctor or Credentials)**: **PASSED**.
     Tested `doctor = null`, `doctor != null` with all license fields null (`Title = null`, `PrcLicenseNumber = null`, `PtrNumber = null`, `S2LicenseNumber = null`), `doctorName = ""`, `referral` with null doctor and null patient, and clinic settings with null letterhead headers, sub-headers, addresses, and contacts. All rendered valid PDFs without `NullReferenceException`.

3. **Blast Radius of Case 1 Failure**:
   If an administrator or clinician saves a broken data URI, a non-PNG image, or a corrupted image upload, EVERY subsequent request to generate or download a Medical Certificate, Prescription Slip, Lab Slip, Referral Letter, or Sample PDF for that clinic or doctor will fail with a 500 Internal Server Error.

---

## 3. Caveats

- Tests for Case 1 were conducted with raw byte payloads and truncated PNG headers. Real-world uploads may also include corrupted JPEG streams or SVGs masquerading as PNGs, which will produce the identical `DocumentComposeException`.
- The remaining 3 dimensions (Extreme Large Signatures, Compact A5 Multi-Item Pagination, and Null/Missing Doctor & Credentials) are robust and verified clean.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The QuestPDF document generation engine is solidly structured for layout scaling, A5 pagination, and null credentials, but **fails the explicit non-crash requirement for corrupted and invalid base64 image strings**. 

### Actionable Remediation:
1. In `services/clinic-api/ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs`:
   Update `TryDecode` so that after `Convert.FromBase64String(trimmed)`, it verifies that the bytes represent an image that QuestPDF's image engine can decode. For example:
   ```csharp
   var bytes = Convert.FromBase64String(trimmed);
   try
   {
       // Verify that QuestPDF / Skia can decode the bytes before returning
       QuestPDF.Infrastructure.Image.FromBinaryData(bytes);
       return bytes;
   }
   catch
   {
       return null;
   }
   ```
2. Returning `null` on decodability failure ensures:
   - Corrupt clinic logos gracefully evaluate to `null`, omitting the logo without crashing `TenantLetterheadComponent`.
   - Corrupt doctor signatures gracefully evaluate to `null`, falling back to a clean signature line or digital seal without crashing `RenderDoctorSignatureStamp`.
   - All document generation endpoints produce valid PDFs without throwing 500.

---

## 5. Verification Method

1. Run the empirical adversarial test suite to observe the 3 failing tests:
   ```bash
   ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~EmpiricalAdversarialDocumentTests"
   ```
   *Current Result*: 3 Failed, 33 Passed.
   *Target Result after remediation*: 36 Passed, 0 Failed.

2. Verify that existing hardened tests still pass:
   ```bash
   ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
   ```
   *Expected*: 58 Passed, 0 Failed.
