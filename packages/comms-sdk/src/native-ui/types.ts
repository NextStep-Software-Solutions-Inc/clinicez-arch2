import { ViewStyle } from 'react-native';

export type ConversationScopeFilter =
  | 'All'
  | 'PatientFacility'
  | 'StaffContext'
  | 'Facility'
  | 'Direct';

export interface ChatDrawerItem {
  id: string;
  scope: 'Workspace' | 'Facility' | 'Branch' | 'Direct' | 'StaffContext' | 'PatientFacility';
  title: string;
  subtitle?: string;
  lastMessageSnippet?: string;
  lastMessageAtUtc?: string;
  unreadCount: number;
  urgentCount?: number;
  isEmergency?: boolean;
  isActive?: boolean;
  patientId?: string;
  patientNameMasked?: string;
  isOffHours?: boolean;
}

export interface ChatDrawerProps {
  items: ChatDrawerItem[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  selectedScope: ConversationScopeFilter;
  onSelectScope: (scope: ConversationScopeFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  connectionState?: 'Connected' | 'Reconnecting' | 'Disconnected';
  loading?: boolean;
  error?: string | null;
  onNewConversation?: () => void;
  style?: ViewStyle;
}

export interface ThreadAttachment {
  fileKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  previewUrl?: string;
  isClean: boolean;
}

export interface ThreadMessage {
  id: string;
  seq: number;
  conversationId: string;
  senderType: 'Staff' | 'Patient' | 'System' | 'Guest';
  senderId?: string;
  senderDisplayName: string;
  senderRole?: string;
  contentText: string;
  visibility: 'Public' | 'Internal';
  state: 'Sending' | 'Waiting' | 'Received' | 'NotReceived';
  clientSentAtUtc: string;
  serverReceivedAtUtc?: string;
  requiresAcknowledgement?: boolean;
  isAcknowledged?: boolean;
  acknowledgedByName?: string;
  acknowledgedAtUtc?: string;
  attachments?: ThreadAttachment[];
  isResending?: boolean;
}

export interface MessageThreadProps {
  conversationId: string;
  conversationTitle: string;
  conversationScope: string;
  messages: ThreadMessage[];
  currentUserId: string;
  onSendMessage: (text: string, isInternal: boolean, attachments?: ThreadAttachment[]) => Promise<void>;
  onResendMessage: (messageId: string) => Promise<void>;
  onAcknowledgeMessage?: (messageId: string) => Promise<void>;
  privacyBlurEnabled: boolean;
  onTogglePrivacyBlur: () => void;
  canWriteInternalNotes?: boolean;
  isLoading?: boolean;
  error?: string | null;
  hasMoreHistory?: boolean;
  onLoadMoreHistory?: () => void;
  style?: ViewStyle;
}

export interface TriageQueueItem {
  conversationId: string;
  requestId: string;
  patientId: string;
  patientNameMasked: string;
  patientDobMasked?: string;
  patientAgeGender?: string;
  category: string;
  contentText: string;
  priority: 'Emergency' | 'Urgent' | 'Routine';
  status: 'Submitted' | 'WithTriage' | 'Routed';
  submittedAtUtc: string;
  triageDueAtUtc: string;
  isOffHours: boolean;
  slaBreached: boolean;
  isSlaBreached?: boolean;
  slaTimeRemainingSeconds?: number;
  isEmergencyConfirmed: boolean;
  assignedStaffId?: string;
  assignedStaffName?: string;
}

export interface TriageDispositionPayload {
  conversationId: string;
  disposition: 'Answered' | 'NeedsVisit' | 'Declined' | 'Routed';
  replyText?: string;
  declineReasonCode?: 'DUPLICATE' | 'OUT_OF_SCOPE' | 'EMERGENCY_REFERRED' | 'UNREACHABLE' | 'PATIENT_CANCELLED' | 'OTHER';
  declineNotes?: string;
  routedStaffId?: string;
  routedPriority?: 'Routine' | 'Urgent';
}

export interface TriageQueueViewProps {
  items: TriageQueueItem[];
  facilityName: string;
  onExecuteDisposition: (payload: TriageDispositionPayload) => Promise<void>;
  onRefresh: () => void;
  isLoading?: boolean;
  error?: string | null;
  activeFilter?: 'All' | 'Emergency' | 'Urgent' | 'Routine';
  onFilterChange?: (filter: 'All' | 'Emergency' | 'Urgent' | 'Routine') => void;
  style?: ViewStyle;
}

export interface CallWaitingRoomProps {
  callId: string;
  appointmentId?: string;
  userRole: 'Clinician' | 'Patient' | 'Staff';
  patientName: string;
  clinicianName: string;
  scheduledTime: string;
  paymentPolicy: 'Prepaid' | 'Postpaid' | 'Exempt';
  paymentStatus: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';
  isYakapExempt: boolean;
  isReadyToAdmit: boolean;
  recordingConsentStatus: 'Pending' | 'Approved' | 'Rejected' | 'Disabled';
  onAdmitPatient?: () => Promise<void>;
  onEmergencyPaymentOverride?: (reason: string) => Promise<void>;
  onSubmitConsent?: (approved: boolean, reason?: string) => Promise<void>;
  onEnterCall: () => void;
  onCancelCall: () => void;
  isLoading?: boolean;
  error?: string | null;
  style?: ViewStyle;
}
