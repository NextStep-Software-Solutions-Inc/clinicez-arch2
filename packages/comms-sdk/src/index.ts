// Subpath barrel re-exports
export * from './core';

export {
  CommsProvider,
  CommsContext,
  useCommsContext,
  useComms,
  useConversations,
  useConversation,
  useSendMessage,
  useTriageQueue,
  useCallSession,
  OptimisticStore,
  SubscriptionTracker,
  useEventSubscription
} from './react';

export type {
  ConnectionStatus,
  ReactConnectionState,
  CommsTicketResponse,
  ReconnectPolicyOptions,
  CommsClientOptions as ReactCommsClientOptions,
  CommsProviderProps,
  CommsContextValue,
  UseCommsResult,
  ConversationScopeFilter as ReactConversationScopeFilter,
  ConversationsFilterOptions,
  CreateConversationRequest,
  UseConversationsResult,
  UseConversationOptions,
  TypingParticipant,
  UseConversationResult,
  SendMessageInput,
  PendingMessageRecord,
  UseSendMessageResult,
  TriageQueueItem as ReactTriageQueueItem,
  TriageDispositionInput,
  UseTriageQueueOptions,
  UseTriageQueueResult,
  CallSessionStatus,
  TeleconsultPaymentPolicy,
  TeleconsultPaymentStatus,
  TeleconsultPaymentState,
  CallConsentState,
  CallParticipant,
  EmergencyOverrideInput,
  UseCallSessionOptions,
  UseCallSessionResult
} from './react';

export * as NativeUi from './native-ui';
export * as WebUi from './web-ui';
