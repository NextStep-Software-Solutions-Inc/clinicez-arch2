import type { ThreadAttachment, ThreadMessage } from '@clinicez/comms-sdk/native-ui';
import type { PatientMessageDto } from './communicationsService';

const GENERIC_STAFF_NAMES = new Set([
  'staff',
  'staff member',
  'clinic staff',
  'attending clinician',
  'facility',
  'clinician',
]);

export function resolvePatientThreadSenderName(
  msg: Pick<PatientMessageDto, 'senderType' | 'senderName'>,
  facilityName?: string | null,
  patientNames: Array<string | null | undefined> = [],
): string {
  const isPatientSide = msg.senderType === 'Patient' || (msg.senderType as string) === 'Guardian';
  if (isPatientSide) {
    return msg.senderName?.trim() || 'Me';
  }

  const trimmed = msg.senderName?.trim() ?? '';
  const fallbackFacility = facilityName?.trim() || 'Clinic';

  if (!trimmed || GENERIC_STAFF_NAMES.has(trimmed.toLowerCase())) {
    return fallbackFacility;
  }

  const normalizedPatientNames = new Set(
    patientNames.map((n) => n?.trim().toLowerCase()).filter((n): n is string => Boolean(n)),
  );
  if (normalizedPatientNames.has(trimmed.toLowerCase())) {
    return fallbackFacility;
  }

  return trimmed;
}

export function sortThreadMessages(list: ThreadMessage[]): ThreadMessage[] {
  return [...list].sort((a, b) => {
    const timeA = Date.parse(a.clientSentAtUtc);
    const timeB = Date.parse(b.clientSentAtUtc);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    if (a.seq !== b.seq) {
      return a.seq - b.seq;
    }
    return a.id.localeCompare(b.id);
  });
}

export function mapPatientMessageToThreadMessage(
  msg: PatientMessageDto,
  facilityName?: string | null,
  patientNames: Array<string | null | undefined> = [],
): ThreadMessage {
  const state: 'Sending' | 'Waiting' | 'Received' | 'NotReceived' =
    msg.deliveryState === 'Sending'
      ? 'Sending'
      : msg.deliveryState === 'Waiting'
        ? 'Waiting'
        : msg.deliveryState === 'Received'
          ? 'Received'
          : 'NotReceived';

  const attachments: ThreadAttachment[] = (msg.attachments ?? []).map((att) => ({
    attachmentId: att.id,
    fileKey: att.storageKey,
    fileName: att.fileName,
    contentType: att.contentType,
    sizeBytes: att.fileSizeBytes,
    isClean: att.scanStatus === 'Clean',
  }));

  return {
    id: msg.id,
    seq: msg.seq,
    conversationId: msg.conversationId,
    senderType: msg.senderType,
    senderId: msg.senderId ?? undefined,
    senderDisplayName: resolvePatientThreadSenderName(msg, facilityName, patientNames),
    contentText: msg.contentText,
    visibility: 'Public',
    state,
    clientSentAtUtc: msg.createdAtUtc,
    serverReceivedAtUtc: msg.receivedAtUtc,
    requiresAcknowledgement: msg.requiresAcknowledgement,
    isAcknowledged: msg.isAcknowledged,
    acknowledgedByName: msg.acknowledgedByName,
    acknowledgedAtUtc: msg.acknowledgedAtUtc,
    attachments,
  };
}
