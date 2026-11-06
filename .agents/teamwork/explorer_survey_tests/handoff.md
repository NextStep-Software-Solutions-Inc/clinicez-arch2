# Handoff Report: Survey of Design Tokens, Linting, Jargon, & Test Baselines

**Explorer**: Explorer 3  
**Working Directory**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/triage_desk_documentation/.agents/teamwork/explorer_survey_tests/`  
**Date**: 2026-11-06  
**Status**: Completed (Hard Handoff)

---

## 1. Observation

### 1.1 Token Linting & Guardrails (`apps/clinic-app`)
Execution of `cd apps/clinic-app && bun run lint:tokens`:
```bash
$ bun scripts/check-tokens.mjs

Token guard: 0 violation(s) in 0 file(s).
Token guard OK (no regressions vs baseline).
```

When evaluated with `--report` (`bun scripts/check-tokens.mjs --report`):
- Scanned: 537 source files (`.ts`, `.tsx`, `.js`, `.jsx` excluding `node_modules`, `dist`, `.expo`, `constants`, `scripts`, `assets`).
- Violations detected: `0 violation(s) in 0 file(s)`.
- Baseline reference (`apps/clinic-app/scripts/token-baseline.json`):
  ```json
  {
    "components/CameraQrScannerModal.tsx": 14
  }
  ```
  Note: `components/CameraQrScannerModal.tsx` was previously refactored and now has 0 violations; thus the current repo is completely clean of token violations relative to the baseline.

#### Rules Enforced by `check-tokens.mjs`:
In `apps/clinic-app/scripts/check-tokens.mjs` (lines 44–49):
```javascript
const RULES = {
  color: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\(/g,
  fontSize: /\bfontSize:\s*\d+/g,
  radius: /\b(?!shadow)\w*[rR]adius:\s*[1-9]\d*/g,
  emoji: /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B00-\u2BFF]/g,
};
```
- **Colors**: Hex or raw `rgba()` literals are forbidden. Theme colors must be imported from `constants/theme.ts` (e.g. `theme.colors.primary`).
- **Font Sizes**: Numeric literals for `fontSize:` are forbidden. Text must be wrapped in `ThemedText` with a semantic `variant` (`display`, `h1`, `h2`, `title`, `h3`, `bodyLarge`, `body`, `bodyBold`, `small`, `smallBold`, `caption`, `captionBold`, `badge`, `code`).
- **Border Radii**: Numeric literals for `*Radius:` (excluding `shadowRadius`) are forbidden. Must use `theme.radii.*` (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `full`).
- **Emojis**: Raw Unicode emoji/pictographs are forbidden in UI markup. Icons must use `<Icon name="..." />` backed by Lucide (`apps/clinic-app/components/ui/Icon.tsx`).

### 1.2 Sub-12px Font Sizes, Hardcoded Hex, and Emojis Across Codebases

#### `apps/clinic-app`:
- **Hardcoded Hex in Comms**: Zero occurrences in `apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx`.
- **Raw Palette Imports in Components**: Zero occurrences in `components/` (all palette usage is confined to `constants/theme.ts`).
- **Sub-12px Font Sizes**: Zero occurrences in production components. `theme.typography` uses `fontSizeScale.xs` (12px) for `caption`, `captionBold`, `badge`, and `code`. The only sub-12px occurrences in `apps/clinic-app` are in mock fixtures (`tests/calendarE2E.test.ts:695` and `tests/e2e/analyticsReportsE2E.test.ts:1073`).
- **Emojis in Components**: Zero occurrences in JSX text across `components/` and `navigation/`. `apps/clinic-app/components/ui/Icon.tsx` has `token-guard:ignore-file` to host the icon registry.

#### `packages/comms-sdk`:
Execution of `cd packages/comms-sdk && bun scripts/check-tokens.mjs`:
```bash
Comms SDK token guard: 0 violation(s) across 38 source file(s).
```
However, AST and regex scans revealed a **critical finding** in `packages/comms-sdk/src/web-ui`:
Because `scripts/check-tokens.mjs` only searches for React Native style `fontSize:\s*\d+`, it does not check Tailwind CSS arbitrary font classes.
We discovered **15 occurrences of sub-12px micro-text (`text-[10px]` and `text-[11px]`) in `packages/comms-sdk/src/web-ui`**:
1. `packages/comms-sdk/src/web-ui/ChatDrawer.tsx`:
   - Line 196: `text-[10px]` (`<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100...`)
   - Line 201: `text-[10px]` (`<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100...`)
   - Line 206: `text-[10px]` (`<span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold...`)
2. `packages/comms-sdk/src/web-ui/MessageThread.tsx`:
   - Line 45: `text-[11px]` (`<span className="flex items-center gap-1 text-[11px] text-white/80"...`)
   - Line 52: `text-[11px]` (`<span className="flex items-center gap-1 text-[11px] text-white/80"...`)
   - Line 59: `text-[11px]` (`<span className="flex items-center gap-1 text-[11px] text-white font-semibold"...`)
   - Line 66: `text-[11px]` (`<span className="flex items-center gap-1.5 text-[11px] text-red-200 font-bold"...`)
   - Line 72: `text-[10px]` (`className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold...`)
   - Line 152: `text-[11px]` (`<div className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">`)
   - Line 234: `text-[11px]` (`<span className={`text-[11px] ${isMe ? 'text-white/80' : 'text-slate-400'}`}>`)
