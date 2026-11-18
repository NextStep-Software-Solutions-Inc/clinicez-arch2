# Project: Production-Ready Clinic Communications Sheet & Triage Desk

## Architecture Overview
Elevate the **Clinic Communications Sheet** (real-time side-drawer and active clinical communications subsystem) across `packages/comms-sdk` and `apps/clinic-app` to production-ready quality:
- **`@clinicez/comms-sdk`**:
  - `useTriageQueue.ts`: Connected to live backend endpoints `GET /api/v1/comms/conversations?scope=PatientFacility&facilityId={facilityId}` and `POST /api/v1/comms/triage/{id}/disposition` using `baseUrl` and auth ticket.
  - `CommsContextValue` in `src/react/types.ts`: Exposes `baseUrl`.
  - `TriageQueueView.tsx`: 3-tier live countdown timer (Green >15m, Amber <15m, Red Response Overdue), 1-click clinical actions (Consult, Need Visit, Route, Decline), and card tap interaction via `onSelectCard`.
  - `MessageThread.tsx`: Delivery confirmation (`Read Confirmation`), private staff note banner (`Private Staff Note (Care Team Only)`), privacy mode, and clean scope titles.
  - Normalization of sub-12px micro-text in `web-ui` components to `text-xs` (12px).
- **`apps/clinic-app`**:
  - `ClinicChatDrawerHost.tsx`: Top header with live connection indicator pill (`• Connected`) + manual reconnect icon button (`🔄`) triggering `reconnect()` from `useComms()` with active rotation animation; card tap navigation to active thread.
  - `ClinicActiveThread.tsx`: Standalone extracted component with icon-only back button (`←`), title + edit pencil icon (`✏️`) for tap-to-rename, 3 right controls (1. Members counter button `👥 <count>`, 2. Medical Privacy Blur icon-only `👁️`, 3. Action Menu `•••` rightmost edge with 7 items), and clinical productivity tools (pinned alerts banner, 4 quick response pills, patient chart shortcut, in-thread search, shift handoff summary).
  - `NewConversationModal.tsx`: Creation modal for Direct Message (with staff directory from `useStaff()`), Care Team (patient context), and Facility Channel with strict validation.
  - Strict compliance with `@clinicez/design-tokens` (0 hex colors, 0 raw palette imports, 0 raw emojis, min 12px text).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Jargon Elimination in SDK | Replace `STAT` with `Emergency`, `SLA Breached` with `Response Overdue`, `Disposition` with `Clinical Decision`/`Action`, `INTERNAL NOTE` with `Private Staff Note (Care Team Only)`, `ACK` with `Read Confirmation`, `Scope` with clean titles | M1 | Survey Explorers 1, 3 |
