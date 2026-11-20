export interface VisitDocumentLike {
  id: string;
  isSigned?: boolean;
  consultationId?: string | null;
  queueItemId?: string | null;
}

export interface VisitDocumentMatchIds {
  consultationId?: string | null;
  queueItemId?: string | null;
}

export interface VisitDraftContext extends VisitDocumentMatchIds {
  isEncounterSigned: boolean;
}

export interface DocumentIssuanceOutcome {
  isDraft: boolean;
  toastKind: 'info' | 'success';
  message: string;
  shouldOpenPdf: boolean;
}

export function normalizeActiveQueueItemId(queueItemId?: string | null): string | null {
  if (!queueItemId) return null;
  const trimmed = queueItemId.trim();
  if (!trimmed || trimmed.startsWith('ephemeral-')) return null;
  return trimmed;
}

function normalizePersistedConsultationId(consultationId?: string | null): string | null {
  if (!consultationId) return null;
  const trimmed = consultationId.trim();
  if (!trimmed || trimmed.startsWith('local-draft-')) return null;
  return trimmed;
}

export function matchVisitDocument<T extends Pick<VisitDocumentLike, 'consultationId' | 'queueItemId'>>(
  docs: readonly T[] | null | undefined,
  ids: VisitDocumentMatchIds,
): T | undefined {
  if (!docs || docs.length === 0) return undefined;

  const consultationId = normalizePersistedConsultationId(ids.consultationId);
  const queueItemId = normalizeActiveQueueItemId(ids.queueItemId);
  if (!consultationId && !queueItemId) return undefined;

  if (consultationId) {
    const byConsultation = docs.find((d) => d.consultationId === consultationId);
    if (byConsultation) return byConsultation;
  }

  if (queueItemId) {
    return docs.find((d) => d.queueItemId === queueItemId);
  }

  return undefined;
}

export function belongsToActiveUnsignedVisit(
  doc: Pick<VisitDocumentLike, 'isSigned' | 'consultationId' | 'queueItemId'>,
  ctx: VisitDraftContext,
): boolean {
  if (doc.isSigned === false) {
    return true;
  }
  if (ctx.isEncounterSigned) {
    return false;
  }
  const consultationId = normalizePersistedConsultationId(ctx.consultationId);
  const queueItemId = normalizeActiveQueueItemId(ctx.queueItemId);
  return Boolean(
    (consultationId && doc.consultationId === consultationId) ||
      (queueItemId && doc.queueItemId === queueItemId),
  );
}

export function getDocumentIssuanceOutcome(
  kind: 'medical-certificate' | 'referral-letter',
  record: { isSigned?: boolean },
  docNumber?: string | null,
): DocumentIssuanceOutcome {
  const isDraft = record.isSigned === false;
  const numberLabel = docNumber || '';

  if (isDraft) {
    return {
      isDraft: true,
      toastKind: 'info',
      message:
        kind === 'medical-certificate'
          ? `Medical certificate saved as draft (${numberLabel}). Pending encounter sign-off.`
          : `Referral letter saved as draft (${numberLabel}). Pending encounter sign-off.`,
      shouldOpenPdf: false,
    };
  }

  return {
    isDraft: false,
    toastKind: 'success',
    message:
      kind === 'medical-certificate'
        ? `Medical certificate issued successfully (${numberLabel})`
        : `Referral letter issued successfully (${numberLabel})`,
    shouldOpenPdf: true,
  };
}
