# @clinicez/comms-sdk

ClinicEZ Workspace Communications Platform Client SDK.

## Subpaths
- `@clinicez/comms-sdk/core`: Pure TypeScript SignalR connection manager, proactive ticket renewal, delivery truth state machine, client message queue with deduplication, and attachment pre-flight helpers.
- `@clinicez/comms-sdk/react`: Headless React 19 and React Native hooks (`useComms`, `useConversations`, `useConversation`, `useSendMessage`, `useTriageQueue`, `useCallSession`), room ref-counting, and optimistic message store.
- `@clinicez/comms-sdk/native-ui`: React Native / Expo components (`ChatDrawer`, `MessageThread`, `TriageQueueView`, `CallWaitingRoom`) strictly styled with `@clinicez/design-tokens`.
- `@clinicez/comms-sdk/web-ui`: Next.js / Tailwind workstation components (`ChatDrawer`, `MessageThread`, `TriageQueueView`, `CallWaitingRoom`, `GuestJoinPage`).