3. `packages/comms-sdk/src/web-ui/CallWaitingRoom.tsx`:
   - Line 143: `text-[11px]` (`<p className="text-[11px] text-teal-800 dark:text-teal-400 mt-0.5">`)
   - Line 155: `text-[11px]` (`<p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">`)
   - Line 176: `text-[11px]` (`<p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">`)
   - Line 189: `text-[11px]` (`<p className="text-[11px] text-slate-500 leading-relaxed">`)
4. `packages/comms-sdk/src/web-ui/GuestJoinPage.tsx`:
   - Line 232: `text-[11px]` (`<p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">`)

- **Emojis in `packages/comms-sdk`**:
  - `packages/comms-sdk/src/core/reactions.ts`: Contains `ALLOWED_STAFF_REACTIONS = ['👍', '❤️', '🙏', '✅', '👀', '⚠️']`. The file has `// token-guard:ignore-file` because it defines the backend protocol reaction constants.
  - Zero raw emojis are embedded in `packages/comms-sdk/src/native-ui/` or `web-ui/` JSX.

---

### 1.3 Clinical & Developer Jargon Audit

Every occurrence of the 6 targeted jargon terms across both codebases was surveyed and verified:

#### Term 1: `STAT` -> must be `Emergency`
- `packages/comms-sdk/src/web-ui/ChatDrawer.tsx`: Line 197 (`STAT`)
- `packages/comms-sdk/src/web-ui/TriageQueueView.tsx`: Line 184 (`{filter === 'Emergency' ? 'STAT' : ...}`), Line 310 (`STAT`)
- `packages/comms-sdk/src/native-ui/ChatDrawer.tsx`: Line 202 (`<Text style={styles.statBadgeText}>STAT</Text>`)
- `packages/comms-sdk/src/native-ui/TriageQueueView.tsx`: Line 197 (`{filter === 'Emergency' ? 'STAT' : ...}`), Line 301 (`<Text style={styles.statBadgeText}>STAT</Text>`)
- `packages/comms-sdk/tests/empirical_state_machine_sla.test.ts`: Lines 372, 403, 458
- `packages/comms-sdk/tests/adversarial/triage-queue-states.adversarial.test.ts`: Lines 411, 465