| F1.2 | Font Size Normalization | Enforce min 12px (`text-xs`) across all UI; fix 15 sub-12px micro-text instances in `comms-sdk/src/web-ui` | M1 | Survey Explorer 3 |
| F1.3 | Design Tokens Guardrails | Strict adherence to `@clinicez/design-tokens`; 0 raw hex colors, 0 raw palette imports, 0 raw emojis in UI JSX | M1, M2 | Survey Explorers 2, 3 |
| F2.1 | Drawer Header Connection & Reconnect | Top drawer header renders live connection indicator pill (`• Connected`) with manual reconnect icon button (`🔄`) beside it triggering `reconnect()` from `useComms()` with active spin animation and resyncs conversations + triage queue | M2 | Survey Explorers 1, 2 |
| F2.2 | Thread Header Back Button | Active thread header back button is icon-only (`←`, `<Icon name="arrowLeft" />`) with `accessibilityLabel="Back to conversations"` | M2 | Survey Explorer 2 |
| F2.3 | Thread Header Center Title & Rename | Thread header center displays conversation title and tap-to-rename pencil icon (`<Icon name="edit" />`) + clean category badge | M2 | Survey Explorer 2 |
| F2.4 | Thread Header Right Controls | Right controls appear in exact order: 1. Members counter button (`👥 <count>`), 2. Medical Privacy Blur icon-only button (`👁️`), 3. Action Menu (`•••`) at rightmost edge | M2 | Survey Explorer 2 |
| F2.5 | Action Menu 7 Lifecycle Items | Houses: Rename, View Patient Chart, Search in Conversation, Shift Handoff Summary, Mute Channel, Close & Archive, and Delete Conversation | M2 | Survey Explorer 2 |
| F3.1 | New Conversation Modal Component | `NewConversationModal.tsx` supports Direct Message (with staff picker from `useStaff()`), Care Team, and Facility Channel | M2 | Survey Explorer 2 |
| F3.2 | Modal Validation & Navigation | Form validation prevents creating conversations with empty titles or unselected staff; navigates immediately to active thread | M2 | Survey Explorer 2 |
| F3.3 | Conversation Lifecycle Operations | Inline and menu rename, member management drawer (add colleague, leave/remove), close & archive (backed by `POST /api/v1/comms/conversations/{id}/close`), and delete conversation guarded for empty/test chats | M2 | Survey Explorer 2 |
| F4.1 | Pinned Clinical Orders & Alerts Banner | Pinned banner renders high-priority clinical orders and alerts at the top of active threads | M2 | Survey Explorer 2 |
| F4.2 | 1-Tap Quick Clinical Response Pills | Speed pills (`+ Vitals Charted`, `+ Bedside Now`, `+ Lab Requested`, `+ On My Way`) above composer | M2 | Survey Explorer 2 |
| F4.3 | 1-Click Link to Patient Chart | "View Patient Chart" shortcut opens patient medical records when patient context is linked | M2 | Survey Explorer 2 |
| F4.4 | In-Thread Search Bar | In-thread search bar filters and highlights conversation content | M2 | Survey Explorer 2 |
| F4.5 | Shift Handoff Summary Action | Shift handoff summary action generates concise summary of active patients and open instructions | M2 | Survey Explorer 2 |
| F5.1 | CommsContext BaseUrl Exposure | Expose `baseUrl` in `CommsContextValue` in `@clinicez/comms-sdk` for REST hook consumers | M1 | Survey Explorer 1 |
| F5.2 | Live Triage Ingestion Endpoint | `useTriageQueue.ts` fetches from `GET /api/v1/comms/conversations?scope=PatientFacility&facilityId={facilityId}` using auth ticket | M1 | Survey Explorer 1 |
| F5.3 | Live Triage Submission Endpoint | `useTriageQueue.ts` submits dispositions to `POST /api/v1/comms/triage/{id}/disposition` | M1 | Survey Explorer 1 |
| F5.4 | 3-Tier Live Response Countdown Timers | Live response countdown timers with color coding: Green (>15m), Amber (<15m), Red (Response Overdue) | M1 | Survey Explorer 1 |
| F5.5 | 1-Click Clinical Actions | 1-click clinical actions (Consult, Need Visit, Route, Decline) execute their respective dispositions | M1 | Survey Explorer 1 |
| F5.6 | Card-to-Thread Navigation | Tapping a triage card opens the active thread displaying patient inquiry details and attachments via `onSelectCard` callback | M1, M2 | Survey Explorers 1, 2 |
| F6.1 | Comms SDK Unit & Adversarial Tests | Update assertions in `empirical_state_machine_sla.test.ts` and `triage-queue-states.adversarial.test.ts` to pass 100% with `Emergency` and `Response Overdue` | M1 | Survey Explorers 1, 3 |
| F6.2 | Comprehensive E2E Test Suite | Authored across Tiers 1-4 verifying all requirements, producing `TEST_READY.md` | M3 | Testing Track |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | `@clinicez/comms-sdk` Core UI, Live Triage Subsystem & Language Normalization | F1.1, F1.2, F1.3, F5.1, F5.2, F5.3, F5.4, F5.5, F5.6 (SDK side), F6.1 | none | DONE |
| M2 | `apps/clinic-app` Comms Components, Active Thread, Modals & Navigation | F1.3, F2.1, F2.2, F2.3, F2.4, F2.5, F3.1, F3.2, F3.3, F4.1, F4.2, F4.3, F4.4, F4.5, F5.6 (App side) | M1 contracts | DONE |
| M3 | Comprehensive E2E Testing Suite (Tiers 1-4), Adversarial Review & Forensic Gate | F6.2 (All features R1–R5) | M1, M2 | DONE |

---

## Interface Contracts

### 1. `CommsContextValue` Extension (`packages/comms-sdk/src/react/types.ts`)
```typescript
export interface CommsContextValue {
  client: CommsClient | null;
  status: ConnectionStatus;
  reconnectAttempt: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshTicket: () => Promise<string | null>;
  baseUrl: string; // Expose baseUrl to hooks
}
```

### 2. `TriageQueueViewProps` Extension (`packages/comms-sdk/src/native-ui/types.ts`)
```typescript
export interface TriageQueueViewProps {
  items: TriageQueueItem[];
  facilityName: string;
  onExecuteDisposition: (payload: TriageDispositionPayload) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectCard?: (conversationId: string) => void; // Card-to-thread navigation
  isLoading?: boolean;
  error?: string | null;
  activeFilter?: 'All' | 'Emergency' | 'Urgent' | 'Routine';
  onFilterChange?: (filter: 'All' | 'Emergency' | 'Urgent' | 'Routine') => void;
}
```

### 3. `NewConversationModalProps` Contract (`apps/clinic-app/components/comms/NewConversationModal.tsx`)
```typescript
export interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    scope: 'Direct' | 'StaffContext' | 'Facility';
    title: string;
    participantStaffIds?: string[];
    patientId?: string;
    department?: string;
  }) => Promise<void>;
}
```

### 4. `ClinicActiveThreadProps` Contract (`apps/clinic-app/components/comms/ClinicActiveThread.tsx`)
```typescript
export interface ClinicActiveThreadProps {
  conversationId: string;
  onBack: () => void;
  onOpenPatientChart?: (patientId: string) => void;
}
```

---

## Code Layout
```
packages/comms-sdk/
  src/
    react/
      types.ts
      hooks/useTriageQueue.ts
      hooks/useComms.ts
    native-ui/
      TriageQueueView.tsx
      ChatDrawer.tsx
      MessageThread.tsx
      types.ts
    web-ui/
      TriageQueueView.tsx
      ChatDrawer.tsx
      MessageThread.tsx
  tests/
    empirical_state_machine_sla.test.ts
    adversarial/triage-queue-states.adversarial.test.ts

apps/clinic-app/
  components/comms/
    ClinicChatDrawerHost.tsx
    ClinicActiveThread.tsx
    NewConversationModal.tsx
  tests/
    challenger_m2_side_sheet_consolidation.test.ts
    challenger_m2_2_a11y_tokens_visual.test.ts
    e2e/clinicCommunicationsProduction.test.ts
```
