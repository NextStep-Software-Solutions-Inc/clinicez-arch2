# ClinicEZ Comms Client SDK (`@clinicez/comms-sdk`) Developer Guide

## 1. Package Architecture & Entry Points

The `@clinicez/comms-sdk` monorepo package provides unified TypeScript contracts, real-time networking, state management, and user interfaces across ClinicEZ applications.

To ensure strict separation between core networking, React state management, and platform-specific UI (React Native Expo vs. Web Next.js/Tailwind), the SDK exposes **four dedicated entry points**:

```
packages/comms-sdk/
├── src/
│   ├── core/         --> Exported as @clinicez/comms-sdk/core
│   │   ├── client/       (CommsClient, SignalRConnectionManager)
│   │   ├── queue/        (DeliveryStateTracker, ClientMessageQueue)
│   │   ├── retry/        (ExponentialBackoffRetryPolicy)
│   │   ├── auth/         (TicketRenewalTimer)
│   │   ├── attachments/  (AttachmentHelper, WebCrypto AES-GCM)
│   │   └── errors.ts     (CommsError, AttachmentValidationError)
│   │
│   ├── react/        --> Exported as @clinicez/comms-sdk/react
│   │   ├── CommsProvider.tsx
│   │   ├── hooks/        (useComms, useConversations, useMessages, useTriageQueue, useCallSession)
│   │   └── internal/     (OptimisticStore, SubscriptionTracker)
│   │
│   ├── native-ui/    --> Exported as @clinicez/comms-sdk/native-ui (Expo / React Native)
│   │   ├── ChatDrawer.tsx
│   │   ├── MessageThread.tsx
│   │   ├── TriageQueueView.tsx
│   │   ├── CallWaitingRoom.tsx
│   │   └── TriageModal.tsx
│   │
│   └── web-ui/       --> Exported as @clinicez/comms-sdk/web-ui (React / Next.js / Tailwind)
│       ├── ChatDrawer.tsx
│       ├── MessageThread.tsx
│       ├── TriageQueueView.tsx
│       ├── CallWaitingRoom.tsx
│       └── GuestJoinPage.tsx
```

---

## 2. Core Sub-Entry: `@clinicez/comms-sdk/core`

The `core` module is entirely framework-agnostic. It runs identically in Node.js, browsers, React Native, and Web Workers.

### 2.1 `CommsClient` & Connection Management
Manages the underlying SignalR WebSocket connection to `/hubs/comms`:
```typescript
import { CommsClient } from '@clinicez/comms-sdk/core';

const client = new CommsClient({
  hubUrl: 'https://comms.clinicez.internal/hubs/comms',
  ticketProvider: async () => {
    const res = await fetch('/api/v1/comms/ticket', { method: 'POST' });
    const { ticket } = await res.json();
    return ticket;
  },
  maxRetryDelayMs: 30000
});

await client.connect();
```

### 2.2 Truthful Delivery State Machine (`DeliveryStateTracker`)
Enforces valid state progressions:
- Permitted Transitions:
  - `Sending` -> `Waiting`
  - `Waiting` -> `Received`
  - `Waiting` -> `NotReceived`
  - `NotReceived` -> `Sending` (resend)
  - `NotReceived` -> `Received` (late acknowledgment)
- Regressive or invalid transitions (e.g. `Sending` -> `Received` without server receipt, or `Received` -> `Sending`) throw `InvalidStateTransitionError`.

### 2.3 Exponential Backoff with Strict Jitter Bounds
`ExponentialBackoffRetryPolicy` computes reconnect and retry delays:
$$\text{delay} = \min(\text{maxDelayMs}, \max(100, \text{baseDelay} \times 2^{\text{attempt}} \pm \text{jitter}))$$
Guarantees delays never exceed `maxDelayMs` (even after applying +25% jitter) and never drop below 100ms.

### 2.4 Ticket Renewal Lifecycle (`TicketRenewalTimer`)
Because staff tickets expire in 5 minutes, `TicketRenewalTimer` schedules background refreshes at 80% of TTL (~4 minutes):
- **Concurrency Safety**: If the timer is stopped while an asynchronous network refresh is in-flight, the timer marks itself disposed and ignores the resolved ticket, preventing memory leaks and state corruption.

---

## 3. React Sub-Entry: `@clinicez/comms-sdk/react`

Provides idiomatic React hooks and context management.

