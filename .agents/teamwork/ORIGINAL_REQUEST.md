# Original User Request

## Initial Request — 2026-11-05T23:56:12Z

Elevate the Clinic Communications Sheet & Triage Desk in `apps/clinic-app` and `@clinicez/comms-sdk` to production-ready quality.

Integrity mode: development

Reference Material:
- Implementation Plan: `/Users/macuser/.gemini/antigravity/brain/35833875-1d06-46ae-9d1c-223b7b36e6a9/clinic_communications_sheet_production_plan.md`

## Requirements

### R1. Human-Centered Clinical Language and Design Tokens Guardrails
Replace developer jargon, internal acronyms, and clinical jargon with clear everyday language:
- Replace `STAT` with `Emergency`
- Replace `SLA Breached` with `Response Overdue`
- Replace `Disposition` with `Clinical Decision` or `Action`
- Replace `INTERNAL NOTE — NEVER DELIVERED TO PATIENT` with `Private Staff Note (Care Team Only)`
- Replace `ACK` with `Read Confirmation`
- Replace `Scope` with clean titles (`Patient Request`, `Direct`, `Care Team`, `Facility Channel`)
Ensure no sub-12px micro-text (minimum `text-xs` / 12px everywhere). Strictly adhere to `@clinicez/design-tokens` with no hardcoded hex colors, no raw palette imports, and no emojis.

### R2. Thread Header and Drawer Header Navigation Controls
Implement the active thread header layout:
- Left: Back button (Icon Only `←`, no text label).
- Center: Title + Edit Pencil icon (`✏️`) for tap-to-rename.
- Right Controls (in exact order):
  1. Care Team / Members counter button (`👥 3`) to open member management drawer.
  2. Medical Privacy Blur (Icon Only `👁️`, toggles blur on sensitive patient details).
  3. Action Menu (`•••` at the rightmost edge), housing Rename, View Patient Chart, Search in Conversation, Shift Handoff Summary, Mute Channel, Close & Archive, and Delete Conversation.
In the top drawer header, provide the live connection indicator pill (`• Connected`) alongside a manual reconnect icon button (`🔄`) right beside the connection pill that triggers `reconnect()` from `useComms()` with an active rotation spin animation and resyncs conversations.

### R3. Conversation Lifecycle and Management Modal
Implement `NewConversationModal.tsx` supporting Direct Message (with staff picker from `useStaff()`), Care Team, and Facility Channel, with validation preventing empty titles or unselected staff. Support full conversation lifecycle operations: inline and menu rename, members management (add colleague, leave/remove), close and archive with audit retention compliance, and delete conversation guarded for empty or test chats.

### R4. Clinical Productivity Tools
Provide in-thread clinical productivity tools:
- Pinned Clinical Orders & Alerts banner
- Quick 1-tap clinical response pills (`+ Vitals Charted`, `+ Bedside Now`, `+ Lab Requested`, `+ On My Way`)
- 1-click Link to Patient Chart (`View Patient Chart`)
- In-thread search bar
- Shift handoff summary action

### R5. Triage Requests Subsystem
Wire `useTriageQueue.ts` to live backend endpoints `GET /api/v1/comms/conversations?scope=PatientFacility&facilityId={facilityId}` and `POST /api/v1/comms/triage/{id}/disposition`. Provide live response countdown timers with visual priority indicators. Implement 1-click clinical actions (Consult, Need Visit, Route, Decline) and card-to-thread navigation.

## Verification Resources
- Design Tokens Linting: `cd apps/clinic-app && bun run lint:tokens`
- Comms SDK Tests: `cd packages/comms-sdk && bun test`
- Side-Drawer Integration Tests: `cd apps/clinic-app && bun test tests/challenger_m2_side_sheet_consolidation.test.ts tests/challenger_m2_2_a11y_tokens_visual.test.ts`
- Additional verification resources: left to the team to determine.

## Acceptance Criteria

### Language & Design Tokens
- [ ] Developer, internal, and clinical jargon is replaced with everyday language (`STAT` -> `Emergency`, `SLA Breached` -> `Response Overdue`, `Disposition` -> `Clinical Decision` or `Action`, `INTERNAL NOTE — NEVER DELIVERED TO PATIENT` -> `Private Staff Note (Care Team Only)`, `ACK` -> `Read Confirmation`, and `Scope` -> clean category titles).
- [ ] No font size in the UI is smaller than 12px (`text-xs`).
- [ ] `cd apps/clinic-app && bun run lint:tokens` passes with 0 violations.

### Thread Header & Drawer Controls
- [ ] Active thread header back button is icon-only (`←`) with no text label.
- [ ] Thread header center displays conversation title and tap-to-rename pencil icon (`✏️`).
- [ ] Thread header right controls appear in exact order: Care Team / Members counter button (`👥 <count>`), Medical Privacy Blur icon-only button (`👁️`), and Action Menu (`•••`) at the rightmost edge.
- [ ] Action Menu contains Rename, View Patient Chart, Search in Conversation, Shift Handoff Summary, Mute Channel, Close & Archive, and Delete Conversation.
- [ ] Top drawer header renders live connection indicator pill (`• Connected`) with manual reconnect icon button (`🔄`) beside it that triggers `reconnect()` from `useComms()` with active rotation animation and refreshes conversations.

### Conversation Management & Modals
- [ ] `NewConversationModal.tsx` allows creating Direct Messages (with staff from `useStaff()`), Care Team, and Facility Channel conversations, preventing creation with empty title or unselected staff.
- [ ] Inline and menu Rename updates the conversation title.
- [ ] Member management drawer allows viewing members, adding colleagues, and removing/leaving.
- [ ] Close & Archive completes and archives conversations with retention compliance.
- [ ] Delete conversation is available and guarded for empty/test chats.

### Clinical Productivity Tools
- [ ] Pinned Clinical Orders & Alerts banner renders at the top of active threads.
- [ ] Quick 1-tap clinical response pills are displayed above the composer.
- [ ] 1-click "View Patient Chart" opens patient medical records when patient context is linked.
- [ ] In-thread search bar filters and highlights conversation content.
- [ ] Shift handoff summary action generates summary of active patients and open instructions.

### Triage Requests Subsystem
- [ ] `useTriageQueue.ts` fetches from `GET /api/v1/comms/conversations?scope=PatientFacility&facilityId={facilityId}`.
- [ ] `useTriageQueue.ts` submits dispositions to `POST /api/v1/comms/triage/{id}/disposition`.
- [ ] Triage cards display live response countdown timers with color coding (Green >15m, Amber <15m, Red Response Overdue).
- [ ] 1-click actions (Consult, Need Visit, Route, Decline) execute their respective dispositions.
- [ ] Tapping a triage card opens the active thread displaying patient inquiry details and attachments.

### Automated Test Verification
- [ ] `cd packages/comms-sdk && bun test` passes 100%.
- [ ] `cd apps/clinic-app && bun test tests/challenger_m2_side_sheet_consolidation.test.ts tests/challenger_m2_2_a11y_tokens_visual.test.ts` passes 100%.


## Follow-up — 2026-11-06T00:04:42Z

User directive / reminder: No backward compatibility consideration is needed - we are in the development stage. Feel free to refactor, replace, or clean up outdated interfaces and legacy stubs directly without worrying about backward compatibility.
