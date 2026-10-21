## 2026-10-20T03:46:49Z

You are worker_m3_signature.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m3_signature

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_frontend/handoff.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/apps/clinic-app/tests/staffSignatureSpecimen.test.ts

Your mission is to implement Milestone 3 (Clinician E-Signature Specimen Management in apps/clinic-app):
1. `apps/clinic-app/services/clinicService.ts`:
   - Extend `StaffMember` entity with:
     * `signatureSpecimen?: string | null;`
     * `defaultSignatureMode?: 'ESignatureSpecimen' | 'DigitalSealOnly' | 'WetSignature';`
   - Extend `CreateStaffPayload`, `UpdateStaffPayload`, and `UpdateMyProfilePayload` to include both fields.
2. Create `apps/clinic-app/components/settings/SignatureSpecimenModal.tsx`:
   - Dual-tab / dual-mode modal:
     * Tab 1: Upload transparent PNG signature file. Validates MIME type is PNG and file size <= 500KB.
     * Tab 2: Interactive Draw Pad canvas for doctors to draw their signature with touch / mouse, with Clear and Undo actions.
   - Signing Mode preference selector: `ESignatureSpecimen` | `DigitalSealOnly` | `WetSignature`.
   - Live preview of the signature specimen.
3. Update `apps/clinic-app/navigation/screens/Profile.screen.tsx`:
   - In doctor profile, add E-Signature Specimen management section.
   - Display a real-time Physician Stamp Imprint previewing credentials (PRC, PTR, PDEA S2, PhilHealth PAN) overlaid with the transparent signature specimen image.
   - Button to open `SignatureSpecimenModal` or upload/draw signature and save.
4. Update `apps/clinic-app/components/settings/StaffManagementTab.tsx`:
   - In doctor edit form / modal, allow viewing and updating `signatureSpecimen` and `defaultSignatureMode`.
   - In `stampModalStaff` preview modal, render the signature specimen overlay above credentials.
5. Strict Token Compliance:
   - CRITICAL: `apps/clinic-app/scripts/check-tokens.mjs --strict` forbids literal emoji glyphs in `.tsx`. Use Lucide icons or `<Icon name="..." />`.
   - Use `theme.colors.*` for styling.
6. Verify your changes:
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/staffSignatureSpecimen.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/`
7. Write your handoff report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m3_signature/handoff.md` and send a message to parent when complete.
