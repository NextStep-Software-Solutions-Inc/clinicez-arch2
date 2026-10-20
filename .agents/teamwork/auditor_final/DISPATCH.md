## 2026-10-20T04:25:08Z
You are auditor_final.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/auditor_final

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/TEST_READY.md

Your mission:
Perform the comprehensive Final Forensic Integrity Audit across all modified code, services, controllers, entities, and test suites in `services/clinic-api`, `packages/shared-dotnet`, `packages/design-tokens`, and `apps/clinic-app`.
Audit Checks:
1. Verify NO hardcoded test results, expected outputs, or verification strings in production code.
2. Verify NO dummy or facade implementations that produce correct-looking outputs without genuine logic.
3. Verify NO pre-populated test artifacts, fake logs, or bypassed test assertions.
4. Run independent verification commands:
   - `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~HardenedDocumentGenerationTests"`
   - `~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts apps/clinic-app/tests/staffSignatureSpecimen.test.ts apps/clinic-app/tests/pdeaPrescriptionHardening.test.ts`
5. Determine binary verdict: `Verdict: CLEAN` or `Verdict: INTEGRITY VIOLATION`.
Write your report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/auditor_final/handoff.md` and send a message when complete.
