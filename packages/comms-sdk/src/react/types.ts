import React from 'react';
import {
  ConversationDto,
  ConversationScope,
  DeliveryState,
  ICommsClient,
  MessageCategory,
  MessageDto,
  MessageVisibility,
  ParticipantDto,
  RequestStatus,
  TriageDisposition,
  CommsAttachmentReference
} from '../core/types';

export type ConnectionStatus =
  | 'disconnected'
  | 'acquiring_ticket'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface ReactConnectionState {
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  error: Error | null;
}

export interface CommsTicketResponse {
  ticket: string;        // Base64url signed ticket token
  expiresAtUtc: string;  // ISO 8601 string, e.g. "2026-10-26T16:15:00Z"
}

export interface ReconnectPolicyOptions {
  initialDelayMs?: number;    // default 1000ms
  maxDelayMs?: number;        // default 30000ms
  backoffMultiplier?: number; // default 1.5
  maxAttempts?: number;       // default 10
  jitterRangeMs?: number;     // default 500ms
}

export interface CommsClientOptions {
  autoConnect?: boolean; // default true
  reconnectPolicy?: ReconnectPolicyOptions;
  ticketRenewalMarginMs?: number; // default 45000ms (renew 45s before 5-min expiry)
  enableTypingIndicators?: boolean; // default true
  logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
}

export interface CommsProviderProps {
  baseUrl: string;
  getCommsTicket: () => Promise<CommsTicketResponse>;
  tenantId: string;
  facilityId: string;
  branchId?: string;
  staffId: string;
  staffDisplayName: string;
  options?: CommsClientOptions;
  client?: ICommsClient;
  children: React.ReactNode;
}

export interface CommsContextValue {
  client: ICommsClient;
  connectionState: ReactConnectionState;
  activeTicket: CommsTicketResponse | null;
  tenantId: string;
  facilityId: string;
  branchId?: string;
  staffId: string;
  staffDisplayName: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshTicket: () => Promise<CommsTicketResponse>;
}

// 1. useComms
export interface UseCommsResult {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastConnectedAt: Date | null;
  activeTicket: CommsTicketResponse | null;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshTicket: () => Promise<CommsTicketResponse>;
  client: ICommsClient;
}

// 2. useConversations
export type ConversationScopeFilter =
  | 'All'
  | 'Workspace'
  | 'Facility'
  | 'Branch'
  | 'Direct'
  | 'StaffContext'
  | 'PatientFacility';

export interface ConversationsFilterOptions {
  category?: MessageCategory;
  status?: RequestStatus | RequestStatus[];
  assignedStaffId?: string | 'unassigned' | 'me';
  priority?: 'Routine' | 'Urgent' | 'Critical';
  searchTerm?: string;
  pageSize?: number;
  autoSubscribe?: boolean;
}

export interface CreateConversationRequest {
  scope: ConversationScope;
  title: string;
  contextType?: string;
  contextId?: string;
  category?: MessageCategory;
  isLocalOnly?: boolean;
  participantIds?: string[];
}

export interface UseConversationsResult {
  conversations: ConversationDto[];
  totalCount: number;
  unreadCount: number;
  unreadCountsByScope: Record<ConversationScope, number>;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  page: number;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilter: (newFilter: Partial<ConversationsFilterOptions>) => void;
  createConversation: (request: CreateConversationRequest) => Promise<ConversationDto>;
}

// 3. useConversation
export interface UseConversationOptions {
  fetchBatchSize?: number;
  markAsReadOnMount?: boolean;
  enableTypingIndicators?: boolean;
  typingDebounceMs?: number;
}

export interface TypingParticipant {
  participantId: string;
  displayName: string;
  startedAt: Date;
}