#### Term 2: `SLA Breached` -> must be `Response Overdue`
- `packages/comms-sdk/src/web-ui/TriageQueueView.tsx`: Line 21 (`return 'SLA Breached';`), Line 39 (`return 'SLA Breached';`)
- `packages/comms-sdk/src/native-ui/TriageQueueView.tsx`: Line 37 (`return 'SLA Breached';`), Line 55 (`return 'SLA Breached';`)
- `apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx`: Line 218 (`slaBreached: i.isSlaBreached`), Line 219 (`slaTimeRemainingSeconds: i.slaTimeRemainingSeconds`)
- `apps/clinic-app/tests/challenger_m2_side_sheet_consolidation.test.ts`: Line 311 (`isSlaBreached: false`)
- `packages/comms-sdk/tests/empirical_state_machine_sla.test.ts`: Lines 515, 537, 540, 543, 544, 600, 614, 643, 646, 663, 669
- `packages/comms-sdk/tests/adversarial/triage-queue-states.adversarial.test.ts`: Lines 551, 553, 582, 587, 623, 625, 628, 659, 671, 690

#### Term 3: `Disposition` -> must be `Clinical Decision` or `Action`
- **UI Text in `apps/clinic-app`**:
  - `components/comms/ClinicChatDrawerHost.tsx`:
    - Line 234: `notify.success('Inquiry disposition recorded: Answered.');`
    - Line 240: `notify.success('Inquiry disposition recorded: In-Clinic Visit Requested.');`
    - Line 247: `notify.success('Inquiry disposition recorded: Declined.');`
    - Line 259: `notify.error(err?.message || 'Failed to record triage disposition.');`
  - `navigation/screens/Triage.screen.tsx`:
    - Line 38: `notify.success('Inquiry disposition recorded: Answered.');`
    - Line 44: `notify.success('Inquiry disposition recorded: In-Clinic Visit Requested.');`
    - Line 51: `notify.success('Inquiry disposition recorded: Declined.');`
    - Line 63: `notify.error(err?.message || 'Failed to record triage disposition.');`
    - Line 93: `headerSubtitle="Real-time patient triage queue with 1-click clinical dispositions"`
- **UI Text in `packages/comms-sdk`**:
  - `src/native-ui/TriageQueueView.tsx`: Line 476 (`{isSubmitting ? 'Submitting...' : 'Confirm Disposition'}`)
  - `src/web-ui/TriageQueueView.tsx`: Line 474 (`{isSubmitting ? 'Submitting...' : 'Confirm Disposition'}`)
- **Code & Type Identifiers (Payloads, Handlers, Hooks)**:
  - `packages/comms-sdk/src/native-ui/types.ts`: Line 6, 21, 60 (`TriageDispositionPayload`, `onExecuteDisposition`)
  - `packages/comms-sdk/src/react/hooks/useTriageQueue.ts`: Lines 5, 19, 72, 94, 95 (`recordDisposition`, `isSubmittingDisposition`)
  - `apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx`: Line 20, 226, 396 (`handleExecuteDisposition`)
  - `apps/clinic-app/tests/challenger_m2_side_sheet_consolidation.test.ts`: Lines 651–677

#### Term 4: `INTERNAL NOTE — NEVER DELIVERED TO PATIENT` / `NEVER VISIBLE TO PATIENT` -> must be `Private Staff Note (Care Team Only)`
- `packages/comms-sdk/src/native-ui/MessageThread.tsx`:
  - Line 168: `INTERNAL NOTE — NEVER VISIBLE TO PATIENT`
  - Line 246: `{isInternal ? 'Internal Note: ACTIVE' : 'Note'}`
  - Line 256: `placeholder={isInternal ? 'Type internal note for care team...' : 'Type message...'}`
- `packages/comms-sdk/src/web-ui/MessageThread.tsx`:
  - Line 262: `{isInternal ? 'Internal Note Mode: ACTIVE' : 'Internal Note'}`
  - Line 271: `placeholder={isInternal ? 'Type internal note for care team...' : 'Type message...'}`
- `packages/comms-sdk/tests/adversarial/privacy-mode.adversarial.test.ts`: Lines 106, 212

#### Term 5: `ACK` -> must be `Read Confirmation`
- `packages/comms-sdk/src/native-ui/MessageThread.tsx`: Line 79 (`<Text style={styles.deliveryIconTeal}>ACK</Text>`)
- `packages/comms-sdk/src/web-ui/MessageThread.tsx`: Line 52 (`title="Delivered to hub, awaiting recipient storage ACK"`), Line 60 (`<span>ACK</span>`)
- `packages/comms-sdk/tests/adversarial/delivery-invariants.test.ts`: Line 6 (`// A message cannot jump directly from Sending (client in-flight) to Received (recipient storage ACK)`)

