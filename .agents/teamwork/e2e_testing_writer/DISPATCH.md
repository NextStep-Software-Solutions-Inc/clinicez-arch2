## 2026-10-20T02:11:23Z
[Message] timestamp=2026-10-20T02:11:23Z sender=f15f02a3-efcd-418a-934f-74dd68d6a346 priority=MESSAGE_PRIORITY_HIGH content=You are e2e_testing_writer.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/e2e_testing_writer

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_tests/handoff.md

Your mission:
Implement the complete E2E Testing Track across the workspace according to the 4-tier testing methodology.
Tasks:
1. Create `TEST_INFRA.md` at `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/TEST_INFRA.md` documenting the test methodology, runner commands, and 4-tier test inventory.
2. In `services/clinic-api/ClinicEz.Clinic.Application.Tests/HardenedDocumentGenerationTests.cs`:
   - Expand the tests into a parameterized 36-combination theory across:
     * 4 Document Types: Medical Certificate, Electronic Prescription, Lab Requisition Slip, Clinical Referral Letter
     * 3 Signature Modes: ESignatureSpecimen, DigitalSealOnly, WetSignature
     * 3 Paper Sizes: Letter, A4, A5
   - Add explicit assertions verifying:
     * When mode is WetSignature: text "✓ Digitally Certified & Locked" and "✓ Officially Signed" is NOT present; blank pen line is rendered; footer verification hash and QR code are preserved.
     * When mode is ESignatureSpecimen: transparent signature bytes are embedded above the line; green certification badge is present.
     * When custom logo bytes are present: logo is rendered in document header.
     * When prescription contains PDEA S2 dangerous drug: automatically defaults to wet signature mode with regulatory warning badge text.
     * `DocumentsController`, `PrescriptionsController`, and `LabOrdersController` honor `?wet=true|false` query parameters.
3. In `apps/clinic-app/tests/`:
   - Note: Before running bun tests, ensure `PATH="$HOME/.bun/bin:$PATH"` is used.
   - Create comprehensive unit/component tests in:
     * `apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts` (verifies 2-column workstation layout, form controls, live canvas preview, 4 document switcher, paper size selector, 4 UI states: Skeleton, Empty, Error, Active, and token compliance).
     * `apps/clinic-app/tests/staffSignatureSpecimen.test.ts` (verifies signature upload / draw pad, default mode selection, and Physician Stamp Imprint with PRC, PTR, S2, PAN).
     * `apps/clinic-app/tests/pdeaPrescriptionHardening.test.ts` (verifies instant print selector `[ E-Signed PDF ]` | `[ Wet Signature (Pen) ]`, PDEA S2 dangerous drug detection, auto-default to wet mode, and statutory warning badge).
4. Run all tests to establish baseline or verify test syntax:
   - `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"`
   - `~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/`
5. Create `TEST_READY.md` at `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/TEST_READY.md` following the template in Project Pattern when tests are defined and in place.
6. Write your handoff report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/e2e_testing_writer/handoff.md` and send a message to parent when complete.
