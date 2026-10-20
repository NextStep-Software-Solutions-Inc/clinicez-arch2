# Milestone 1 Adversarial Challenge Report: Regulatory PDEA S2 Safeguard & Controller `?wet=` Routing

- **Agent**: `challenger_m1_2`
- **Roles**: critic, specialist (Empirical Challenger)
- **Working Directory**: `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/challenger_m1_2`
- **Target Subsystem**: `services/clinic-api` (Regulatory PDEA S2 Safeguards, Controller `?wet=` routing, and Public Document Verification)
- **Verdict**: **VERDICT: APPROVE**

---

## 1. Observation

### 1.1 Source Code Architecture Observations

#### Observation 1.1: Defense-in-Depth in `ClinicDocumentPdfService.cs` (lines 426–433)
In `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs`:
```csharp
bool hasDangerousDrug = slip.Items.Any(i => i.IsDangerousDrug);
var preferredMode = signatureMode ?? doctor?.DefaultSignatureMode ?? config.DefaultSignatureMode;
var mode = hasDangerousDrug ? SignatureMode.WetSignature : preferredMode;

var docSignatureBytes = (mode == SignatureMode.ESignatureSpecimen)
    ? (ImageDecoderHelper.TryDecode(doctor?.SignatureSpecimen) ?? config.DoctorSignatureBytes)
    : null;
```
- When `hasDangerousDrug == true` (i.e. `slip.Items.Any(i => i.IsDangerousDrug)`), `mode` is unconditionally set to `SignatureMode.WetSignature`.
- `docSignatureBytes` is forcibly set to `null` because `mode == SignatureMode.ESignatureSpecimen` is false.
- Blank 42pt spacing is allocated above the physician name block for physical ink signing.

#### Observation 1.2: PDEA S2 Statutory Regulatory Warning & Item Highlighting (lines 532–538, 584–588)
In `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService.cs`:
```csharp
if (hasDangerousDrug)
{
    col.Item().PaddingTop(6).Background("#FEF2F2").Border(1).BorderColor("#EF4444").Padding(6).Row(r =>
    {
        r.RelativeItem().Text("⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations.")
            .FontSize(8.5f).Bold().FontColor("#991B1B");
    });
}
```
And on individual medication cards:
```csharp
if (item.IsDangerousDrug)
{
    r.ConstantItem(130).AlignRight().Text("⚠️ Dangerous Drug (PDEA S2)").FontSize(7.5f).Bold().FontColor("#DC2626");
}
```

#### Observation 1.3: Controller Routing in `PrescriptionsController.cs` (lines 65–70, 98–103)
In `services/clinic-api/ClinicEz.Clinic.Api/Controllers/PrescriptionsController.cs`:
```csharp
var signatureMode = wet == true
    ? SignatureMode.WetSignature
    : (wet == false ? SignatureMode.ESignatureSpecimen : (slip.Items.Any(i => i.IsDangerousDrug) ? SignatureMode.WetSignature : SignatureMode.ESignatureSpecimen));

var pdfBytes = _pdfService.GeneratePrescriptionPdf(slip, settings, doctor: null, signatureMode: signatureMode);
return File(pdfBytes, "application/pdf", $"Prescription-{slip.PrescriptionNumber}.pdf");
```
- If a caller passes `?wet=false`, the controller passes `signatureMode = ESignatureSpecimen` to `_pdfService`.
- However, as verified in Observation 1.1, `ClinicDocumentPdfService` overrides `mode` to `WetSignature` whenever `hasDangerousDrug == true`, guaranteeing that callers cannot bypass statutory regulations.

#### Observation 1.4: Universal Verification Endpoint in `DocumentsController.cs` (lines 142–248)
In `services/clinic-api/ClinicEz.Clinic.Api/Controllers/DocumentsController.cs`:
```csharp
[HttpGet("verify/{securityDigestOrNumber}")]
[AllowAnonymous]
public async Task<ActionResult<ApiResponse<DocumentVerificationResultDto>>> VerifyDocument(
    [FromRoute] string securityDigestOrNumber,
    CancellationToken ct = default)
```
- Validates inputs across four entity repositories:
  1. Medical Certificates: `c.CertificateNumber == trimmed || c.SecurityDigest == trimmed`
  2. Referral Letters: `r.ReferralNumber == trimmed || r.SecurityDigest == trimmed`
  3. Electronic Prescriptions: `e.PrescriptionNumber == trimmed || e.RxPublicVerificationToken == trimmed`
  4. Lab Requisitions: `l.OrderNumber == trimmed || l.ClaimToken == trimmed`
