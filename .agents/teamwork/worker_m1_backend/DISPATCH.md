## 2026-10-20T02:11:23Z
You are worker_m1_backend.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m1_backend

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_backend/handoff.md

Your mission is to implement Milestone 1 (Backend Tri-Mode Engine & Entity Extension):
1. `packages/shared-dotnet`:
   - In `Documents/Configuration/TenantPrintoutConfig.cs`:
     * Add `SignatureMode` enum: `ESignatureSpecimen`, `DigitalSealOnly`, `WetSignature`.
     * Add `SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;`
     * Add `byte[]? DoctorSignatureBytes { get; set; }`
     * Add `byte[]? PrimaryLogoBytes { get; set; }`
2. `services/clinic-api`:
   - In `ClinicEz.Clinic.Domain/Entities/StaffMember.cs`:
     * Add `public string? SignatureSpecimen { get; set; }` (base64 transparent PNG data URI or raw base64)
     * Add `public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;`
   - In `ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`:
     * Configure `SignatureSpecimen` as column type "text".
     * Configure `DefaultSignatureMode` conversion as string with max length 50.
   - Create `ImageDecoderHelper.cs` in `ClinicEz.Clinic.Infrastructure/Common/ImageDecoderHelper.cs`:
     * Decodes data URI or base64 strings into byte arrays safely, catching any exceptions and returning null.
   - Update `StaffMemberDto.cs`, `CreateStaffMemberCommand.cs`, `UpdateStaffMemberCommand.cs`, `UpdateMyProfileCommand.cs`, and `StaffController.cs` to expose and persist `SignatureSpecimen` and `DefaultSignatureMode`.
   - Update `ClinicDocumentPdfService.cs`:
     * In `MapToTenantConfig`, decode `settings.PrimaryLogoUrl` using `ImageDecoderHelper.TryDecode` into `config.PrimaryLogoBytes`. Also map `LetterheadDohLto` if present.
     * Implement unified `RenderDoctorSignatureStamp` supporting all 3 signature modes:
       - `ESignatureSpecimen`: Renders transparent PNG specimen above line + credentials + green "✓ Digitally Certified & Locked" badge (or official doc badge) + verification QR code.
       - `DigitalSealOnly`: Omits raw signature image + credentials + digital seal badge + QR code.
       - `WetSignature`: Generates a clean blank signature line (e.g. 40-42pt) for physical pen signing + credentials. OMITS electronic signature image and OMITS "Digitally Certified & Locked" / "Officially Signed" badge, while PRESERVING header/footer security hashes, document numbers, and QR code.
     * Ensure all 4 document types (Medical Certificate, Electronic Prescription, Lab Requisition Slip, Clinical Referral Letter) utilize this unified tri-mode signature handling and support paper sizes (`Letter`, `A4`, `A5`).
     * In `GeneratePrescriptionPdf`, if any item has `IsDangerousDrug == true`, automatically default to `SignatureMode.WetSignature` (unless wet was explicitly forced false) and render the statutory regulatory warning badge:
       "⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."
   - Update Controllers:
     * `DocumentsController.cs`: Add `[FromQuery] bool? wet = null` to medical certificate and referral letter endpoints. Update `VerifyDocument` to match `SecurityDigest == trimmed` in addition to certificate/referral numbers so `/verify/<digest>` resolves with 200 OK.
     * `PrescriptionsController.cs`: Add `[FromQuery] bool? wet = null` to slip endpoints, with automatic fallback to wet mode when dangerous drug is present.
     * `LabOrdersController.cs`: Add `[FromQuery] bool? wet = null`.
     * `SettingsController.cs`: Add sample test PDF endpoint for live studio printing.
3. Verify your changes:
   - Run: `~/.dotnet/dotnet build services/clinic-api/ClinicEz.Clinic.Api/ClinicEz.Clinic.Api.csproj`
   - Run: `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`
4. Document all file changes, build/test results, and verification commands in your handoff report at `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m1_backend/handoff.md` and send a message to parent when complete.
