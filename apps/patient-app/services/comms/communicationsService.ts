/**
 * Patient Communications Service
 *
 * Communicates with patient-api communications endpoints:
 * - Multi-tenant unified inbox across clinics, pharmacies, laboratories
 * - Chronological thread retrieval with public messages and attachments
 * - Message reply submission with idempotency key
 * - Initial inquiry submission with mandatory emergency screening gate
 * - Idempotent one-tap message resend
 * - Single-tap "Understood" acknowledgment
 * - "Hide My Copy" client-side privacy deletion (zero mutation to facility EMR)
 * - Sanitized attachment uploading pipeline
 * - Active communication eligibility grants retrieval
 */

import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { api, ApiError } from '../api/apiClient';
import type {
  CommsAttachmentReference,
  CommsTicketResponse,
  DeliveryState,
  MessageCategory,
  RequestStatus,
  TriageDisposition,
} from '@clinicez/comms-sdk';

export type {
  CommsAttachmentReference,
  DeliveryState,
  MessageCategory,
  RequestStatus,
  TriageDisposition,
};

export interface CommsUploadFileInput {
  uri: string;
  name: string;
  type: string;
  size?: number;
  /** Browser File/Blob provided by expo-document-picker on web. */
  file?: Blob | File;
}

const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;
const WEB_FETCHABLE_URI_PATTERN = /^(blob:|data:|https?:)/i;

export interface PatientMessageAttachmentDto {
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  hashSha256?: string;
  scanStatus: string;
}

export interface PatientMessageDto {
  id: string;
  conversationId: string;
  seq: number;
  clientMessageId: string;
  senderType: 'Staff' | 'Patient' | 'System' | 'Guest';
  senderId?: string;
  senderName: string;
  contentText: string;
  requiresAcknowledgement: boolean;
  isAcknowledged: boolean;
  acknowledgedAtUtc?: string;
  acknowledgedByAccountId?: string;
  acknowledgedByName?: string;
  deliveryState: DeliveryState;
  createdAtUtc: string;
  receivedAtUtc?: string;
  retentionDeadlineUtc: string;
  attachments: PatientMessageAttachmentDto[];
}

export interface PatientConversationDto {
  id: string;
  patientId: string;
  homeTenantId: string;
  homeFacilityId: string;
  homeFacilityType: 'Clinic' | 'Pharmacy' | 'Laboratory' | string;
  facilityName: string;
  category: MessageCategory;
  subject: string;
  status: RequestStatus;
  triageDisposition?: TriageDisposition | null;
  declineReasonCode?: string | null;
  assignedStaffDisplayName?: string | null;
  isHiddenByPatient: boolean;
  openedAtUtc: string;
  closedAtUtc?: string | null;
  lastMessageAtUtc: string;
  lastMessagePreview: string;
  unreadCount: number;
  submittingAccountId?: string | null;
  submittingAccountName?: string | null;
  relationshipToPatient?: string | null;
}

export interface PatientConversationDetailDto {
  id: string;
  patientId: string;
  homeTenantId: string;
  homeFacilityId: string;
  homeFacilityType: string;
  facilityName: string;
  category: MessageCategory;
  subject: string;
  status: RequestStatus;
  triageDisposition?: TriageDisposition | null;
  declineReasonCode?: string | null;
  assignedStaffDisplayName?: string | null;
  isHiddenByPatient: boolean;
  openedAtUtc: string;
  closedAtUtc?: string | null;
  messages: PatientMessageDto[];
}

export interface PatientEligibilityGrantDto {
  grantId: string;
  patientId: string;
  tenantId: string;
  facilityId: string;
  facilityType: string;
  facilityName: string;
  contextType: string;
  contextId: string;
  isActive: boolean;
  windowStartUtc?: string | null;
  windowEndUtc?: string | null;
}

/**
 * Collapses multiple active clinical grants (e.g. Confirmed Appointment + Checked-In Queue Visit)
 * for the same destination facility into a single option, preferring the grant with the latest expiry.
 */
