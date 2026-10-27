export type ConversationScope =
  | 'Workspace'
  | 'Facility'
  | 'Branch'
  | 'Direct'
  | 'StaffContext'
  | 'PatientFacility';

export type ConversationKind =
  | 'General'
  | 'RecordLinked'
  | 'Direct'
  | 'PatientTriage';

export type MessageCategory =
  | 'Scheduling'
  | 'PrescriptionRefill'
  | 'LabResultQuestion'
  | 'PostVisitFollowUp'
  | 'Billing'
  | 'OrderStatus'
  | 'MedicineQuestion'
  | 'CollectionAndAppointment'
  | 'ReportCopy'
  | 'Other';

export type TriageDisposition =
  | 'Answered'
  | 'NeedsVisit'
  | 'Declined'
  | 'Routed';

export type RequestStatus =
  | 'Submitted'
  | 'WithTriage'
  | 'Routed'
  | 'Answered'
  | 'NeedsVisit'
  | 'Declined'
  | 'Resolved'
  | 'Closed';

export type MessageVisibility = 'Public' | 'Internal';

export type DeliveryState = 'Sending' | 'Waiting' | 'Received' | 'NotReceived';

export type ConnectionState = 'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting';

export interface CommsAttachmentReference {
  fileKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  hashSha256?: string;
}

export interface CommsAttachmentDto {
  attachmentId: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  status: 'Clean' | 'Quarantined' | 'Processing';
  quarantineReason?: string | null;
  strippedExif: boolean;
}

export interface MessageDto {
  messageId: string;
  conversationId: string;
  seq: number;
  clientMessageId: string | null;
  senderType: string;
  senderId: string | null;
  senderDisplayName: string;
  contentText: string;
  visibility: MessageVisibility;
  requiresAcknowledgement: boolean;
  isAcknowledged: boolean;
  acknowledgedAtUtc: string | null;
  acknowledgedByAccountId: string | null;
  acknowledgedByName: string | null;
  attachments: CommsAttachmentReference[];
  deliveryState: DeliveryState;
  sentAtUtc: string;
  retentionDeadlineUtc?: string;
}

export interface ParticipantDto {
  id: string;
  userId: string;
  displayName: string;
  role: string;
  joinedAtUtc: string;
}

export interface ConversationDto {
  id: string;
  tenantId: string;
  facilityId: string;
  branchId?: string | null;
  scope: ConversationScope;
  kind: ConversationKind;
  title: string;
  contextType?: string | null;
  contextId?: string | null;
  category?: MessageCategory | null;
  status: RequestStatus;
  triageDisposition?: TriageDisposition | null;
  declineReasonCode?: string | null;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  priority?: string | null;
  isEmergencyConfirmed: boolean;
  isLocalOnly: boolean;
  reopenCount: number;
  homeCellId?: string;
  lastMessageAtUtc?: string | null;
  lastMessageSnippet?: string | null;
  messageCount: number;
  lastSeq: number;
  createdAtUtc: string;
  createdBy: string;
  closedAtUtc?: string | null;
  closedBy?: string | null;
  participants: ParticipantDto[];
  patientId?: string | null;
  submittingAccountId?: string | null;
  relationship?: string | null;
  grantId?: string | null;
  grantWindowEndUtc?: string | null;
  isOffHoursSubmission?: boolean;
  triageDueAtUtc?: string | null;
  triagedAtUtc?: string | null;
  triagedByStaffId?: string | null;
  triagedByStaffName?: string | null;
  idleDeadlineUtc?: string | null;
  slaBreached?: boolean;
  supervisorAlertedAtUtc?: string | null;
}

export interface SendMessageRequest {
  conversationId: string;
  clientMessageId: string;
  contentText: string;
  visibility: MessageVisibility;
  requiresAcknowledgement: boolean;
  attachments?: CommsAttachmentReference[] | null;
}

export interface CommsTicketClaims {
  sub: string;
  name: string;
  tenant_id: string;
  facility_id: string;
  branch_id?: string;
  permissions: string[];
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
}

export interface MessageStateChangedPayload {
  messageId: string;
  conversationId: string;
  state: DeliveryState;
  timestampUtc: string;
}

export interface ReactionUpdatedPayload {
  messageId: string;
  conversationId: string;
  reaction: string;
  staffId: string;
  staffName?: string | null;
  isAdded: boolean;
  totalCount: number;
}

export interface MessageAcknowledgedPayload {
  messageId: string;
  conversationId: string;
  accountId: string;
  accountName: string;
  acknowledgedAtUtc: string;
}

export interface ParticipantJoinedPayload {
  conversationId: string;
  participantId: string;
  displayName: string;
  role: string;
}

export interface ParticipantLeftPayload {
  conversationId: string;
  participantId: string;
  displayName: string;
}

export interface ThreadStateChangedPayload {
  conversationId: string;
  newStatus: RequestStatus;
  disposition?: TriageDisposition | null;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
}

export interface ICommsClient {
  readonly events: import('./events/CommsEventEmitter').CommsEventEmitter;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): ConnectionState;
  joinConversation(conversationId: string): Promise<void>;
  leaveConversation(conversationId: string): Promise<void>;
  sendMessage(request: SendMessageRequest): Promise<MessageDto>;
  sendReaction(messageId: string, reaction: string): Promise<void>;
  acknowledgeMessage(messageId: string): Promise<void>;
  confirmDelivery(messageId: string): Promise<void>;
  getMessagesAfterSeq(conversationId: string, afterSeq: number): Promise<MessageDto[]>;
}

