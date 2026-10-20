## 2026-10-20T04:05:38Z
You are worker_m4_pdea.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m4_pdea

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_frontend/handoff.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/apps/clinic-app/tests/pdeaPrescriptionHardening.test.ts

Your mission is to implement Milestone 4 (Workstation Print & Issuance Hardening with PDEA S2 Safeguard in apps/clinic-app):
1. `apps/clinic-app/services/clinicService.ts`:
   - Ensure PDF URL helper methods accept `{ wet?: boolean }` and append `?wet=true|false`:
     * `getPrescriptionSlipPdfUrl(consultationId: string, options?: { wet?: boolean })`
     * `getPrescriptionSlipPdfByNumberUrl(prescriptionNumber: string, options?: { wet?: boolean })`
     * `getMedicalCertificatePdfUrl(certificateId: string, options?: { wet?: boolean })`
     * `getReferralLetterPdfUrl(referralId: string, options?: { wet?: boolean })`
     * `getLabOrderSlipPdfUrl(labOrderId: string, options?: { wet?: boolean })`
2. `apps/clinic-app/components/PrescriptionSlipModal.tsx`:
   - Add instant print options selector: `[ E-Signed PDF ]` | `[ Wet Signature (Pen) ]` using `SegmentedControl` or toggle buttons.
   - Default to attending doctor's preferred signing mode (`attendingDoctor?.defaultSignatureMode`).
   - PDEA S2 Automatic Default:
     * Check if `slip.items.some(i => i.isDangerousDrug)`.
     * If true, automatically default to **Wet Signature Mode** (`wet = true`).
     * Display a prominent regulatory warning badge:
       "⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations."
     * If user attempts to switch a dangerous drug prescription to E-Signature, block or show statutory alert warning.
   - In `handlePrint`, pass the selected mode (`options: { wet: isWetMode }`) to `getPrescriptionSlipPdfUrl` / `getPrescriptionSlipPdfByNumberUrl`.
3. `apps/clinic-app/navigation/screens/Consultations.screen.tsx`:
   - In `previewDocModal` for Medical Certificate, Referral Letter, and Prescription:
     * Include the signing mode toggle (`E-Signed PDF` vs `Wet Signature`) and append `?wet=true|false` to PDF download URLs.
     * When prescriptions contain dangerous drugs (`hasDangerousDrug == true`), automatically default to wet signature mode with the statutory PDEA warning badge.
4. Strict Token & Lint Compliance:
   - CRITICAL: `apps/clinic-app/scripts/check-tokens.mjs --strict` forbids raw emoji literals in `.tsx`. Use Lucide icons or `<Icon name="..." />` and semantic `<Badge>` components.
   - Use `theme.colors.*` for all colors.
5. Verify your changes:
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/pdeaPrescriptionHardening.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/`
6. Write your handoff report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m4_pdea/handoff.md` and send a message to parent when complete.