- Returns HTTP 200 OK with `DocumentVerificationResultDto` for valid records.
- Returns HTTP 404 NotFound with `ApiResponse.Fail` for non-existent or tampered digests.

---

### 1.2 Direct Empirical Tool Execution Results

A dedicated adversarial test suite with 17 empirical test scenarios was written to `services/clinic-api/ClinicEz.Clinic.Application.Tests/Adversarial/ChallengerM1_2RegulatoryRoutingTests.cs`.

Executing:
```bash
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ChallengerM1_2RegulatoryRoutingTests"
```
Yielded the following verbatim output:
```text
  Determining projects to restore...
  All projects are up-to-date for restore.
  ClinicEz.Shared -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/packages/shared-dotnet/bin/Debug/net10.0/ClinicEz.Shared.dll
  ClinicEz.Clinic.Domain -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Domain/bin/Debug/net10.0/ClinicEz.Clinic.Domain.dll
  ClinicEz.Clinic.Application -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Application/bin/Debug/net10.0/ClinicEz.Clinic.Application.dll
  ClinicEz.Clinic.Infrastructure -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Infrastructure/bin/Debug/net10.0/ClinicEz.Clinic.Infrastructure.dll
  ClinicEz.Clinic.Api -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Api/bin/Debug/net10.0/ClinicEz.Clinic.Api.dll
  ClinicEz.Clinic.Application.Tests -> /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Application.Tests/bin/Debug/net10.0/ClinicEz.Clinic.Application.Tests.dll
Test run for /Users/macuser/projects/github/nextstep/clinicez-docs-studio/services/clinic-api/ClinicEz.Clinic.Application.Tests/bin/Debug/net10.0/ClinicEz.Clinic.Application.Tests.dll (.NETCoreApp,Version=v10.0)
A total of 1 test files matched the specified pattern.

Passed!  - Failed:     0, Passed:    17, Skipped:     0, Total:    17, Duration: 1 s - ClinicEz.Clinic.Application.Tests.dll (net10.0)
```

Executing the baseline suite:
```bash
~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
```
Yielded:
```text
Passed!  - Failed:     0, Passed:    58, Skipped:     0, Total:    58, Duration: 1 s - ClinicEz.Clinic.Application.Tests.dll (net10.0)
```

---

## 2. Logic Chain

### 2.1 Attack Scenario: Adversarial Attempt to Force E-Signature on Dangerous Drug Prescription
1. **Hypothesis**: An adversary or malicious client sends `GET /api/v1/prescriptions/{consultationId}/slip-pdf?wet=false` on a prescription containing Morphine Sulfate (PDEA S2 regulated substance).
2. **Controller Behavior**: `PrescriptionsController.cs` receives `wet == false`, evaluates `signatureMode = SignatureMode.ESignatureSpecimen`, and invokes `_pdfService.GeneratePrescriptionPdf(slip, settings, null, SignatureMode.ESignatureSpecimen)`.
3. **Engine Defense-in-Depth**: `ClinicDocumentPdfService.cs` inspects `bool hasDangerousDrug = slip.Items.Any(i => i.IsDangerousDrug)`. Because `hasDangerousDrug == true`, line 428 evaluates:
   ```csharp
   var mode = hasDangerousDrug ? SignatureMode.WetSignature : preferredMode;
   ```
   The engine overrides `mode` to `SignatureMode.WetSignature`, completely discarding `SignatureMode.ESignatureSpecimen`.
4. **Rendered Output**:
   - The digital certification badge (`✓ Officially Signed e-Prescription (FDA Circular 2020-004)`) is suppressed.
   - Doctor signature specimen image bytes are omitted (`null`), rendering a blank 42pt ink pen line.
   - The statutory red warning banner (`⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required...`) is rendered.
   - The document security hash (`Security Hash: <digest>`) and QR code in the footer remain intact.
5. **Empirical Proof**: Verified by tests `PrescriptionsController_WithDangerousDrug_WhenWetFalse_MustStillEnforceWetSignatureAndRenderWarningBadge` and `PrescriptionsController_ByPrescriptionNumber_WithDangerousDrug_AcrossAllWetModes_MustEnforceWetSignature(wetParam: False)`. Both passed.

