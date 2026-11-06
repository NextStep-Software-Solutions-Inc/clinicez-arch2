# TEST_INFRA: Clinic Communications Sheet & Triage Desk

## 1. Test Philosophy & Methodology

The Clinic Communications Sheet & Triage Desk test infrastructure enforces institutional-grade clinical reliability, strict human-centered clinical language, design token guardrails, and deterministic state management across `apps/clinic-app` and `@clinicez/comms-sdk`. Testing adheres to a rigorous **4-Tier Testing Methodology** validating observable contracts, UI components, interaction flows, and clinical workflows without coupling to internal trivia:

- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, `clinic_communications_sheet_production_plan.md`, and the `clinicez-ui-ux-expert` design skill.
- **Authoritative Oracles**:
  - **Clinical Language Oracle**: Verifies strict elimination of developer jargon and replacement with standardized clinical terms:
    - `STAT` -> `Emergency`
    - `SLA Breached` -> `Response Overdue`
    - `Disposition` -> `Clinical Decision` / `Action`
    - `INTERNAL NOTE — NEVER DELIVERED TO PATIENT` -> `Private Staff Note (Care Team Only)`
    - `ACK` -> `Read Confirmation`
    - `Scope` -> Clean titles (`Patient Request`, `Direct`, `Care Team`, `Facility Channel`)
  - **Design Token & Typography Oracle**: All UI elements adhere to `@clinicez/design-tokens` (brand teal `#0D6963`, semantic acuity tokens `routineBg`/`urgentBg`/`emergencyBg`, minimum 12px font size / `text-xs`, zero raw hex codes, zero raw palette imports, zero raw emojis).
  - **Countdown & SLA Timer Oracle**: Exact mathematical boundaries for 3-tier live countdown timers:
    - Green (`successBg` / `successText`): `remainingSeconds > 900` (> 15 minutes)
    - Amber (`warningBg` / `warningText`): `0 < remainingSeconds <= 900` (<= 15 minutes)
    - Red (`emergencyBg` / `emergencyText`): `remainingSeconds <= 0` or `isSlaBreached === true` (`Response Overdue`)
  - **Thread Header Control Order Oracle**: Strict left-to-right control sequence:
    - Left: Icon-only back button (`←`, `arrowLeft`), no text label.
    - Center: Conversation title + edit pencil icon (`✏️`, `edit`) for tap-to-rename.
    - Right (exact order): 1. Members counter button (`👥 <count>`), 2. Medical Privacy Blur icon-only (`👁️`, `eye`), 3. Action Menu (`•••`, `moreVertical` / `dotsHorizontal`) containing 7 items: Rename, View Patient Chart, Search in Conversation, Shift Handoff Summary, Mute Channel, Close & Archive, Delete Conversation.
  - **Drawer Connection Oracle**: Live connection indicator pill (`• Connected`) alongside manual reconnect button (`🔄`, `refresh` / `rotate`) triggering `reconnect()` from `useComms()` with active rotation spin animation and conversation resynchronization.
  - **Lifecycle & Modal Oracle**: `NewConversationModal` validation preventing empty titles and unselected staff across Direct Message, Care Team, and Facility Channel.

---

