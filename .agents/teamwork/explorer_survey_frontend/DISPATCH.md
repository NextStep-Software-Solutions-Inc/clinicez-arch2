# Survey Frontend Task Assignment
Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Target: apps/clinic-app


## 2026-11-12T23:14:34Z
You are a teamwork_explorer tasked with mapping the clinic workstation frontend scope for the teleconsultation feature.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Your state folder: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_frontend
Original request: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/ORIGINAL_REQUEST.md
Reference implementation plan: /Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md

Task:
1. Read ORIGINAL_REQUEST.md and the implementation_plan.md reference.
2. Investigate apps/clinic-app:
   - src/services/clinicService.ts (teleconsult DTOs and API methods)
   - ClinicCommsContext.tsx and TeleconsultWaitingRoomModal.tsx (integration with @clinicez/comms-sdk, useCallSession, CallWaitingRoom, CallStage, chart docking)
   - ScheduleVisitModal.tsx and AppointmentInspectionModal.tsx (In-Person vs Teleconsult toggle, payment policy selector, badges, waiting room launcher)
   - GeneralSettingsTab.tsx and TeleconsultSettingsCard.tsx
   - EncountersTimelineTab.tsx and ClinicRecordingPlayerModal.tsx (15-min ticketed playback, medico-legal hold)
3. Run baseline checks:
   - `cd apps/clinic-app && bun run typecheck`
   - `cd apps/clinic-app && bun run lint:tokens`
   - `cd apps/clinic-app && bun run lint:hosts`
   - `cd apps/clinic-app && bun test`
4. Document all constraints: zero token violations (check-tokens.mjs), zero external host violations (check-no-external-hosts.mjs), 44px min touch targets, semantic design tokens, responsive layout.
5. Document what is already implemented vs what is missing or needs modification.
6. Write your comprehensive analysis and findings to handoff.md in your state folder (/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_frontend/handoff.md).
7. Send a completion message to the parent orchestrator with the path to handoff.md.