### 2.2 Clean Prescription Routing Integrity
1. **Scenario A (`?wet=true`)**: Clean prescription (e.g. Amoxicillin). Doctor explicitly requests wet signing mode. `PrescriptionsController` sets `signatureMode = WetSignature`. In the rendered PDF, the digital seal badge is suppressed, signature image is omitted, PDEA S2 warning box is absent, and the security verification hash is retained. (Verified by test `PrescriptionsController_CleanPrescription_WhenWetTrue_ShouldEnforceWetModeAndSuppressDigitalSeal`).
2. **Scenario B (`?wet=false` or omitted `null`)**: Clean prescription. `signatureMode = ESignatureSpecimen`. Rendered PDF includes digital certification badge (`Officially Signed`), embeds physician signature specimen image when available, does not render PDEA warning, and retains security verification hash. (Verified by tests `PrescriptionsController_CleanPrescription_WhenWetFalse_ShouldHonorESignatureMode` and `PrescriptionsController_CleanPrescription_WhenWetOmitted_ShouldDefaultToESignatureMode`).

### 2.3 Cross-Document Controller `?wet=` Routing Parity
1. **Medical Certificates** (`DocumentsController.DownloadMedicalCertificatePdf`):
   - `?wet=true` forces `SignatureMode.WetSignature`: suppresses `"Digitally Certified & Locked"`, leaves physical blank line, preserves footer security hash.
   - `?wet=false` forces `SignatureMode.ESignatureSpecimen`: includes green digital certification badge, preserves footer security hash. (Verified by `DocumentsController_MedicalCertificate_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest`).
2. **Referral Letters** (`DocumentsController.DownloadReferralLetterPdf`):
   - `?wet=true` suppresses digital certification badge, preserves footer security hash.
   - `?wet=false` preserves digital seal badge and footer security hash. (Verified by `DocumentsController_ReferralLetter_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest`).
3. **Lab Requisition Slips** (`LabOrdersController.DownloadLabOrderSlipPdf`):
   - `?wet=true` suppresses digital badge, preserves footer security hash.
   - `?wet=false` preserves digital badge and footer security hash. (Verified by `LabOrdersController_LabOrderSlip_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest`).

### 2.4 Public Document Security Digest Verification Resolution
1. **Endpoint**: `GET /api/v1/documents/verify/{securityDigestOrNumber}` (Anonymous).
2. **Medical Certificate**: Resolves via `CertificateNumber` or `SecurityDigest` (SHA256 hex string). Returns HTTP 200 with `DocumentType: "Medical Certificate"`, `Status: "Valid"`. (Verified by `DocumentsController_VerifyDocument_WhenMedicalCertificateDigestOrNumberProvided_ShouldReturnSuccessResult`).
3. **Clinical Referral**: Resolves via `ReferralNumber` or `SecurityDigest`. Returns HTTP 200 with `DocumentType: "Clinical Referral Letter"`, `Status: "Valid"`. (Verified by `DocumentsController_VerifyDocument_WhenReferralLetterDigestOrNumberProvided_ShouldReturnSuccessResult`).
4. **Electronic Prescription**: Resolves via `PrescriptionNumber` or `RxPublicVerificationToken`. Returns HTTP 200 with `DocumentType: "Electronic Prescription"`, `Status: "Valid"`. (Verified by `DocumentsController_VerifyDocument_WhenPrescriptionNumberOrTokenProvided_ShouldReturnSuccessResult`).
5. **Lab Order**: Resolves via `OrderNumber` or `ClaimToken`. Returns HTTP 200 with `DocumentType: "Laboratory Requisition Slip"`, `Status: "Valid"`. (Verified by `DocumentsController_VerifyDocument_WhenLabOrderNumberOrClaimTokenProvided_ShouldReturnSuccessResult`).
6. **Adversarial / Invalid / Tampered Hash**: Non-existent hex strings or malformed inputs return HTTP 404 NotFound with `ApiResponse.Fail`. Whitespace-padded strings are trimmed and resolved accurately. (Verified by `DocumentsController_VerifyDocument_WhenDigestNotFound_ShouldReturn404NotFound` and `DocumentsController_VerifyDocument_WhenInputContainsWhitespace_ShouldTrimAndResolve`).

---

## 3. Adversarial Challenges & Stress Scenarios