## 2. 4-Tier Test Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tier 4: Real-World Clinical Workload Scenarios                           │
│ (Pediatric Asthma Walk-In, Teledermatology Rash, Care Team Handoff,      │
│  Network Drop & Reconnect, Duplicate Inquiry Close & Retention)          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────┐
│ Tier 3: Cross-Feature Interactions & Combinations                        │
│ (Modal Creation -> Active Thread, Card Click -> Thread Navigation,       │
│  Privacy Blur -> In-Thread Search, Reconnect -> Sync, RBAC Tabs)         │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────┐
│ Tier 2: Boundary Value Analysis & Edge Cases                             │
│ (Timer 15m/0s Boundaries, Whitespace Titles, 0 Members, Overdue Display, │
│  Regex In-Thread Search, Rapid Reconnect Debounce, Empty State Guard)    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────┐
│ Tier 1: Isolated Feature & Contract Coverage                             │
│ (R1 Language & Tokens, R2 Header & Reconnect, R3 Modal & Lifecycle,     │
│  R4 Productivity Tools, R5 Triage Subsystem & 1-Click Dispositions)      │
└──────────────────────────────────────────────────────────────────────────┘
```

1. **Tier 1 (Feature Coverage)**: Isolated functional verification of each requirement (R1 through R5). Each feature is tested against its primary specification with >=5 dedicated test cases.
2. **Tier 2 (Boundary Value Analysis & Edge Cases)**: Extreme values, null/undefined inputs, whitespace edge conditions, timer boundaries (exact 900s, exact 0s, negative seconds), hitSlop touch targets (>=44px), and error recovery. Each feature has >=5 boundary test cases.
3. **Tier 3 (Cross-Feature Interactions & Combinations)**: Multi-dimensional pairwise interactions between modal creation, active thread headers, privacy mode, triage queue navigation, in-thread search, and SignalR reconnection.
4. **Tier 4 (Real-World Clinical Workload Scenarios)**: High-fidelity end-to-end simulations reflecting Philippine clinical outpatient workflows (emergency intake, telehealth teledermatology, shift handoffs, intermittent connectivity, and statutory retention archiving).

---

## 3. Feature Inventory & Mapping

| Feature # | Feature Description | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Verification Target |
|:---------:|---------------------|:------------------:|:------:|:------:|:------:|:------:|---------------------|
| **R1.1** | Clinical Language Normalization (`Emergency`, `Response Overdue`, `Clinical Decision`, `Private Staff Note`, `Read Confirmation`) | ORIGINAL_REQUEST R1, PROJECT.md F1.1 | ✓ | ✓ | ✓ | ✓ | UI Text, Badges & Oracles |
| **R1.2** | Clean Scope Titles (`Patient Request`, `Direct`, `Care Team`, `Facility Channel`) | ORIGINAL_REQUEST R1, PROJECT.md F1.1 | ✓ | ✓ | ✓ | ✓ | Category Badges & Pills |
| **R1.3** | Font Size Normalization (min 12px / `text-xs`, 0 sub-12px) | ORIGINAL_REQUEST R1, PROJECT.md F1.2 | ✓ | ✓ | ✓ | ✓ | Typography Tokens & AST |
| **R1.4** | Design Token Guardrails (0 hex colors, 0 raw palette, 0 emojis) | ORIGINAL_REQUEST R1, PROJECT.md F1.3 | ✓ | ✓ | ✓ | ✓ | `@clinicez/design-tokens`, Lint |
| **R2.1** | Drawer Header Live Connection Pill (`• Connected`) | ORIGINAL_REQUEST R2, PROJECT.md F2.1 | ✓ | ✓ | ✓ | ✓ | `ClinicChatDrawerHost.tsx` |
| **R2.2** | Manual Reconnect Button (`🔄`) with Spin Animation & Sync | ORIGINAL_REQUEST R2, PROJECT.md F2.1 | ✓ | ✓ | ✓ | ✓ | Reconnect Handler & Spin State |
| **R2.3** | Icon-Only Back Button (`←`, `arrowLeft`, no text label) | ORIGINAL_REQUEST R2, PROJECT.md F2.2 | ✓ | ✓ | ✓ | ✓ | Thread Header Back Control |
| **R2.4** | Thread Center Title + Edit Pencil Icon (`✏️`) for Tap-to-Rename | ORIGINAL_REQUEST R2, PROJECT.md F2.3 | ✓ | ✓ | ✓ | ✓ | Thread Header Center Layout |
| **R2.5** | Thread Right Controls Exact Sequence (1. `👥 <count>`, 2. `👁️`, 3. `•••`) | ORIGINAL_REQUEST R2, PROJECT.md F2.4 | ✓ | ✓ | ✓ | ✓ | Thread Header Right Controls |
| **R2.6** | Action Menu 7 Items (Rename, View Patient Chart, Search, Handoff, Mute, Close, Delete) | ORIGINAL_REQUEST R2, PROJECT.md F2.5 | ✓ | ✓ | ✓ | ✓ | Action Menu Modal / Popup |
| **R3.1** | `NewConversationModal` 3 Types (Direct Message, Care Team, Facility Channel) | ORIGINAL_REQUEST R3, PROJECT.md F3.1 | ✓ | ✓ | ✓ | ✓ | `NewConversationModal.tsx` |
| **R3.2** | Modal Validation (Prevents Empty Title, Requires Staff Selection) | ORIGINAL_REQUEST R3, PROJECT.md F3.2 | ✓ | ✓ | ✓ | ✓ | Form Validator & Submit Guard |
| **R3.3** | Conversation Lifecycle Operations (Rename, Members, Close & Archive, Delete) | ORIGINAL_REQUEST R3, PROJECT.md F3.3 | ✓ | ✓ | ✓ | ✓ | Conversation State Handlers |
| **R4.1** | Pinned Clinical Orders & Alerts Banner | ORIGINAL_REQUEST R4, PROJECT.md F4.1 | ✓ | ✓ | ✓ | ✓ | Active Thread Banner Ribbon |
| **R4.2** | 4 Quick 1-Tap Clinical Response Pills (`+ Vitals`, `+ Bedside`, `+ Lab`, `+ On My Way`) | ORIGINAL_REQUEST R4, PROJECT.md F4.2 | ✓ | ✓ | ✓ | ✓ | Speed Reply Bar |
| **R4.3** | 1-Click Link to Patient Chart (`View Patient Chart`) | ORIGINAL_REQUEST R4, PROJECT.md F4.3 | ✓ | ✓ | ✓ | ✓ | Chart Navigation Link |
| **R4.4** | In-Thread Search Bar & Content Filtering | ORIGINAL_REQUEST R4, PROJECT.md F4.4 | ✓ | ✓ | ✓ | ✓ | In-Thread Search Input & Highlight |
| **R4.5** | Shift Handoff Summary Generation Action | ORIGINAL_REQUEST R4, PROJECT.md F4.5 | ✓ | ✓ | ✓ | ✓ | Handoff Generator Action |
| **R5.1** | Live Triage Ingestion (`GET /api/v1/comms/conversations?scope=PatientFacility`) | ORIGINAL_REQUEST R5, PROJECT.md F5.2 | ✓ | ✓ | ✓ | ✓ | `useTriageQueue.ts` REST Client |
| **R5.2** | Live Triage Disposition (`POST /api/v1/comms/triage/{id}/disposition`) | ORIGINAL_REQUEST R5, PROJECT.md F5.3 | ✓ | ✓ | ✓ | ✓ | `useTriageQueue.ts` Disposition |
| **R5.3** | 3-Tier Response Countdown Timers (Green >15m, Amber <15m, Red Response Overdue) | ORIGINAL_REQUEST R5, PROJECT.md F5.4 | ✓ | ✓ | ✓ | ✓ | Timer Pill & Style Oracle |
| **R5.4** | 1-Click Clinical Actions (Consult, Need Visit, Route, Decline) | ORIGINAL_REQUEST R5, PROJECT.md F5.5 | ✓ | ✓ | ✓ | ✓ | Triage Action Handlers |
| **R5.5** | Card-to-Thread Navigation (`onSelectCard`) | ORIGINAL_REQUEST R5, PROJECT.md F5.6 | ✓ | ✓ | ✓ | ✓ | Triage Card Tap Callback |

---

## 4. Test Execution & Runner Commands

### 4.1 Primary E2E Production Suite
Executes the comprehensive 4-Tier test suite covering R1–R5:
```bash
cd apps/clinic-app && bun test tests/e2e/clinicCommunicationsProduction.test.ts
```

### 4.2 Side-Drawer & A11y Integration Test Suite
Executes regression coverage for drawer layout, contrast, and navigation consolidation:
```bash
cd apps/clinic-app && bun test tests/challenger_m2_side_sheet_consolidation.test.ts tests/challenger_m2_2_a11y_tokens_visual.test.ts
```

### 4.3 Comms SDK Core Unit & Adversarial Test Suite
Executes SDK hooks, SignalR connection manager, and state machine tests:
```bash
cd packages/comms-sdk && bun test
```

### 4.4 Design Token Lint & Quality Gate
Validates zero token violations, zero hardcoded hex codes, zero raw emojis:
```bash
cd apps/clinic-app && bun run lint:tokens
```

---

## 5. Coverage Thresholds & Pass Criteria

1. **Tier 1 (Feature Coverage)**: >=5 test cases per feature R1–R5 (>= 25 test cases minimum).
2. **Tier 2 (Boundary Value Analysis)**: >=5 test cases per feature R1–R5 (>= 25 test cases minimum).
3. **Tier 3 (Cross-Feature Combinations)**: >=10 pairwise cross-feature interaction test cases.
4. **Tier 4 (Real-World Scenarios)**: >=5 comprehensive end-to-end clinical workflow scenarios.
5. **Quality Gates**:
   - 100% test pass rate with 0 failing assertions.
   - 0 token guard violations (`bun run lint:tokens`).
   - Zero facade tests or trivial tautologies (`expect(true).toBe(true)`).