export interface UseConversationResult {
  conversation: ConversationDto | null;
  messages: MessageDto[];
  participants: ParticipantDto[];
  typingParticipants: TypingParticipant[];
  isLoading: boolean;
  isLoadingEarlier: boolean;
  hasEarlierMessages: boolean;
  error: Error | null;
  loadEarlierMessages: () => Promise<void>;
  sendTypingIndicator: (isTyping: boolean) => void;
  markAsRead: () => Promise<void>;
  acknowledgeMessage: (messageId: string) => Promise<boolean>;
  sendReaction: (messageId: string, reaction: string) => Promise<void>;
  confirmDelivery: (messageId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// 4. useSendMessage
export interface SendMessageInput {
  conversationId: string;
  contentText: string;
  visibility?: MessageVisibility;
  requiresAcknowledgement?: boolean;
  attachments?: CommsAttachmentReference[];
  clientMessageId?: string;
}

export interface PendingMessageRecord {
  clientMessageId: string;
  conversationId: string;
  contentText: string;
  visibility: MessageVisibility;
  requiresAcknowledgement: boolean;
  attachments: CommsAttachmentReference[];
  sentAt: Date;
  state: DeliveryState;
  error?: string;
}

export interface UseSendMessageResult {
  sendMessage: (input: SendMessageInput) => Promise<MessageDto>;
  resendMessage: (clientMessageIdOrMessageId: string) => Promise<MessageDto>;
  cancelPendingMessage: (clientMessageId: string) => void;
  isSending: boolean;
  pendingMessages: PendingMessageRecord[];
  lastSentMessage: MessageDto | null;
  error: Error | null;
}

// 5. useTriageQueue
export interface TriageQueueItem extends ConversationDto {
  slaTimeRemainingSeconds: number;
  isSlaBreached: boolean;
  patientFullName: string;
  patientAge: string;
  patientSex: string;
  patientContact: string;
}

export interface TriageDispositionInput {
  disposition: TriageDisposition;
  declineReasonCode?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  priority?: 'Routine' | 'Urgent';
  internalNote?: string;
  publicResponseText?: string;
}

export interface UseTriageQueueOptions {
  pollIntervalMs?: number;
  urgencySort?: 'urgentFirst' | 'oldestFirst' | 'slaBreachFirst';
  filterCategory?: MessageCategory;
}

export interface UseTriageQueueResult {
  items: TriageQueueItem[];
  pendingCount: number;
  urgentCount: number;
  slaBreachedCount: number;
  isLoading: boolean;
  isSubmittingDisposition: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  claimRequest: (conversationId: string) => Promise<void>;
  recordDisposition: (conversationId: string, input: TriageDispositionInput) => Promise<ConversationDto>;
  routeToStaff: (
    conversationId: string,
    staffId: string,
    staffName: string,
    priority: 'Routine' | 'Urgent',
    internalNote?: string
  ) => Promise<ConversationDto>;
  answerRequest: (
    conversationId: string,
    publicResponseText: string,
    internalNote?: string
  ) => Promise<ConversationDto>;
  requestVisit: (
    conversationId: string,
    appointmentReason: string,
    internalNote?: string
  ) => Promise<ConversationDto>;
  declineRequest: (
    conversationId: string,
    reasonCode: string,
    publicExplanation?: string,
    internalNote?: string
  ) => Promise<ConversationDto>;
}

// 6. useCallSession
export type CallSessionStatus =
  | 'idle'
  | 'in_waiting_room'
  | 'admitted'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'denied';

export type TeleconsultPaymentPolicy = 'Prepaid' | 'Postpaid' | 'Exempt';
export type TeleconsultPaymentStatus = 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';

export interface TeleconsultPaymentState {
  policy: TeleconsultPaymentPolicy;
  status: TeleconsultPaymentStatus;
  canAdmit: boolean;
  isYakapExempt: boolean;
  isEmergencyOverride: boolean;
  overrideReason?: string;
}

export interface CallConsentState {
  recordingSessionId: string | null;
  consentRequired: boolean;
  status: 'none' | 'requested' | 'approved' | 'declined' | 'revoked';
  requestedAt: Date | null;
  decidedAt: Date | null;
  rejectionReason?: string;
}

export interface CallParticipant {
  identity: string;
  name: string;
  isDoctor: boolean;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
}

export interface EmergencyOverrideInput {
  reasonCode: string;
  reasonNote: string;
}

export interface UseCallSessionOptions {
  participantIdentity?: string;
  e2eeKey?: string;
  autoJoinWaitingRoom?: boolean;
}

export interface UseCallSessionResult {
  callId: string | null;
  roomName: string | null;
  status: CallSessionStatus;
  isWaitingRoom: boolean;
  isAdmitted: boolean;
  isDoctor: boolean;
  paymentState: TeleconsultPaymentState;
  consentState: CallConsentState;
  isE2eeEnabled: boolean;
  mediaTracks: {
    isCameraEnabled: boolean;
    isMicEnabled: boolean;
    isScreenSharing: boolean;
    toggleCamera: () => Promise<void>;
    toggleMic: () => Promise<void>;
    toggleScreenShare: () => Promise<void>;
    switchCamera: () => Promise<void>;
    selectedCameraId: string | null;
    selectedMicId: string | null;
  };
  participants: CallParticipant[];
  recordingState: {
    isRecording: boolean;
    recordingSessionId: string | null;
    consentStatus: 'none' | 'requested' | 'approved' | 'declined' | 'revoked';
    requestRecordingConsent: () => Promise<void>;
    respondToRecordingConsent: (approved: boolean, reason?: string) => Promise<void>;
    revokeRecordingConsent: (reason?: string) => Promise<void>;
  };
  admitPatient: (emergencyOverride?: EmergencyOverrideInput) => Promise<void>;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
  error: Error | null;
}