| # | Challenge / Scenario | Expected Outcome | Actual Outcome | Status |
|---|----------------------|------------------|----------------|:------:|
| 1 | Dangerous drug prescription + `?wet=false` | Wet signature forced, warning banner rendered, digital badge suppressed | WetSignature enforced by `ClinicDocumentPdfService:428`, digital badge omitted | **PASS** |
| 2 | Dangerous drug prescription + `?wet=true` | Wet signature forced, warning banner rendered, digital badge suppressed | WetSignature enforced, digital badge omitted | **PASS** |
| 3 | Dangerous drug prescription + `wet` omitted (`null`) | Wet signature default, warning banner rendered, digital badge suppressed | WetSignature enforced, digital badge omitted | **PASS** |
| 4 | Clean prescription + `?wet=false` | E-Signature honored, digital badge rendered, no PDEA warning | ESignatureSpecimen honored, digital badge rendered | **PASS** |
| 5 | Clean prescription + `?wet=true` | Wet signature honored, digital badge suppressed, no PDEA warning | WetSignature honored, digital badge suppressed | **PASS** |
| 6 | Clean prescription + `wet` omitted (`null`) | Defaults to E-Signature, digital badge rendered | ESignatureSpecimen default, digital badge rendered | **PASS** |
| 7 | MedCert endpoint + `?wet=true` vs `?wet=false` | Wet mode suppresses badge; e-sign renders badge; both retain security hash | Verified on PDF output bytes | **PASS** |
| 8 | Referral endpoint + `?wet=true` vs `?wet=false` | Wet mode suppresses badge; e-sign renders badge; both retain security hash | Verified on PDF output bytes | **PASS** |
| 9 | Lab Order endpoint + `?wet=true` vs `?wet=false` | Wet mode suppresses badge; e-sign renders badge; both retain security hash | Verified on PDF output bytes | **PASS** |
| 10 | `/verify/{digest}` with MedCert `SecurityDigest` | Returns 200 OK with `DocumentVerificationResultDto` | HTTP 200, valid status, populated metadata | **PASS** |
| 11 | `/verify/{digest}` with Referral `SecurityDigest` | Returns 200 OK with `DocumentVerificationResultDto` | HTTP 200, valid status, populated metadata | **PASS** |
| 12 | `/verify/{digest}` with Rx `PublicVerificationToken` | Returns 200 OK with `DocumentVerificationResultDto` | HTTP 200, valid status, populated metadata | **PASS** |
| 13 | `/verify/{digest}` with Lab `ClaimToken` | Returns 200 OK with `DocumentVerificationResultDto` | HTTP 200, valid status, populated metadata | **PASS** |
| 14 | `/verify/{digest}` with non-existent SHA256 hex | Returns 404 NotFound | HTTP 404, `ApiResponse.Fail` | **PASS** |
| 15 | `/verify/{digest}` with whitespace padding | Trims input and resolves successfully | HTTP 200, valid status | **PASS** |

---

## 4. Caveats

- **QuestPDF Font Subsetting & CMap Glyphs**: Standard ASCII text operators inside QuestPDF decompress cleanly via zlib. However, Unicode emojis (such as `⚠️` U+26A0) and checkmarks (`✓` U+2713) are mapped to Identity-H font glyph subsets and split across text runs in canvas operators. Assertions must target font-safe substrings (e.g. `ContainAny("PDEA S2", "Dangerous Drug", "DOH-PDEA", "Regulated Substance")` rather than raw emoji strings).
- **Public Verification Endpoint Scoping**: The `/api/v1/documents/verify/{securityDigestOrNumber}` endpoint uses `[AllowAnonymous]` without tenant filtering by design to enable public QR scanning from any mobile device or external pharmacy.

---

## 5. Conclusion

The implementation of the PDEA S2 regulatory safeguard and controller `?wet=` query parameter routing in `services/clinic-api` is robust, regulatory-compliant, and hardened with defense-in-depth:
1. Callers cannot bypass the PDEA S2 wet signature requirement on dangerous drug prescriptions even if they supply `?wet=false`.
2. Clean prescriptions cleanly respect `?wet=true`, `?wet=false`, and default signature mode preferences.
3. Medical Certificates, Referral Letters, and Lab Requisitions exhibit consistent `?wet=` routing behavior.
4. The public verification endpoint reliably resolves documents by document number, claim token, or SHA256 security digest across all four clinical document types.

**VERDICT: APPROVE**

---

## 6. Verification Method

To independently reproduce and verify this challenge report:

1. Navigate to the repository root:
   ```bash
   cd /Users/macuser/projects/github/nextstep/clinicez-docs-studio
   ```

2. Run the dedicated empirical adversarial test suite:
   ```bash
   ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ChallengerM1_2RegulatoryRoutingTests"
   ```
   **Expected Result**: All 17 tests pass with 0 failures:
   `Passed! - Failed: 0, Passed: 17, Skipped: 0, Total: 17, Duration: 1 s`

3. Run the baseline document generation test suite:
   ```bash
   ~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"
   ```
   **Expected Result**: All 58 tests pass with 0 failures:
   `Passed! - Failed: 0, Passed: 58, Skipped: 0, Total: 58, Duration: 1 s`

4. Inspect the test implementation:
   - File: `services/clinic-api/ClinicEz.Clinic.Application.Tests/Adversarial/ChallengerM1_2RegulatoryRoutingTests.cs`
