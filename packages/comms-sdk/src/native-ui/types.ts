import { ViewStyle } from 'react-native';
import type { lightColors } from '@clinicez/design-tokens';

export type CommsThemeColors = Partial<Record<keyof typeof lightColors, string>>;

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
  connectionState?: 'Connected' | 'Reconnecting' | 'Connecting' | 'Disconnected';
  loading?: boolean;
  error?: string | null;
  onNewConversation?: () => void;
  renderScopeIcon?: (scope: ChatDrawerItem['scope']) => React.ReactNode;
  renderEmptyState?: () => React.ReactNode;
  renderSearchIcon?: () => React.ReactNode;
  colors?: CommsThemeColors;
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
  showHeader?: boolean;
  renderEmptyState?: () => React.ReactNode;
  renderSendIcon?: () => React.ReactNode;
  canWriteInternalNotes?: boolean;
  isLoading?: boolean;
  error?: string | null;
  hasMoreHistory?: boolean;
  onLoadMoreHistory?: () => void;
  colors?: CommsThemeColors;
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
  onSelectCard?: (conversationId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  activeFilter?: 'All' | 'Emergency' | 'Urgent' | 'Routine';
  onFilterChange?: (filter: 'All' | 'Emergency' | 'Urgent' | 'Routine') => void;
  colors?: CommsThemeColors;
  style?: ViewStyle;
}

export type CommsCallIconName =
  | 'mic'
  | 'micOff'
  | 'video'
  | 'videoOff'
  | 'cameraOff'
  | 'screenShare'
  | 'screenShareOff'
  | 'switchCamera'
  | 'chat'
  | 'recordDot'
  | 'phoneOff'
  | 'shieldCheck'
  | 'lock'
  | 'dock'
  | 'pip'
  | 'rotate'
  | 'share';

export interface CallWaitingRoomProps {
  callId: string;
  appointmentId?: string;
  userRole: 'Clinician' | 'Patient' | 'Staff';
  patientName: string;
  clinicianName: string;
  scheduledTime: string;
  paymentPolicy: 'Prepaid' | 'Postpaid' | 'Exempt';
  paymentStatus: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';
  hasActiveYakapEnlistment?: boolean;
  isYakapExempt?: boolean;
  onChangePaymentPolicy?: (policy: 'Prepaid' | 'Postpaid' | 'Exempt') => Promise<void>;
  onStaffPaymentOverride?: (reasonNote: string) => Promise<void>;
  onEmergencyPaymentOverride?: (reason: string) => Promise<void>;
  isReadyToAdmit: boolean;
  recordingConsentStatus: 'Pending' | 'Approved' | 'Rejected' | 'Disabled';
  onAdmitPatient?: () => Promise<void>;
  onSubmitConsent?: (approved: boolean, reason?: string) => Promise<void>;
  onEnterCall: () => void;
  onCancelCall: () => void;
  isCameraEnabled?: boolean;
  isMicEnabled?: boolean;
  onToggleCamera?: () => void | Promise<void>;
  onToggleMic?: () => void | Promise<void>;
  micLevel?: number;
  renderVideoPreview?: () => React.ReactNode;
  renderIcon?: (name: CommsCallIconName, props?: { color?: string; size?: number }) => React.ReactNode;
  hideHeader?: boolean;
  mediaModeLabel?: string;
  isLoading?: boolean;
  error?: string | null;
  style?: ViewStyle;
  videoOrientation?: 'portrait' | 'landscape';
  onToggleOrientation?: () => void;
  patientLink?: string;
  onSharePatientLink?: () => void | Promise<void>;
}

export interface CallStageParticipant {
  identity: string;
  name: string;
  role?: 'Clinician' | 'Patient' | 'Staff' | 'Guest';
  isCameraActive?: boolean;
  isMicActive?: boolean;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
}

export interface CallStageProps {
  callId: string;
  roomName: string;
  userRole?: 'Clinician' | 'Patient' | 'Staff' | 'Guest';
  participantName: string;
  selfName?: string;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing?: boolean;
  onToggleMic: () => void | Promise<void>;
  onToggleCamera: () => void | Promise<void>;
  onToggleScreenShare?: () => void | Promise<void>;
  onSwitchCamera?: () => void | Promise<void>;
  isRecording?: boolean;
  recordingDurationSeconds?: number;
  onStartRecording?: () => void | Promise<void>;
  canStartRecording?: boolean;
  recordingConsentStatus?: 'none' | 'requested' | 'approved' | 'declined' | 'revoked';
  onApproveConsentPreview?: () => void | Promise<void>;
  onStopRecording?: () => void | Promise<void>;
  canStopRecording?: boolean;
  isChatOpen?: boolean;
  unreadChatCount?: number;
  onToggleChat?: () => void;
  renderChatDrawer?: () => React.ReactNode;
  renderWorkstationAction?: () => React.ReactNode;
  renderCustomVideoSurface?: (trackType: 'remote' | 'local') => React.ReactNode;
  renderIcon?: (name: CommsCallIconName, props?: { color?: string; size?: number }) => React.ReactNode;
  hideHeader?: boolean;
  remoteStatusLabel?: string;
  onEndCall: () => void | Promise<void>;
  isE2eeActive?: boolean;
  networkQuality?: 'excellent' | 'good' | 'poor' | 'reconnecting';
  isLoading?: boolean;
  error?: string | null;
  style?: ViewStyle;
  videoOrientation?: 'portrait' | 'landscape';
  onToggleOrientation?: () => void;
  patientLink?: string;
  onSharePatientLink?: () => void | Promise<void>;
  onDockCall?: () => void | Promise<void>;
  onTogglePip?: () => void | Promise<void>;
  isPipSupported?: boolean;
  isPipActive?: boolean;
}