#### Term 6: `Scope` -> clean titles (`Patient Request`, `Direct`, `Care Team`, `Facility Channel`)
- `packages/comms-sdk/src/native-ui/MessageThread.tsx`: Line 109 (`<Text style={styles.headerSubtitle}>Scope: {conversationScope}</Text>`)
- `packages/comms-sdk/src/web-ui/MessageThread.tsx`: Line 87 (`<p className="text-xs text-slate-500">Scope: {conversationScope}</p>`)
- `packages/comms-sdk/src/native-ui/ChatDrawer.tsx`: Lines 134–139 (currently maps `'PatientFacility' -> 'Triage'`, `'StaffContext' -> 'Care Team'`, and passes raw `scope` for `'Facility'` instead of `'Facility Channel'`)
- `packages/comms-sdk/src/web-ui/ChatDrawer.tsx`: Lines 111–115 (same mapping)
- `apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx`: Line 107 (`conversationScope={conversation?.scope || 'Facility'}`)

---

### 1.4 Test Baseline Execution & Results

#### Baseline 1: `cd packages/comms-sdk && bun test`
- **Command Output**:
  ```
  104 pass
  0 fail
  16730 expect() calls
  Ran 104 tests across 22 files. [189.00ms]
  ```
- **Test Files Passing (22/22)**:
  - `tests/empirical_state_machine_sla.test.ts` (12 tests)
  - `tests/core/delivery-state.test.ts` (3 tests)
  - `tests/core/attachment-helpers.test.ts` (7 tests)
  - `tests/core/deduplication.test.ts` (3 tests)
  - `tests/core/connection.test.ts` (2 tests)
  - `tests/core/retry-policy.test.ts` (3 tests)
  - `tests/core/ticket-renewal.test.ts` (3 tests)
  - `tests/adversarial/triage-queue-states.adversarial.test.ts` (24 tests)
  - `tests/adversarial/guest-lockout.adversarial.test.ts` (4 tests)
  - `tests/adversarial/ticket-concurrency.test.ts` (3 tests)
  - `tests/adversarial/jitter-bounds.test.ts` (3 tests)
  - `tests/adversarial/queue-fifo-dedup.test.ts` (3 tests)
  - `tests/adversarial/delivery-invariants.test.ts` (4 tests)
  - `tests/adversarial/attachment-spoofing.adversarial.test.ts` (5 tests)
  - `tests/adversarial/staff-workstations.adversarial.test.ts` (11 tests)
  - `tests/adversarial/privacy-mode.adversarial.test.ts` (5 tests)
  - `tests/react/useCallSession.test.ts` (1 test)
  - `tests/react/useComms.test.ts` (1 test)
  - `tests/react/useTriageQueue.test.ts` (1 test)
  - `tests/react/optimistic-store.test.ts` (2 tests)
  - `tests/react/useSendMessage.test.ts` (2 tests)
  - `tests/react/useConversation.test.ts` (2 tests)

#### Baseline 2: `cd apps/clinic-app && bun test tests/challenger_m2_side_sheet_consolidation.test.ts tests/challenger_m2_2_a11y_tokens_visual.test.ts`
- **Command Output**:
  ```
  44 pass
  0 fail
  149 expect() calls
  Ran 44 tests across 2 files. [119.00ms]
  ```
- **Test Files Passing (2/2)**:
  - `tests/challenger_m2_side_sheet_consolidation.test.ts` (15 tests)
  - `tests/challenger_m2_2_a11y_tokens_visual.test.ts` (29 tests)

---

## 2. Logic Chain

