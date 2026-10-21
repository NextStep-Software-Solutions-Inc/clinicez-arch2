## 2026-10-20T03:29:32Z

You are worker_m2_studio.
Your working directory is: /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m2_studio

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read the following authoritative files first:
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/PROJECT.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/explorer_survey_frontend/handoff.md
- /Users/macuser/projects/github/nextstep/clinicez-docs-studio/apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts

Your mission is to implement Milestone 2 (Document & Stationery Studio Settings Tab):
1. `apps/clinic-app/components/settings/types.ts`:
   - Add `'documents'` to `SettingsTabKey`.
2. `apps/clinic-app/navigation/screens/Settings.screen.tsx`:
   - Register `'documents'` tab (`key: 'documents'`, `label: 'Document & Stationery Studio'`, `icon: 'file'` or similar).
   - Render `<DocumentTemplatesSettingsTab ... />` when `activeTab === 'documents'`.
3. `apps/clinic-app/services/clinicService.ts`:
   - Update `ClinicSettingsRecord` and `updateSettings()` payload to support `paperSize?: 'Letter' | 'A4' | 'A5'` and `dohLicenseToOperate?: string`.
   - Add `getSampleDocumentPdfUrl(docType: string, options?: { wet?: boolean; paperSize?: string })`.
4. Create `apps/clinic-app/components/settings/DocumentTemplatesSettingsTab.tsx`:
   - High-density two-column workstation layout (side-by-side on desktop, responsive stacked on mobile).
   - Left Column Form Controls:
     * Facility Header (`letterheadHeader`)
     * Sub-Header / Tagline (`letterheadSubHeader`)
     * Physical Address (`letterheadAddress`)
     * Multi-channel Contact (`letterheadContact`)
     * DOH LTO Number (`dohLicenseToOperate`)
     * PhilHealth Accreditation (`accreditationNumber`)
     * Logo upload & remove action (reusing `pickClinicLogo` or image picker with base64 conversion)
     * Accent color override (palette picker with hex inputs adhering to brand tokens)
     * Paper Size selector (`Letter`, `A4`, `A5`)
     * Statutory Legal Disclaimer footer textarea (`letterheadFooter`)
     * Save Changes button calling `clinicService.updateSettings()`
   - Right Column Interactive Live Canvas Previewer:
     * Segmented switcher across all 4 document types: `Medical Certificate`, `Electronic Prescription`, `Diagnostic Requisition Slip`, `Clinical Referral Letter`.
     * Segmented switcher between `E-Signature Specimen` and `Wet Signature` preview.
     * Canvas rendering the exact visual document canvas reactively updating as the left column fields are changed.
     * Canvas shows Facility Header, contact details, DOH LTO, PhilHealth number, clinic logo, document body tailored to the selected type, and doctor signature block (reflecting either e-signature badge or wet signature blank line).
     * "Print Sample Test PDF" button opening or downloading the sample PDF via `clinicService.getSampleDocumentPdfUrl(...)`.
   - Strict Design System & Token Compliance:
     * 4 core UI states: Skeleton (loading), Empty (no settings found), Error (with retry), Active (full studio).
     * Zero hardcoded hex colors (use `theme.colors.*`).
     * CRITICAL LINTER RULE: `apps/clinic-app/scripts/check-tokens.mjs --strict` forbids literal emoji characters in code. Use Lucide icons or `<Icon name="..." />` or text without raw emoji glyphs.
5. Verify your implementation:
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test apps/clinic-app/tests/documentTemplatesSettingsTab.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`
   - `PATH="$HOME/.bun/bin:$PATH" node apps/clinic-app/scripts/check-tokens.mjs --strict`
   - `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run typecheck:clinic`
6. Write your handoff report to `/Users/macuser/projects/github/nextstep/clinicez-docs-studio/.agents/teamwork/worker_m2_studio/handoff.md` and send a message to parent when complete.
