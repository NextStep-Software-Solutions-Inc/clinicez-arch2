## 2026-10-20T03:13:21Z
You are worker_m1_remediation.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m1_remediation

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/orchestrator_1/GATE_STATUS.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/reviewer_m1_2/handoff.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/challenger_m1_1/handoff.md

Mission: Remediate the exact issues identified by reviewer_m1_2 and challenger_m1_1 in Milestone 1:

1. `ImageDecoderHelper.cs` (`services/clinic-api/ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs`):
   - Currently, `TryDecode` only verifies base64 syntax. When valid base64 encoding arbitrary non-image text (e.g. "Hello World") or truncated PNG data is decoded, returning raw bytes causes Skia to throw `DocumentComposeException: Cannot decode the provided image` inside QuestPDF `.Image()`, crashing document endpoints with HTTP 500!
   - Remediate by validating that QuestPDF / Skia can decode the bytes before returning them:
     ```csharp
     var bytes = Convert.FromBase64String(trimmed);
     try
     {
         QuestPDF.Infrastructure.Image.FromBinaryData(bytes);
         return bytes;
     }
     catch
     {
         return null;
     }
     ```
   - Returning null on invalid/corrupted images ensures QuestPDF skips rendering the image without throwing an unhandled exception or 500 error.

2. `SecurityDigest` Persistence in Command Handlers:
   - In `IssueMedicalCertificateCommand.cs` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Documents/Commands/IssueMedicalCertificateCommand.cs`):
     Assign `cert.SecurityDigest = digest;` before `_medCertRepo.AddAsync` and `_unitOfWork.SaveChangesAsync(ct)`.
   - In `IssueReferralLetterCommand.cs` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Documents/Commands/IssueReferralLetterCommand.cs`):
     Compute the HMAC-SHA256 digest using `_security.ComputeDocumentDigest(referral.TenantId, "REFERRAL", referral.ReferralNumber, referral.PatientId, referral.ReferringDoctorPrcNumber, issuedAt);` and assign `referral.SecurityDigest = digest;` before `_referralRepo.AddAsync` and `_unitOfWork.SaveChangesAsync(ct)`.
   - In `DocumentsController.cs` (`services/clinic-api/ClinicEz.Clinic.Api/Controllers/DocumentsController.cs`):
     In `DownloadMedicalCertificatePdf` and `DownloadReferralLetterPdf`, if `cert.SecurityDigest == null` (or referral), compute and persist it to the database so legacy documents get backfilled.

3. `PrescriptionsController.cs` Precedence Ordering:
   - In `PrescriptionsController.cs` lines 65–70 & lines 98–103:
     Ensure dangerous drug checking takes strict precedence over `wet == false`:
     ```csharp
     var isDangerous = slip.Items.Any(i => i.IsDangerousDrug);
     var signatureMode = isDangerous || wet == true
         ? SignatureMode.WetSignature
         : (wet == false ? SignatureMode.ESignatureSpecimen : SignatureMode.ESignatureSpecimen);
     ```

4. Verify your changes:
   - Run: `~/.dotnet/dotnet build services/clinic-api/ClinicEz.Clinic.Api/ClinicEz.Clinic.Api.csproj`
   - Run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~EmpiricalAdversarialDocumentTests"` (All 36 tests must pass!)
   - Run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ChallengerM1_2RegulatoryRoutingTests"` (All 17 tests must pass!)
   - Run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"` (All 58 tests must pass!)
   - Run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj` (Full regression check!)

5. Write your handoff report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m1_remediation/handoff.md` and message the parent when complete.