1. **Token Compliance Status (apps/clinic-app)**:
   - Observation 1.1 shows `bun run lint:tokens` exits code 0 with 0 violations in 0 files.
   - Observation 1.2 shows `apps/clinic-app/components/ui/ThemedText.tsx` enforces `theme.typography.*`, whose smallest font size is `fontSizeScale.xs` (12px).
   - Therefore, `apps/clinic-app` currently fulfills the design tokens baseline, but any new UI added for R2, R3, R4, R5 must strictly maintain this discipline: no raw hex colors, no raw palette imports, no sub-12px text, and no raw emojis (all glyphs must come from `<Icon name="..." />`).

2. **Hidden Sub-12px Violation in SDK Web UI**:
   - Observation 1.2 reveals 15 explicit instances of `text-[10px]` and `text-[11px]` in `packages/comms-sdk/src/web-ui`.
   - Acceptance Criteria R1 explicitly dictates: *"No font size in the UI is smaller than 12px (`text-xs`)"*.
   - Because `packages/comms-sdk/scripts/check-tokens.mjs` only matches React Native `fontSize:\s*\d+`, these web violations went undetected.
   - Therefore, these classes must be upgraded to `text-xs` (12px) during implementation.

3. **Jargon Decoupling Requirement**:
   - Observation 1.3 documents that `STAT`, `SLA Breached`, `Disposition`, `INTERNAL NOTE`, `ACK`, and `Scope` are embedded across UI components and tests.
   - Specifically, `TriageQueueView.tsx` (both Native and Web) displays `'STAT'` (lines 184/197, 301/310) and returns `'SLA Breached'` (lines 21/37, 39/55).
   - In `apps/clinic-app`, `ClinicChatDrawerHost.tsx` (lines 234–259) displays toasts referring to "disposition".
   - Furthermore, `packages/comms-sdk/tests/empirical_state_machine_sla.test.ts` and `triage-queue-states.adversarial.test.ts` explicitly assert `'STAT'` and `'SLA Breached'`.
   - Therefore, replacing these terms with `Emergency`, `Response Overdue`, `Clinical Decision / Action`, `Private Staff Note (Care Team Only)`, `Read Confirmation`, and clean category titles requires coordinating both the component text AND the corresponding test assertions so tests continue passing.

4. **Missing Production Functionality & Test Coverage (R2–R5)**:
   - In `ClinicActiveThread` (`apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx` lines 85–102):
     - Back button currently has text: `<ThemedText variant="smallBold">Conversations</ThemedText>` (violates R2 icon-only requirement).
     - Center title lacks tap-to-rename pencil icon (`✏️` / `edit`).
     - Right controls (Members counter `👥`, Medical Privacy Blur `👁️`, Action Menu `•••` with 7 actions) are entirely missing.
     - Top drawer header lacks the manual reconnect button (`🔄`) beside the `• Connected` status pill.
   - `NewConversationModal.tsx` does not exist (currently `handleNewConversation` creates a stub channel).
   - In-thread clinical productivity tools (pinned orders banner, 1-tap quick replies, 1-click patient chart link, in-thread search, shift handoff summary) are not implemented.
   - `useTriageQueue.ts` in `packages/comms-sdk` currently stubs `refresh()` (empty try-catch) and localizes `recordDisposition` rather than issuing HTTP requests to backend endpoints `GET /api/v1/comms/conversations?scope=PatientFacility&facilityId={facilityId}` and `POST /api/v1/comms/triage/{id}/disposition`.
   - Neither of the existing test suites (`challenger_m2` or `challenger_m2_2`) test the R2 header controls, R3 modal, R4 tools, or R5 card-to-thread navigation.

---

## 3. Caveats

1. **Non-Comms Codebase Occurrences**:
   - The term `STAT` appears in `apps/clinic-app/navigation/screens/Consultations.screen.tsx` and various lab order / diagnostic test suites. These are clinical statutory / lab order codes outside the Communications Sheet & Triage Desk domain and should not be modified.
2. **Backend Protocol vs UI Jargon**:
   - The SignalR hub event is named `OnThreadStateChanged` with parameter `disposition?: TriageDisposition`, and database fields/REST payloads use `disposition`. The requirement is to replace developer and clinical jargon in *human-facing everyday language* (`Clinical Decision` or `Action`), while wire protocol identifiers in DTOs can remain compatible with backend API schemas.
