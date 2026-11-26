import type { MessageCategory } from './types';
import type { ConversationTitleLike, ParticipantLike } from './conversationTitle';

export type MessageCategoryLabelStyle = 'clinical' | 'patient';

export const CLINICAL_CATEGORY_LABELS: Record<MessageCategory, string> = {
  PostVisitFollowUp: 'Post-Visit Follow-Up',
  PrescriptionRefill: 'Prescription Refill',
  LabResultQuestion: 'Lab Result Question',
  Billing: 'Billing',
  Scheduling: 'Scheduling',
  OrderStatus: 'Order Status',
  MedicineQuestion: 'Medicine Question',
  CollectionAndAppointment: 'Collection & Appointment',
  ReportCopy: 'Report Copy',
  Other: 'General',
};

export const PATIENT_CATEGORY_LABELS: Record<MessageCategory, string> = {
  PostVisitFollowUp: 'Medical / Follow-Up',
  PrescriptionRefill: 'Prescriptions',
  LabResultQuestion: 'Lab Inquiry',
  Billing: 'Billing / HMO',
  Scheduling: 'Scheduling',
  OrderStatus: 'Order Status',
  MedicineQuestion: 'Medicine Question',
  CollectionAndAppointment: 'Collection & Appointment',
  ReportCopy: 'Report Copy',
  Other: 'General',
};

const CANONICAL_CATEGORY_KEYS = Object.keys(CLINICAL_CATEGORY_LABELS) as MessageCategory[];

function resolveCanonicalCategoryKey(category: string): MessageCategory | null {
  const lower = category.trim().toLowerCase();
  return CANONICAL_CATEGORY_KEYS.find((k) => k.toLowerCase() === lower) ?? null;
}

/**
 * Formats a raw MessageCategory enum value (e.g. "PostVisitFollowUp") into a clean,
 * human-readable display label. Splits PascalCase/camelCase boundaries as a fallback.
 */
export function formatMessageCategory(
  category?: string | null,
  style: MessageCategoryLabelStyle = 'clinical',
): string {
  const trimmed = (category || '').trim();
  if (!trimmed) {
    return 'General';
  }

  const canonicalKey = resolveCanonicalCategoryKey(trimmed);
  if (canonicalKey) {
    return style === 'patient'
      ? PATIENT_CATEGORY_LABELS[canonicalKey]
      : CLINICAL_CATEGORY_LABELS[canonicalKey];
  }

  // Already contains spaces, slashes, or hyphens (likely already formatted)
  if (/[\s/-]/.test(trimmed)) {
    return trimmed;
  }

  // Split PascalCase/camelCase identifiers cleanly (e.g. "SomeCustomCategory" -> "Some Custom Category")
  return trimmed.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Returns true if a conversation title matches the legacy raw enum pattern "<MessageCategory> Inquiry"
 * (e.g. "PostVisitFollowUp Inquiry").
 */
export function isLegacyRawCategoryInquiryTitle(title?: string | null): boolean {
  const trimmed = (title || '').trim();
  if (!trimmed) {
    return false;
  }

  const match = /^([A-Za-z]+)\s+Inquiry$/i.exec(trimmed);
  if (!match) {
    return false;
  }

  return resolveCanonicalCategoryKey(match[1]) !== null;
}

/**
 * Returns true when a subject line is empty or merely repeats the category enum/label.
 */
export function isRedundantCategorySubject(
  subject?: string | null,
  category?: string | null,
): boolean {
  const trimmedSubject = (subject || '').trim();
  if (!trimmedSubject) {
    return true;
  }

  const normalizedSubject = trimmedSubject.toLowerCase();
  const trimmedCategory = (category || '').trim();
  if (!trimmedCategory) {
    return false;
  }

  const candidates = new Set<string>([
    trimmedCategory.toLowerCase(),
    formatMessageCategory(trimmedCategory, 'clinical').toLowerCase(),
    formatMessageCategory(trimmedCategory, 'patient').toLowerCase(),
    `${trimmedCategory.toLowerCase()} inquiry`,
    `${formatMessageCategory(trimmedCategory, 'clinical').toLowerCase()} inquiry`,
  ]);

  return candidates.has(normalizedSubject);
}

/**
 * Extracts the patient's full display name from conversation participants when available,
 * ignoring generic "Patient" placeholders and departed participants.
 */
export function resolvePatientParticipantName(
  participants?: ParticipantLike[] | null,
): string | null {
  if (!Array.isArray(participants) || participants.length === 0) {
    return null;
  }

  const match = participants.find((p) => {
    if (p.leftAt || p.leftAtUtc) {
      return false;
    }
    const role = (p.role || '').trim().toLowerCase();
    const type = (p.participantType || '').trim().toLowerCase();
    if (role !== 'patient' && type !== 'patient') {
      return false;
    }
    const name = (p.displayName || p.name || '').trim();
    return name.length > 0 && name.toLowerCase() !== 'patient';
  });

  if (!match) {
    return null;
  }

  return (match.displayName || match.name || '').trim() || null;
}

/**
 * Resolves the primary display title for a PatientFacility inquiry/triage conversation,
 * preferring the patient's full name over legacy raw "<Category> Inquiry" placeholders.
 */
export function resolvePatientFacilityDisplayTitle(
  conversation: ConversationTitleLike & { category?: string | null },
  fallback = 'Patient Inquiry',
): string {
  const rawTitle = (conversation?.title || '').trim();

  if (
    rawTitle &&
    rawTitle.toLowerCase() !== 'conversation' &&
    !isLegacyRawCategoryInquiryTitle(rawTitle)
  ) {
    return rawTitle;
  }

  const participantName = resolvePatientParticipantName(conversation?.participants);
  if (participantName) {
    return participantName;
  }

  if (conversation?.category) {
    return `${formatMessageCategory(conversation.category, 'clinical')} Inquiry`;
  }

  if (rawTitle && isLegacyRawCategoryInquiryTitle(rawTitle)) {
    const prefix = rawTitle.replace(/\s+Inquiry$/i, '').trim();
    return `${formatMessageCategory(prefix, 'clinical')} Inquiry`;
  }

  return fallback;
}
