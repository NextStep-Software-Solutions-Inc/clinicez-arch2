import {
  ChatDrawerItem,
  ConversationScopeFilter,
  ThreadAttachment,
  ThreadMessage,
  TriageDispositionPayload,
  TriageQueueItem
} from '../native-ui/types';

export type {
  ChatDrawerItem,
  ConversationScopeFilter,
  ThreadAttachment,
  ThreadMessage,
  TriageDispositionPayload,
  TriageQueueItem
};

export interface WebChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ChatDrawerItem[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  selectedScope: ConversationScopeFilter;
  onSelectScope: (scope: ConversationScopeFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewConversation?: () => void;
  connectionState?: 'Connected' | 'Reconnecting' | 'Disconnected';
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export interface WebMessageThreadProps {
  conversationId: string;
  conversationTitle: string;
  conversationScope: string;
  messages: ThreadMessage[];
  currentUserId: string;
  onSendMessage: (text: string, isInternal: boolean, files?: File[]) => Promise<void>;
  onResendMessage: (messageId: string) => Promise<void>;
  onAcknowledgeMessage?: (messageId: string) => Promise<void>;
  onFileToChart?: (messageId: string, fileKey: string) => Promise<void>;
  privacyBlurEnabled: boolean;
  onTogglePrivacyBlur: () => void;
  canWriteInternalNotes?: boolean;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export interface WebTriageQueueViewProps {
  items: TriageQueueItem[];
  facilityName: string;
  onExecuteDisposition: (payload: TriageDispositionPayload) => Promise<void>;
  onRefresh: () => void;
  isLoading?: boolean;
  error?: string | null;
  activeFilter?: 'All' | 'Emergency' | 'Urgent' | 'Routine';
  onFilterChange?: (filter: 'All' | 'Emergency' | 'Urgent' | 'Routine') => void;
  className?: string;
}

export interface WebCallWaitingRoomProps {
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
  className?: string;
}

export interface GuestVerificationResult {
  callId: string;
  roomName: string;
  relayUrl: string;
  guestToken: string;
}

export interface GuestJoinPageProps {
  inviteToken: string;
  apiBaseUrl: string;
  clinicName?: string;
  clinicLogoUrl?: string;
  clinicSupportPhone?: string;
  onSessionEnded?: () => void;
  mockVerificationHandler?: (dob: string, otp: string) => Promise<GuestVerificationResult>;
  className?: string;
}