### 3.1 Initializing `CommsProvider`
Wrap workstation or patient applications in `CommsProvider`:
```tsx
import { CommsProvider } from '@clinicez/comms-sdk/react';

export function App() {
  return (
    <CommsProvider
      hubUrl={process.env.NEXT_PUBLIC_COMMS_HUB_URL!}
      getCommsTicket={async () => {
        const res = await api.post('/api/v1/comms/ticket');
        return res.data.ticket;
      }}
    >
      <WorkstationDashboard />
    </CommsProvider>
  );
}
```

### 3.2 Key Hooks Reference
- **`useComms()`**: Exposes `connectionState` (`Disconnected`, `Connecting`, `Connected`, `Reconnecting`), `error`, `connect()`, and `disconnect()`.
- **`useConversations(scope?)`**: Lists active conversations, tracks unread counts, and listens for real-time conversation updates.
- **`useMessages(conversationId)`**: Manages message lists for the active thread:
  ```tsx
  const { messages, sendMessage, acknowledgeMessage, isSending } = useMessages(conversationId);
  ```
- **`useTriageQueue()`**: Powers the front desk and triage workstations:
  ```tsx
  const { items, activeFilter, setFilter, submitDisposition } = useTriageQueue();
  // Items recompute SLA deadlines automatically on a 15-second tick interval
  ```
- **`useCallSession(callId)`**: Manages video teleconsultations, LiveKit tokens, and dual-consent prompts:
  ```tsx
  const { roomToken, isPrepaidBlocked, requestConsent, consentState } = useCallSession(callId);
  ```

### 3.3 The `OptimisticStore`
When a user clicks "Send", `OptimisticStore` immediately appends a synthetic message in `Sending` state tagged with `clientMessageId`. It ensures:
1. Message states update in isolation without mutating unrelated messages in the same conversation.
2. If the user triggers single-tap resend on a failed message, `clientMessageId` is preserved for server deduplication.

---

## 4. Workstation & Native UI: `@clinicez/comms-sdk/native-ui`

Engineered for React Native / Expo workstation and mobile apps (`clinic-app`, `patient-app`, `pharmacy-app`, `laboratory-app`, `cashier-app`).

### 4.1 Design Token Strict Adherence
- Strictly imports typography, spacing, and color palettes from `@clinicez/design-tokens`.
- **Zero Raw Hex Literals**: Hardcoded hex strings like `#0D6963` or `rgba(0,0,0,0.5)` are prohibited. Components use `lightColors.overlay`, `theme.colors.brand.primary`, etc.

### 4.2 Ergonomic Touch Targets (>= 44px)
In compliance with clinical usability standards:
- Buttons, close icons, drawer toggles, and list items enforce `minHeight: theme.sizes.touchTarget` (44px) and `minWidth: theme.sizes.touchTarget` (44px).
- Pressables utilize generous hit slops: `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}`.

---

## 5. Web UI: `@clinicez/comms-sdk/web-ui`

Engineered for Next.js / Tailwind CSS web surfaces (`portal-web`).

### 5.1 Privacy Mode Blur
In busy clinical offices or open reception areas, bystanders can inadvertently view sensitive clinical text on clinician monitors.
- When `privacyBlurEnabled` is active, `MessageThread` applies Tailwind CSS classes `blur-sm select-none` to clinical text and attachment filenames (e.g., `Histopathology_Biopsy_Positive.pdf`).
- Hovering or clicking temporarily unblurs the content for the clinician.

### 5.2 Guest Teleconsultation Join Workflow (`GuestJoinPage`)
Allows patients without a registered patient account or mobile app to join teleconsultations securely:
```tsx
import { GuestJoinPage } from '@clinicez/comms-sdk/web-ui';

export default function GuestJoinRoute() {
  return (
    <GuestJoinPage
      facilityName="Metro Health Clinic"
      onJoinSuccess={(roomToken) => {
        window.location.href = `/teleconsult/room?token=${roomToken}`;
      }}
    />
  );
}
```

#### Verification Flow
1. **6-Digit OTP**: Split into individual auto-advancing input cells.
2. **Date of Birth (DOB) Validation**: Validates exact ISO format `/^\d{4}-\d{2}-\d{2}$/` and calendar limit constraints (valid year, 1-12 month, 1-31 day, and leap year validation via `Date.UTC`).
3. **Lockout Protection**: Enforces a strict 5-attempt ceiling before locking out the guest session for 15 minutes.