3. **Reactions Allowlist**:
   - `packages/comms-sdk/src/core/reactions.ts` contains literal Unicode emojis (`['👍', '❤️', '🙏', '✅', '👀', '⚠️']`). This is permitted via its `token-guard:ignore-file` comment to match the backend `CommsReactionValidator`. UI controls must continue using design-token icons (`<Icon name="..." />`).

---

## 4. Conclusion

1. **Linting & Tokens**: `apps/clinic-app` has **0 token violations** currently. The token guard passes cleanly. However, `packages/comms-sdk/src/web-ui` has **15 sub-12px font violations** (`text-[10px]` and `text-[11px]`) that must be normalized to `text-xs` (12px).
2. **Jargon Elimination**: All 6 required jargon terms are precisely mapped. Key UI changes needed:
   - `STAT` -> `Emergency` in `ChatDrawer` and `TriageQueueView` (Native & Web)
   - `SLA Breached` -> `Response Overdue` in `formatSlaCountdown` and `isItemSlaBreached`
   - `Inquiry disposition recorded` -> `Clinical decision recorded` in `ClinicChatDrawerHost.tsx` and `Triage.screen.tsx`
   - `INTERNAL NOTE — NEVER VISIBLE TO PATIENT` -> `Private Staff Note (Care Team Only)` in `MessageThread.tsx`
   - `ACK` -> `Read Confirmation` in `MessageThread.tsx` delivery receipts
   - `Scope: {scope}` -> Clean category badges (`Patient Request`, `Direct`, `Care Team`, `Facility Channel`)
3. **Test Baselines**: Both baseline suites pass 100% (104 tests in SDK, 44 tests in Clinic App). New tests must be added to cover R2 (Header & Reconnect), R3 (`NewConversationModal`), R4 (Productivity Tools), and R5 (Triage Subsystem), and existing SDK tests expecting `'STAT'` and `'SLA Breached'` must be aligned.

---

## 5. Verification Method

### 5.1 Token Linting Verification
Run from workspace root:
```bash
# 1. Clinic App token guard
cd apps/clinic-app && bun run lint:tokens
cd apps/clinic-app && bun scripts/check-tokens.mjs --strict

# 2. Comms SDK token guard
cd packages/comms-sdk && bun scripts/check-tokens.mjs
```
*Pass condition*: Exits with code 0, reporting 0 violations in 0 files.

### 5.2 Sub-12px Font Verification
Run from workspace root:
```bash
bun -e "
import fs from 'node:fs';
import path from 'node:path';
const files = fs.readdirSync('packages/comms-sdk/src/web-ui').filter(f => f.endsWith('.tsx')).map(f => path.join('packages/comms-sdk/src/web-ui', f));
let count = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/text-\[(\d+)px\]/g) || [];
  matches.forEach(m => {
    const px = parseInt(m.match(/\d+/)[0], 10);
    if (px < 12) { console.error('Violation in ' + file + ': ' + m); count++; }
  });
}
if (count === 0) console.log('Zero sub-12px violations in comms-sdk web-ui.');
process.exit(count === 0 ? 0 : 1);
"
```
*Pass condition*: Exits with code 0.

### 5.3 Automated Test Suites Baseline Verification
```bash
# 1. Comms SDK comprehensive test suite
cd packages/comms-sdk && bun test

# 2. Clinic App Challenger M2 & M2.2 test suites
cd apps/clinic-app && bun test tests/challenger_m2_side_sheet_consolidation.test.ts tests/challenger_m2_2_a11y_tokens_visual.test.ts
```
*Pass condition*: 100% of tests pass with 0 failures.

### 5.4 Invalidation Conditions
- Any occurrence of raw hex color (`#[0-9a-fA-F]{3,8}`), raw palette import, or sub-12px font in UI code.
- Any raw emoji character in UI JSX outside of the approved `reactions.ts` constant allowlist.
- Any regression in test pass counts (SDK must remain >= 104 tests, Clinic App must remain >= 44 tests).