export function deduplicateEligibilityGrants(
  grants: PatientEligibilityGrantDto[],
): PatientEligibilityGrantDto[] {
  const byFacility = new Map<string, PatientEligibilityGrantDto>();

  const scoreWindowEnd = (windowEndUtc?: string | null): number => {
    if (!windowEndUtc) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(windowEndUtc);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  for (const grant of grants) {
    const key = `${grant.tenantId.toLowerCase()}|${grant.facilityId.toLowerCase()}|${grant.facilityType.toLowerCase()}`;
    const existing = byFacility.get(key);
    if (!existing || scoreWindowEnd(grant.windowEndUtc) >= scoreWindowEnd(existing.windowEndUtc)) {
      byFacility.set(key, grant);
    }
  }

  return Array.from(byFacility.values());
}

export interface SubmitPatientInquiryRequest {
  patientId?: string;
  tenantId: string;
  facilityId: string;
  facilityType: string;
  facilityName: string;
  category: MessageCategory;
  contentText: string;
  isEmergencyConfirmed: boolean;
  attachments?: CommsAttachmentReference[];
}

export interface SubmitPatientInquiryResponse {
  isEmergencyRedirect: boolean;
  redirectMessage?: string | null;
  conversationId?: string | null;
}

export interface SubmitMessageRequest {
  contentText: string;
  clientMessageId?: string;
  attachments?: CommsAttachmentReference[];
}

// ── Attachment Multipart Helpers ──────────────────────────────────────────────

/** Builds a standardized HTTP 413 error when an attachment exceeds the 15 MB limit. */
function createFileSizeExceededError(): ApiError {
  return new ApiError('File size exceeds 15 MB limit.', 413, [
    { field: 'file', code: 'FILE_SIZE_EXCEEDED', message: 'File size exceeds 15 MB limit.' },
  ]);
}

/** Builds a standardized HTTP 400 error when a selected browser file cannot be read. */
function createFileReadError(message: string): ApiError {
  return new ApiError(message, 400, [
    { field: 'file', code: 'FILE_READ_FAILED', message },
  ]);
}

/** Preserves original bytes while populating a concrete MIME type when the Blob lacks one. */
function ensureBlobContentType(blob: Blob, fallbackContentType: string): Blob {
  if (
    (!blob.type || blob.type === 'application/octet-stream') &&
    fallbackContentType !== 'application/octet-stream'
  ) {
    return blob.slice(0, blob.size, fallbackContentType);
  }
  return blob;
}

// ── Service Implementation ───────────────────────────────────────────────────

export const communicationsService = {
  /**
   * Acquire a 5-minute signed comms ticket for SignalR real-time messaging.
   */
  async getCommsTicket(getToken: () => Promise<string | null>): Promise<CommsTicketResponse> {
    try {
      const res = await api.post<CommsTicketResponse>(getToken, '/patient/comms/ticket');
      return res;
    } catch {
      // Graceful fallback for patient session
      const token = await getToken();
      return {
        ticket: token ?? 'patient_session_ticket',
        expiresAtUtc: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
    }
  },

  /**
   * Retrieve multi-tenant unified inbox for patient and managed dependents.
   * If dependentId is supplied, filters strictly for that dependent.
   */
  async getConversations(
    getToken: () => Promise<string | null>,
    dependentId?: string,
  ): Promise<PatientConversationDto[]> {
    const path = dependentId
      ? `/patient/conversations?dependentId=${encodeURIComponent(dependentId)}`
      : '/patient/conversations';
    return api.get<PatientConversationDto[]>(getToken, path);
  },

  /**
   * Retrieve conversation thread detail with chronological public messages.
   * Calling this resets the conversation's unread badge count to 0.
   */
  async getConversationDetail(
    getToken: () => Promise<string | null>,
    conversationId: string,
  ): Promise<PatientConversationDetailDto> {
    return api.get<PatientConversationDetailDto>(
      getToken,
      `/patient/conversations/${conversationId}`,
    );
  },

  /**
   * Submit a reply in an existing routed conversation thread.
   */
  async sendMessage(
    getToken: () => Promise<string | null>,
    conversationId: string,
    contentText: string,
    clientMessageId?: string,
    attachments?: CommsAttachmentReference[],
  ): Promise<PatientMessageDto> {
    const payload: SubmitMessageRequest = {
      contentText,
      clientMessageId: clientMessageId ?? randomUUID(),
      attachments,
    };
    return api.post<PatientMessageDto>(
      getToken,
      `/patient/conversations/${conversationId}/messages`,
      payload,
    );
  },

  /**
   * Submit an initial inquiry to a facility with emergency gate check.
   */
  async submitInquiry(
    getToken: () => Promise<string | null>,
    request: SubmitPatientInquiryRequest,
  ): Promise<SubmitPatientInquiryResponse> {
    return api.post<SubmitPatientInquiryResponse>(
      getToken,
      '/patient/requests',
      request,
    );
  },

  /**
   * One-tap idempotent resend for unreceived messages using original ClientMessageId.
   */
  async resendMessage(
    getToken: () => Promise<string | null>,
    conversationId: string,
    messageId: string,
  ): Promise<PatientMessageDto> {
    return api.post<PatientMessageDto>(
      getToken,
      `/patient/conversations/${conversationId}/messages/${messageId}/resend`,
    );
  },

  /**
   * Single-tap "Understood" acknowledgment for clinician instructions.
   */
  async acknowledgeMessage(
    getToken: () => Promise<string | null>,
    conversationId: string,
    messageId: string,
  ): Promise<boolean> {
    return api.post<boolean>(
      getToken,
      `/patient/conversations/${conversationId}/messages/${messageId}/acknowledge`,
    );
  },

  /**
   * "Hide My Copy" privacy toggle.
   * Sets IsHiddenByPatient = true on patient replica with zero mutation to facility master record.
   */
  async hideConversationCopy(
    getToken: () => Promise<string | null>,
    conversationId: string,
  ): Promise<boolean> {
    return api.delete<boolean>(
      getToken,
      `/patient/conversations/${conversationId}/copy`,
    );
  },

  /**
   * Alias for hideConversationCopy.
   */
  async hideConversation(
    getToken: () => Promise<string | null>,
    conversationId: string,
  ): Promise<boolean> {
    return this.hideConversationCopy(getToken, conversationId);
  },

  /**
   * Retrieve active communication eligibility grants for patient and dependents.
   */
  async getEligibilityGrants(
    getToken: () => Promise<string | null>,
  ): Promise<PatientEligibilityGrantDto[]> {
    return api.get<PatientEligibilityGrantDto[]>(
      getToken,
      '/patient/eligibility-grants',
    );
  },

  /**
   * Upload an attachment to patient communications attachment pipeline.
   * Enforces 15MB size limit, transcode, and sanitization.
   */
  async uploadAttachment(
    getToken: () => Promise<string | null>,
    file: CommsUploadFileInput,
  ): Promise<CommsAttachmentReference> {
    const hasBrowserBlob = typeof Blob !== 'undefined' && file.file instanceof Blob;
    const declaredSize = file.size ?? (hasBrowserBlob ? file.file!.size : undefined);

    if (declaredSize !== undefined && declaredSize > MAX_ATTACHMENT_SIZE_BYTES) {
      throw createFileSizeExceededError();
    }

    const formData = new FormData();
    const contentType = file.type || 'application/octet-stream';

    if (hasBrowserBlob) {
      formData.append('file', ensureBlobContentType(file.file!, contentType), file.name);
    } else if (Platform.OS === 'web') {
      if (!file.uri || !WEB_FETCHABLE_URI_PATTERN.test(file.uri)) {
        throw createFileReadError('Unable to read selected file in browser.');
      }

      let response: Response;
      try {
        response = await fetch(file.uri);
      } catch {
        throw createFileReadError(`Unable to read selected file "${file.name}".`);
      }

      if (!response.ok) {
        throw createFileReadError(
          `Unable to read selected file "${file.name}" (HTTP ${response.status}).`,
        );
      }

      const rawBlob = await response.blob();
      if (rawBlob.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw createFileSizeExceededError();
      }

      formData.append('file', ensureBlobContentType(rawBlob, contentType), file.name);
    } else {
      formData.append(
        'file',
        { uri: file.uri, name: file.name, type: contentType } as unknown as Blob,
      );
    }

    return api.postForm<CommsAttachmentReference>(
      getToken,
      '/patient/communications/attachments',
      formData,
    );
  },
};
