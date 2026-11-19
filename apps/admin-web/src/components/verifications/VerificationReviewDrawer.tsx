import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBan,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconFileText,
  IconHistory,
  IconLoader,
  IconRefresh,
  IconShieldCheck,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  buildVerificationsQueueHref,
  formatScheduleSummary,
  formatVerificationTimestamp,
  getLicenseExpiryDisplay,
  isDistinctTimestamp,
  resolveHumanActorDisplay,
  TONE_BADGE_CLASSES,
  type ScheduleWindowLike,
  type VerificationQueueSearch,
} from "@/lib/verificationStatus";
import {
  canRevokeDirectoryVerification,
  canVerifyDirectory,
  verificationService,
  type ChildPractitionerRequestDetailDto,
  type FieldChangeDto,
  type PrcMatchCandidateDto,
  type ResubmissionDiffDto,
  type ReviewerProfile,
  type VerificationEvidenceBlobResult,
  type VerificationRequestDetailDto,
} from "@/services/verification.service";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
  VerificationKindBadge,
  VerificationStatusBadge,
} from "./VerificationStatusBadge";

export const DEFAULT_VISIBLE_SERVICES = 9;

export function getVisibleServices<T>(
  services: ReadonlyArray<T>,
  showAll: boolean,
): { visibleServices: T[]; hiddenCount: number; hasMore: boolean } {
  const hasMore = services.length > DEFAULT_VISIBLE_SERVICES;
  const visibleServices =
    showAll || !hasMore ? [...services] : services.slice(0, DEFAULT_VISIBLE_SERVICES);
  const hiddenCount = Math.max(0, services.length - DEFAULT_VISIBLE_SERVICES);
  return { visibleServices, hiddenCount, hasMore };
}

export function indexChangedFields(
  diff?: ResubmissionDiffDto | null,
): Map<string, FieldChangeDto> {
  const map = new Map<string, FieldChangeDto>();
  if (!diff?.changedFields) return map;
  for (const change of diff.changedFields) {
    if (change.fieldKey) {
      map.set(change.fieldKey, change);
    }
  }
  return map;
}

export interface VerificationReviewDrawerProps {
  requestId: string | null;
  profile: ReviewerProfile;
  onClose: () => void;
  onActionCompleted: () => void;
  initialDetail?: VerificationRequestDetailDto | null;
  initialShowAllServices?: boolean;
}

export interface VerificationDetailWorkspaceProps {
  requestId: string;
  profile: ReviewerProfile;
  queueSearch?: VerificationQueueSearch;
  initialDetail?: VerificationRequestDetailDto | null;
  onActionCompleted?: () => void;
  initialShowAllServices?: boolean;
}

interface WorkspaceProofTab {
  id: string;
  tabLabel: string;
  cardLabel: string;
  objectKey: string | null | undefined;
  fetchEvidence?: () => Promise<VerificationEvidenceBlobResult>;
  isUpdated?: boolean;
}

function readSnapshotField(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!snapshot) return null;
  const val = snapshot[key];
  if (typeof val === "string" && val.trim()) return val.trim();
  return null;
}

function readSnapshotBoolean(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  if (!snapshot) return null;
  const val = snapshot[key];
  return typeof val === "boolean" ? val : null;
}

function readSnapshotServices(
  snapshot: Record<string, unknown> | null | undefined,
): Array<{ name?: string; category?: string; price?: number }> {
  if (!snapshot || !Array.isArray(snapshot.services)) return [];
  return snapshot.services.filter(
    (s): s is { name?: string; category?: string; price?: number } =>
      typeof s === "object" && s !== null,
  );
}

function readSnapshotAvailabilities(
  snapshot: Record<string, unknown> | null | undefined,
): ScheduleWindowLike[] {
  if (!snapshot || !Array.isArray(snapshot.availabilities)) return [];
  return snapshot.availabilities.filter(
    (a): a is ScheduleWindowLike =>
      typeof a === "object" &&
      a !== null &&
      "startTime" in a &&
      "endTime" in a,
  );
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const maybeAxios = err as { response?: { data?: { message?: string } }; message?: string };
    if (maybeAxios.response?.data?.message) return maybeAxios.response.data.message;
    if (maybeAxios.message) return maybeAxios.message;
  }
  return fallback;
}

function CandidateCard({
  candidate,
  canRevoke,
  suspendingId,
  onSuspend,
}: {
  candidate: PrcMatchCandidateDto;
  canRevoke: boolean;
  suspendingId: string | null;
  onSuspend: (practitionerId: string) => void;
}) {
  const fullName = [candidate.title, candidate.firstName, candidate.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-text truncate">{fullName}</div>
          <div className="text-[11px] text-text-muted">
            {candidate.professionKind} • PRC{" "}
            <span className="font-mono text-text">{candidate.normalizedPrcLicenseNo}</span> •{" "}
            {candidate.primarySpecialty}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VerificationStatusBadge status={candidate.verificationStatus} />
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
              candidate.isCompatibleNameMatch
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            }`}
          >
            {candidate.isCompatibleNameMatch ? "Name Match" : "Name Mismatch"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span>Affiliated clinics: {candidate.affiliatedFacilityCount}</span>
        {candidate.prcExpiryDate ? <span>PRC expiry: {candidate.prcExpiryDate}</span> : null}
        {candidate.verifiedAtUtc ? (
          <span>Verified: {formatVerificationTimestamp(candidate.verifiedAtUtc)}</span>
        ) : null}
      </div>

      {candidate.affiliatedClinics.length > 0 ? (
        <div className="text-[11px] text-text-muted">
          Clinics: {candidate.affiliatedClinics.join(", ")}
        </div>
      ) : null}

      {canRevoke && candidate.verificationStatus === "Verified" ? (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            disabled={suspendingId === candidate.practitionerId}
            onClick={() => onSuspend(candidate.practitionerId)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {suspendingId === candidate.practitionerId ? (
              <IconLoader className="h-3 w-3 animate-spin" />
            ) : (
              <IconBan className="h-3 w-3" />
            )}
            <span>Suspend Practitioner</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FieldUpdatedPill({ change }: { change?: FieldChangeDto }) {
  if (!change) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.warning}`}
      title={
        change.previousValue
          ? `Previous: ${change.previousValue}`
          : "Updated in this resubmission"
      }
    >
      Updated
    </span>
  );
}

function FieldPreviousValueCaption({ change }: { change?: FieldChangeDto }) {
  if (!change) return null;
  return (
    <div className="text-[11px] text-text-muted mt-0.5">
      Previous: {change.previousValue || "—"}
    </div>
  );
}

function ResubmissionDiffSummaryCard({ diff }: { diff: ResubmissionDiffDto }) {
  const hasAnyProofUpdate = diff.ltoProofUpdated || diff.prcProofUpdated;
  return (
    <section
      aria-label={`Changes from Submission #${diff.previousSubmissionNumber}`}
      className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-text">
            {`Changes from Submission #${diff.previousSubmissionNumber}`}
          </span>
          <VerificationStatusBadge status={diff.previousStatus} />
        </div>
        <span className="text-[11px] text-text-muted">
          {`Submitted ${formatVerificationTimestamp(diff.previousSubmittedAtUtc)}`}
        </span>
      </div>

      {diff.previousReason ? (
        <div className="text-[11px] text-text-secondary">
          <span className="font-semibold text-text">Previous reason:</span>{" "}
          {diff.previousReason}
        </div>
      ) : null}

      {hasAnyProofUpdate ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {diff.ltoProofUpdated ? (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${TONE_BADGE_CLASSES.warning}`}
            >
              DOH LTO Proof Updated
            </span>
          ) : null}
          {diff.prcProofUpdated ? (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${TONE_BADGE_CLASSES.warning}`}
            >
              PRC Proof Updated
            </span>
          ) : null}
        </div>
      ) : null}

      {diff.changedFields.length > 0 ? (
        <div className="space-y-1.5 pt-1 border-t border-amber-500/15">
          {diff.changedFields.map((change, idx) => (
            <div
              key={`${change.fieldKey}-${idx}`}
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 text-[11px]"
            >
              <div className="flex items-center gap-1.5 font-semibold text-text">
                <span>{change.label}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${TONE_BADGE_CLASSES.info}`}
                >
                  {change.changeKind}
                </span>
              </div>
              <div className="text-text-secondary">
                <span className="text-text-muted">
                  {change.previousValue ?? "—"}
                </span>{" "}
                <span aria-hidden="true">→</span>{" "}
                <span className="font-medium text-text">
                  {change.currentValue ?? "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : !hasAnyProofUpdate ? (
        <div className="text-[11px] text-text-muted">
          No field differences recorded against the previous submission.
        </div>
      ) : null}
    </section>
  );
}

function ChildPractitionerRow({
  parentRequestId,
  child,
  selectable,
  selected,
  onToggle,
  renderInlineProof = true,
  isProofActive = false,
  onInspectProof,
  isUpdated = false,
  isProofUpdated = false,
}: {
  parentRequestId: string;
  child: ChildPractitionerRequestDetailDto;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  renderInlineProof?: boolean;
  isProofActive?: boolean;
  onInspectProof?: (childId: string) => void;
  isUpdated?: boolean;
  isProofUpdated?: boolean;
}) {
  const fullName = [child.title, child.firstName, child.lastName].filter(Boolean).join(" ");
  const prcExpiryDisplay = getLicenseExpiryDisplay(child.prcExpiryDate);
  const fetchChildEvidence = React.useMemo(
    () =>
      child.prcEvidenceObjectKey
        ? () =>
            verificationService.fetchVerificationEvidence(parentRequestId, {
              kind: "prc",
              childRequestId: child.id,
            })
        : undefined,
    [parentRequestId, child.id, child.prcEvidenceObjectKey],
  );
  return (
    <div
      className={`rounded-xl border p-3 space-y-2 text-xs transition-colors ${
        isProofActive
          ? "border-primary/50 bg-primary-subtle/30"
          : "border-border bg-surface-muted/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggle(child.id, e.target.checked)}
              aria-label={`Include ${fullName} in approval`}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-text">{fullName}</span>
              {isUpdated ? (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.warning}`}
                >
                  Updated
                </span>
              ) : null}
              {isProofUpdated ? (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.info}`}
                >
                  PRC Proof Updated
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5">
              <span>
                {child.professionKind} • PRC{" "}
                <span className="font-mono text-text">{child.normalizedPrcLicenseNo}</span>
                {prcExpiryDisplay ? ` • Exp ${prcExpiryDisplay.dateText}` : ""}
              </span>
              {prcExpiryDisplay?.badgeLabel && prcExpiryDisplay.badgeClassName ? (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border whitespace-nowrap ${prcExpiryDisplay.badgeClassName}`}
                >
                  {prcExpiryDisplay.badgeLabel}
                </span>
              ) : null}
            </div>
            {child.specialty ? (
              <div className="text-[11px] text-text-muted">Specialty: {child.specialty}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VerificationStatusBadge status={child.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
        <span>Schedule: {formatScheduleSummary(child.availabilities)}</span>
        {!renderInlineProof && child.prcEvidenceObjectKey && onInspectProof ? (
          <button
            type="button"
            onClick={() => onInspectProof(child.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
              isProofActive
                ? "bg-primary text-white border-primary"
                : "bg-surface text-text border-border hover:bg-surface-muted"
            }`}
          >
            <IconFileText className="h-3 w-3" />
            <span>{isProofActive ? "Viewing PRC Proof" : "Inspect PRC Proof"}</span>
          </button>
        ) : null}
      </div>

      {child.hasNameMismatch ? <NameMismatchAlert compact /> : null}
      {renderInlineProof && child.prcEvidenceObjectKey ? (
        <ProofEvidenceCard
          label={`PRC Proof (${fullName})`}
          objectKey={child.prcEvidenceObjectKey}
          fetchEvidence={fetchChildEvidence}
          isUpdated={isProofUpdated}
        />
      ) : null}
    </div>
  );
}

function useVerificationDetailController({
  requestId,
  profile,
  initialDetail,
  onActionCompleted,
}: {
  requestId: string | null;
  profile: ReviewerProfile;
  initialDetail?: VerificationRequestDetailDto | null;
  onActionCompleted?: () => void;
}) {
  const [detail, setDetail] = useState<VerificationRequestDetailDto | null>(initialDetail ?? null);
  const [loading, setLoading] = useState(initialDetail === undefined && Boolean(requestId));
  const [error, setError] = useState<string | null>(null);

  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectValidationError, setRejectValidationError] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [approveBundled, setApproveBundled] = useState(true);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(() =>
    (initialDetail?.childPractitionerRequests ?? [])
      .filter((c) => c.status === "PendingReview")
      .map((c) => c.id),
  );

  const [submittingAction, setSubmittingAction] = useState<"approve" | "reject" | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);

  const allowVerify = canVerifyDirectory(profile);
  const allowRevoke = canRevokeDirectoryVerification(profile);

  const loadDetail = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verificationService.getVerificationRequestDetail(requestId);
      setDetail(res);
      const pendingChildren = res.childPractitionerRequests
        .filter((c) => c.status === "PendingReview")
        .map((c) => c.id);
      setSelectedChildIds(pendingChildren);
      setApproveBundled(true);
      setReviewNotes("");
      setRejectReason("");
      setRejectValidationError(null);
      setSuspendReason("");
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Unable to load verification request."));
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (initialDetail !== undefined) return;
    if (requestId) {
      void loadDetail();
    } else {
      setDetail(null);
      setError(null);
    }
  }, [requestId, loadDetail, initialDetail]);

  const fetchLtoEvidence = useMemo(
    () =>
      detail && (detail.ltoEvidenceObjectKey || (detail.kind === "Facility" && detail.evidenceObjectKey))
        ? () => verificationService.fetchVerificationEvidence(detail.id, { kind: "lto" })
        : undefined,
    [detail],
  );

  const fetchPrcEvidence = useMemo(
    () =>
      detail && detail.kind !== "Facility" && (detail.prcEvidenceObjectKey || detail.evidenceObjectKey)
        ? () => verificationService.fetchVerificationEvidence(detail.id, { kind: "prc" })
        : undefined,
    [detail],
  );

  const handleToggleChild = (childId: string, checked: boolean) => {
    setSelectedChildIds((prev) =>
      checked ? (prev.includes(childId) ? prev : [...prev, childId]) : prev.filter((id) => id !== childId),
    );
  };

  const handleApprove = async () => {
    if (!detail || !allowVerify) return;
    setSubmittingAction("approve");
    try {
      const pendingChildren = detail.childPractitionerRequests.filter((c) => c.status === "PendingReview");
      const useSelectedIds =
        detail.kind === "Facility" && approveBundled && pendingChildren.length > 0
          ? selectedChildIds
          : undefined;
      await verificationService.approveVerificationRequest(detail.id, {
        notes: reviewNotes.trim() || undefined,
        approveBundledPractitioners:
          detail.kind === "Facility" ? approveBundled && selectedChildIds.length > 0 : true,
        practitionerRequestIds: useSelectedIds,
      });
      toast.success("Verification request approved and directory updates queued.");
      await loadDetail();
      onActionCompleted?.();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to approve verification request."));
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleReject = async () => {
    if (!detail || !allowVerify) return;
    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      setRejectValidationError("Clinical or compliance rejection reason is required.");
      return;
    }

    setRejectValidationError(null);
    setSubmittingAction("reject");
    try {
      await verificationService.rejectVerificationRequest(detail.id, {
        reason: trimmedReason,
        notes: reviewNotes.trim() || undefined,
      });
      toast.success("Verification request rejected.");
      await loadDetail();
      onActionCompleted?.();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to reject verification request."));
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleSuspendPractitioner = async (practitionerId: string) => {
    if (!allowRevoke) return;
    setSuspendingId(practitionerId);
    try {
      await verificationService.suspendPractitioner(practitionerId, {
        reason: suspendReason.trim() || undefined,
      });
      toast.success("Practitioner verification suspended across affiliated clinics.");
      await loadDetail();
      onActionCompleted?.();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to suspend practitioner."));
    } finally {
      setSuspendingId(null);
    }
  };

  const snapshot = detail?.snapshot;
  const operatingHours = readSnapshotField(snapshot, "operatingHours");
  const classification = readSnapshotField(snapshot, "classification");
  const address = readSnapshotField(snapshot, "address");
  const contactNumber = readSnapshotField(snapshot, "contactNumber");
  const contactEmail = readSnapshotField(snapshot, "contactEmail");
  const specialty = readSnapshotField(snapshot, "specialty");
  const publicBio = readSnapshotField(snapshot, "publicBio");
  const verificationContact = readSnapshotField(snapshot, "verificationContact");
  const isOnlineBookingPaused = readSnapshotBoolean(snapshot, "isOnlineBookingPaused");
  const services = readSnapshotServices(snapshot);
  const availabilities = readSnapshotAvailabilities(snapshot);

  const pendingChildren =
    detail?.childPractitionerRequests.filter((c) => c.status === "PendingReview") ?? [];

  const standalonePractitionerId =
    detail?.kind === "Practitioner"
      ? detail.childPractitionerRequests[0]?.practitionerId ??
        detail.prcMatchCandidates.find((c) => c.verificationStatus === "Verified")?.practitionerId ??
        null
      : null;

  const canApprove = Boolean(detail && detail.status === "PendingReview" && allowVerify);
  const canReject = Boolean(
    detail && (detail.status === "PendingReview" || detail.status === "AwaitingOtp") && allowVerify,
  );

  return {
    detail,
    loading,
    error,
    loadDetail,
    allowVerify,
    allowRevoke,
    canApprove,
    canReject,
    reviewNotes,
    setReviewNotes,
    rejectReason,
    setRejectReason,
    rejectValidationError,
    setRejectValidationError,
    suspendReason,
    setSuspendReason,
    approveBundled,
    setApproveBundled,
    selectedChildIds,
    handleToggleChild,
    submittingAction,
    suspendingId,
    handleApprove,
    handleReject,
    handleSuspendPractitioner,
    fetchLtoEvidence,
    fetchPrcEvidence,
    operatingHours,
    classification,
    address,
    contactNumber,
    contactEmail,
    specialty,
    publicBio,
    verificationContact,
    isOnlineBookingPaused,
    services,
    availabilities,
    pendingChildren,
    standalonePractitionerId,
  };
}

function VerificationDetailMetadataAndActions({
  detail,
  controller,
  inlineProofMode,
  activeProofTabId,
  onInspectChildProof,
  initialShowAllServices = false,
}: {
  detail: VerificationRequestDetailDto;
  controller: ReturnType<typeof useVerificationDetailController>;
  inlineProofMode: "drawer" | "workspace";
  activeProofTabId?: string;
  onInspectChildProof?: (childId: string) => void;
  initialShowAllServices?: boolean;
}) {
  const {
    allowVerify,
    allowRevoke,
    canApprove,
    canReject,
    reviewNotes,
    setReviewNotes,
    rejectReason,
    setRejectReason,
    rejectValidationError,
    setRejectValidationError,
    suspendReason,
    setSuspendReason,
    approveBundled,
    setApproveBundled,
    selectedChildIds,
    handleToggleChild,
    submittingAction,
    suspendingId,
    handleApprove,
    handleReject,
    handleSuspendPractitioner,
    fetchLtoEvidence,
    fetchPrcEvidence,
    operatingHours,
    classification,
    address,
    contactNumber,
    contactEmail,
    specialty,
    publicBio,
    verificationContact,
    isOnlineBookingPaused,
    services,
    availabilities,
    pendingChildren,
    standalonePractitionerId,
  } = controller;

  const [showAllServices, setShowAllServices] = useState(initialShowAllServices);
  useEffect(() => {
    setShowAllServices(initialShowAllServices);
  }, [detail.id, initialShowAllServices]);

  const diff = detail.resubmissionDiff ?? null;
  const changedFieldsMap = useMemo(() => indexChangedFields(diff), [diff]);
  const updatedChildIdSet = useMemo(
    () => new Set(diff?.updatedChildPractitionerIds ?? []),
    [diff],
  );
  const updatedChildProofIdSet = useMemo(
    () => new Set(diff?.updatedChildPrcProofIds ?? []),
    [diff],
  );

  const submittedBy = resolveHumanActorDisplay(
    detail.submittedByDisplayName,
    null,
    detail.submittedByClinicUserId,
    "Clinic Manager",
  );
  const hasDetailReviewer = Boolean(
    detail.reviewedByDisplayName || detail.reviewedByEmail || detail.reviewedByAdminUserId,
  );
  const reviewedBy = resolveHumanActorDisplay(
    detail.reviewedByDisplayName,
    detail.reviewedByEmail,
    detail.reviewedByAdminUserId,
    "Platform Reviewer",
  );
  const showUpdatedAt = isDistinctTimestamp(detail.updatedAtUtc, detail.submittedAtUtc);

  const dohLtoExpiryDate =
    detail.dohLtoExpiryDate ?? readSnapshotField(detail.snapshot, "dohLtoExpiryDate");
  const ltoExpiryDisplay = getLicenseExpiryDisplay(dohLtoExpiryDate);

  const resolvedPhone = detail.clinicContactNumber ?? contactNumber;
  const resolvedEmail = detail.clinicContactEmail ?? contactEmail;

  const philHealthNo =
    detail.philHealthAccreditationNumber ??
    readSnapshotField(detail.snapshot, "philHealthAccreditationNumber");
  const snapshotPhilHealthFlag = readSnapshotBoolean(
    detail.snapshot,
    "isPhilHealthAccredited",
  );
  const isPhilHealthAccredited =
    detail.isPhilHealthAccredited ?? snapshotPhilHealthFlag ?? Boolean(philHealthNo);
  const showPhilHealthSection =
    Boolean(philHealthNo) ||
    isPhilHealthAccredited ||
    changedFieldsMap.has("isPhilHealthAccredited") ||
    changedFieldsMap.has("philHealthAccreditationNumber");

  const resolvedInPerson =
    detail.supportsInPerson ?? readSnapshotBoolean(detail.snapshot, "supportsInPerson");
  const resolvedTeleconsult =
    detail.supportsTeleconsult ??
    readSnapshotBoolean(detail.snapshot, "supportsTeleconsult");
  const showConsultationModes =
    resolvedInPerson !== null && resolvedInPerson !== undefined ||
    resolvedTeleconsult !== null && resolvedTeleconsult !== undefined;

  const primaryPractitioner =
    detail.kind !== "Facility" ? detail.childPractitionerRequests[0] ?? null : null;
  const practitionerName =
    detail.kind !== "Facility"
      ? primaryPractitioner
        ? [
            primaryPractitioner.title,
            primaryPractitioner.firstName,
            primaryPractitioner.lastName,
          ]
            .filter(Boolean)
            .join(" ")
        : [
            readSnapshotField(detail.snapshot, "title"),
            readSnapshotField(detail.snapshot, "firstName"),
            readSnapshotField(detail.snapshot, "lastName"),
          ]
            .filter(Boolean)
            .join(" ") || null
      : null;
  const practitionerProfession =
    detail.kind !== "Facility"
      ? primaryPractitioner?.professionKind ??
        readSnapshotField(detail.snapshot, "professionKind")
      : null;
  const practitionerPrcNo =
    detail.kind !== "Facility"
      ? primaryPractitioner?.normalizedPrcLicenseNo ??
        primaryPractitioner?.submittedPrcLicenseNo ??
        readSnapshotField(detail.snapshot, "submittedPrcLicenseNo")
      : null;
  const practitionerPrcExpiry =
    detail.kind !== "Facility"
      ? primaryPractitioner?.prcExpiryDate ??
        readSnapshotField(detail.snapshot, "prcExpiryDate")
      : null;
  const prcExpiryDisplay = getLicenseExpiryDisplay(practitionerPrcExpiry);

  const { visibleServices, hiddenCount, hasMore: hasMoreServices } = getVisibleServices(
    services,
    showAllServices,
  );
  const servicesChange = changedFieldsMap.get("services");
  const dohLtoNumberChange = changedFieldsMap.get("dohLtoNumber");
  const dohLtoExpiryChange = changedFieldsMap.get("dohLtoExpiryDate");
  const classificationChange = changedFieldsMap.get("classification");
  const operatingHoursChange = changedFieldsMap.get("operatingHours");
  const addressChange = changedFieldsMap.get("address");
  const phoneChange = changedFieldsMap.get("contactNumber");
  const emailChange = changedFieldsMap.get("contactEmail");
  const bookingChange = changedFieldsMap.get("isOnlineBookingPaused");
  const philHealthChange =
    changedFieldsMap.get("philHealthAccreditationNumber") ??
    changedFieldsMap.get("isPhilHealthAccredited");
  const consultationModeChange =
    changedFieldsMap.get("supportsInPerson") ?? changedFieldsMap.get("supportsTeleconsult");
  const specialtyChange = changedFieldsMap.get("specialty");
  const verificationContactChange = changedFieldsMap.get("verificationContact");
  const availabilitiesChange = changedFieldsMap.get("availabilities");
  const publicBioChange = changedFieldsMap.get("publicBio");
  const practitionerNameChange = changedFieldsMap.get("name");
  const practitionerProfessionChange = changedFieldsMap.get("professionKind");
  const practitionerPrcNoChange = changedFieldsMap.get("submittedPrcLicenseNo");
  const practitionerPrcExpiryChange = changedFieldsMap.get("prcExpiryDate");

  return (
    <>
      {detail.hasNameMismatch ? <NameMismatchAlert /> : null}

      {diff ? <ResubmissionDiffSummaryCard diff={diff} /> : null}

      {/* Decision Summary if already reviewed / withdrawn */}
      {detail.reviewedAtUtc || detail.withdrawnAtUtc ? (
        <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-xs space-y-1">
          {detail.reviewedAtUtc ? (
            <div>
              <span className="font-semibold text-text">Reviewed:</span>{" "}
              <span className="text-text-secondary">
                {formatVerificationTimestamp(detail.reviewedAtUtc)}
                {hasDetailReviewer ? (
                  <>
                    {" "}
                    by{" "}
                    <span className="font-medium text-text" title={reviewedBy.tooltip}>
                      {reviewedBy.primary}
                    </span>
                    {reviewedBy.secondary ? (
                      <span className="text-text-muted"> ({reviewedBy.secondary})</span>
                    ) : null}
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
          {detail.reviewerNotes ? (
            <div>
              <span className="font-semibold text-text">Reviewer notes:</span>{" "}
              <span className="text-text-secondary">{detail.reviewerNotes}</span>
            </div>
          ) : null}
          {detail.withdrawnAtUtc ? (
            <div>
              <span className="font-semibold text-text">Withdrawn:</span>{" "}
              <span className="text-text-secondary">
                {formatVerificationTimestamp(detail.withdrawnAtUtc)}
                {detail.withdrawalReason ? ` — ${detail.withdrawalReason}` : ""}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Submitted Snapshot */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Submitted Snapshot</span>
        </div>

        <div className="rounded-xl border border-border bg-background p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[11px] text-text-muted">Submitted At</div>
            <div className="font-medium text-text">
              {formatVerificationTimestamp(detail.submittedAtUtc)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-text-muted">Submitted By</div>
            <div className="font-medium text-text" title={submittedBy.tooltip}>
              {submittedBy.primary}
            </div>
          </div>
          {showUpdatedAt ? (
            <div>
              <div className="text-[11px] text-text-muted">Last Updated</div>
              <div className="font-medium text-text">
                {formatVerificationTimestamp(detail.updatedAtUtc)}
              </div>
            </div>
          ) : null}
          {practitionerName ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Practitioner Name</span>
                <FieldUpdatedPill change={practitionerNameChange} />
              </div>
              <div className="font-medium text-text">{practitionerName}</div>
              <FieldPreviousValueCaption change={practitionerNameChange} />
            </div>
          ) : null}
          {practitionerProfession ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Profession</span>
                <FieldUpdatedPill change={practitionerProfessionChange} />
              </div>
              <div className="font-medium text-text">{practitionerProfession}</div>
              <FieldPreviousValueCaption change={practitionerProfessionChange} />
            </div>
          ) : null}
          {practitionerPrcNo ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>PRC License #</span>
                <FieldUpdatedPill change={practitionerPrcNoChange} />
              </div>
              <div className="font-mono font-semibold text-text">{practitionerPrcNo}</div>
              <FieldPreviousValueCaption change={practitionerPrcNoChange} />
            </div>
          ) : null}
          {prcExpiryDisplay ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>PRC Expiry Date</span>
                <FieldUpdatedPill change={practitionerPrcExpiryChange} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap font-mono font-semibold text-text">
                <span>{prcExpiryDisplay.dateText}</span>
                {prcExpiryDisplay.badgeLabel && prcExpiryDisplay.badgeClassName ? (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold border whitespace-nowrap ${prcExpiryDisplay.badgeClassName}`}
                  >
                    {prcExpiryDisplay.badgeLabel}
                  </span>
                ) : null}
              </div>
              <FieldPreviousValueCaption change={practitionerPrcExpiryChange} />
            </div>
          ) : null}
          {detail.dohLtoNumber ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>DOH LTO #</span>
                <FieldUpdatedPill change={dohLtoNumberChange} />
              </div>
              <div className="font-mono font-semibold text-text">{detail.dohLtoNumber}</div>
              <FieldPreviousValueCaption change={dohLtoNumberChange} />
            </div>
          ) : null}
          {ltoExpiryDisplay ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>DOH LTO Expiry Date</span>
                <FieldUpdatedPill change={dohLtoExpiryChange} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap font-mono font-semibold text-text">
                <span>{ltoExpiryDisplay.dateText}</span>
                {ltoExpiryDisplay.badgeLabel && ltoExpiryDisplay.badgeClassName ? (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold border whitespace-nowrap ${ltoExpiryDisplay.badgeClassName}`}
                  >
                    {ltoExpiryDisplay.badgeLabel}
                  </span>
                ) : null}
              </div>
              <FieldPreviousValueCaption change={dohLtoExpiryChange} />
            </div>
          ) : null}
          {classification ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Classification</span>
                <FieldUpdatedPill change={classificationChange} />
              </div>
              <div className="font-medium text-text">{classification}</div>
              <FieldPreviousValueCaption change={classificationChange} />
            </div>
          ) : null}
          {operatingHours ? (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Operating Hours</span>
                <FieldUpdatedPill change={operatingHoursChange} />
              </div>
              <div className="font-medium text-text">{operatingHours}</div>
              <FieldPreviousValueCaption change={operatingHoursChange} />
            </div>
          ) : null}
          {address ? (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Facility Address</span>
                <FieldUpdatedPill change={addressChange} />
              </div>
              <div className="font-medium text-text">{address}</div>
              <FieldPreviousValueCaption change={addressChange} />
            </div>
          ) : null}
          {resolvedPhone ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Phone</span>
                <FieldUpdatedPill change={phoneChange} />
              </div>
              <div className="font-medium text-text">{resolvedPhone}</div>
              <FieldPreviousValueCaption change={phoneChange} />
            </div>
          ) : null}
          {resolvedEmail ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Email</span>
                <FieldUpdatedPill change={emailChange} />
              </div>
              <div className="font-medium text-text break-all">{resolvedEmail}</div>
              <FieldPreviousValueCaption change={emailChange} />
            </div>
          ) : null}
          {isOnlineBookingPaused !== null ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Online Booking</span>
                <FieldUpdatedPill change={bookingChange} />
              </div>
              <div className="font-medium text-text">
                {isOnlineBookingPaused ? "Booking Paused" : "Accepting Bookings"}
              </div>
              <FieldPreviousValueCaption change={bookingChange} />
            </div>
          ) : null}
          {showPhilHealthSection ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>PhilHealth / YAKAP</span>
                <FieldUpdatedPill change={philHealthChange} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
                    isPhilHealthAccredited
                      ? TONE_BADGE_CLASSES.success
                      : TONE_BADGE_CLASSES.neutral
                  }`}
                >
                  {isPhilHealthAccredited ? "Accredited" : "Not Accredited"}
                </span>
                {philHealthNo ? (
                  <span className="font-mono font-semibold text-text">{philHealthNo}</span>
                ) : null}
              </div>
              <FieldPreviousValueCaption change={philHealthChange} />
            </div>
          ) : null}
          {showConsultationModes ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Consultation Modes</span>
                <FieldUpdatedPill change={consultationModeChange} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {resolvedInPerson ? (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.info}`}
                  >
                    In-Person
                  </span>
                ) : null}
                {resolvedTeleconsult ? (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.info}`}
                  >
                    Teleconsult
                  </span>
                ) : null}
                {!resolvedInPerson && !resolvedTeleconsult ? (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.neutral}`}
                  >
                    None specified
                  </span>
                ) : null}
              </div>
              <FieldPreviousValueCaption change={consultationModeChange} />
            </div>
          ) : null}
          {specialty ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Specialty</span>
                <FieldUpdatedPill change={specialtyChange} />
              </div>
              <div className="font-medium text-text">{specialty}</div>
              <FieldPreviousValueCaption change={specialtyChange} />
            </div>
          ) : null}
          {verificationContact ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Verification Contact</span>
                <FieldUpdatedPill change={verificationContactChange} />
              </div>
              <div className="font-medium text-text">{verificationContact}</div>
              <FieldPreviousValueCaption change={verificationContactChange} />
            </div>
          ) : null}
          {availabilities.length > 0 ? (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Schedule Summary</span>
                <FieldUpdatedPill change={availabilitiesChange} />
              </div>
              <div className="font-medium text-text">
                {formatScheduleSummary(availabilities)}
              </div>
              <FieldPreviousValueCaption change={availabilitiesChange} />
            </div>
          ) : null}
          {publicBio ? (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span>Public Bio</span>
                <FieldUpdatedPill change={publicBioChange} />
              </div>
              <div className="text-text leading-relaxed">{publicBio}</div>
              <FieldPreviousValueCaption change={publicBioChange} />
            </div>
          ) : null}
        </div>

        {services.length > 0 ? (
          <div className="rounded-xl border border-border bg-surface-muted/40 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-semibold text-text">
                <span>{`Declared Clinic Services (${services.length})`}</span>
                <FieldUpdatedPill change={servicesChange} />
              </div>
              {hasMoreServices ? (
                <button
                  type="button"
                  aria-expanded={showAllServices}
                  onClick={() => setShowAllServices((prev) => !prev)}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold text-primary bg-primary-subtle hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  {showAllServices
                    ? "Show fewer"
                    : `Show all ${services.length} services (+${hiddenCount} more)`}
                </button>
              ) : null}
            </div>
            <FieldPreviousValueCaption change={servicesChange} />
            <div className="flex flex-wrap gap-1.5">
              {visibleServices.map((svc, idx) => (
                <span
                  key={`${svc.name ?? "svc"}-${idx}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-surface border border-border text-text-secondary"
                >
                  {svc.name || "Service"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Inline Uploaded Proof Preview when rendered in compact drawer mode */}
      {inlineProofMode === "drawer" ? (
        <section className="space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Uploaded Credential Proofs
          </div>
          {detail.kind === "Facility" ? (
            <ProofEvidenceCard
              label="DOH License to Operate (LTO) Proof"
              objectKey={detail.ltoEvidenceObjectKey ?? detail.evidenceObjectKey}
              fetchEvidence={fetchLtoEvidence}
              isUpdated={Boolean(diff?.ltoProofUpdated)}
            />
          ) : (
            <>
              <ProofEvidenceCard
                label="PRC License Proof"
                objectKey={detail.prcEvidenceObjectKey ?? detail.evidenceObjectKey}
                fetchEvidence={fetchPrcEvidence}
                isUpdated={Boolean(diff?.prcProofUpdated)}
              />
              {detail.ltoEvidenceObjectKey ? (
                <ProofEvidenceCard
                  label="Facility DOH LTO Proof"
                  objectKey={detail.ltoEvidenceObjectKey}
                  fetchEvidence={fetchLtoEvidence}
                  isUpdated={Boolean(diff?.ltoProofUpdated)}
                />
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* Bundled / Child Practitioner Requests */}
      {detail.childPractitionerRequests.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              <IconUserCheck className="h-3.5 w-3.5 text-primary" />
              <span>
                {detail.kind === "Facility"
                  ? `Bundled Clinicians (${detail.childPractitionerRequests.length})`
                  : "Clinician Request Details"}
              </span>
            </div>
            {detail.kind === "Facility" && canApprove && pendingChildren.length > 0 ? (
              <label className="flex items-center gap-1.5 text-xs font-medium text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={approveBundled}
                  onChange={(e) => setApproveBundled(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Approve bundled clinicians</span>
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            {detail.childPractitionerRequests.map((child) => (
              <ChildPractitionerRow
                key={child.id}
                parentRequestId={detail.id}
                child={child}
                selectable={
                  detail.kind === "Facility" &&
                  canApprove &&
                  approveBundled &&
                  child.status === "PendingReview"
                }
                selected={selectedChildIds.includes(child.id)}
                onToggle={handleToggleChild}
                renderInlineProof={inlineProofMode === "drawer"}
                isProofActive={activeProofTabId === `child:${child.id}`}
                onInspectProof={onInspectChildProof}
                isUpdated={updatedChildIdSet.has(child.id)}
                isProofUpdated={updatedChildProofIdSet.has(child.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* PRC Match Candidates */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          <IconAlertTriangle className="h-3.5 w-3.5 text-primary" />
          <span>PRC Match Candidates ({detail.prcMatchCandidates.length})</span>
        </div>
        {detail.prcMatchCandidates.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-xs text-text-muted">
            No existing canonical PRC record matched. Approving creates a verified practitioner profile.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.prcMatchCandidates.map((cand) => (
              <CandidateCard
                key={cand.practitionerId}
                candidate={cand}
                canRevoke={allowRevoke}
                suspendingId={suspendingId}
                onSuspend={handleSuspendPractitioner}
              />
            ))}
          </div>
        )}
      </section>

      {/* Submission History */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          <IconHistory className="h-3.5 w-3.5 text-primary" />
          <span>Submission History ({detail.submissionHistory.length})</span>
        </div>
        {detail.submissionHistory.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-xs text-text-muted">
            No prior submissions recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.submissionHistory.map((item) => {
              const hasItemReviewer = Boolean(
                item.reviewedAtUtc ||
                  item.reviewedByDisplayName ||
                  item.reviewedByEmail ||
                  item.reviewedByAdminUserId,
              );
              const itemReviewer = hasItemReviewer
                ? resolveHumanActorDisplay(
                    item.reviewedByDisplayName,
                    item.reviewedByEmail,
                    item.reviewedByAdminUserId,
                    "Platform Reviewer",
                  )
                : null;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-text">
                      Submission #{item.submissionNumber} • {item.requestKind}
                    </span>
                    <VerificationStatusBadge status={item.status} />
                  </div>
                  <div className="text-[11px] text-text-muted flex items-center gap-1">
                    <IconClock className="h-3 w-3 shrink-0" />
                    <span>Submitted {formatVerificationTimestamp(item.submittedAtUtc)}</span>
                  </div>
                  {itemReviewer ? (
                    <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-1.5">
                      <span>
                        {"Reviewed by "}
                        <span
                          className="font-medium text-text-secondary"
                          title={itemReviewer.tooltip}
                        >
                          {itemReviewer.primary}
                        </span>
                        {itemReviewer.secondary ? ` (${itemReviewer.secondary})` : ""}
                      </span>
                      {item.reviewedAtUtc ? (
                        <span>{`• ${formatVerificationTimestamp(item.reviewedAtUtc)}`}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {item.reviewerNotes ? (
                    <div className="text-[11px] text-text">Notes: {item.reviewerNotes}</div>
                  ) : null}
                  {item.withdrawalReason ? (
                    <div className="text-[11px] text-text-muted">
                      Withdrawal reason: {item.withdrawalReason}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Reviewer Action Controls */}
      <div className="border-t border-border pt-4 space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Reviewer Actions
        </div>

        {!allowVerify && !allowRevoke ? (
          <div className="rounded-xl border border-border bg-surface-muted/60 p-3 text-xs text-text-muted">
            Read-only access. Approving or rejecting requests requires{" "}
            <span className="font-mono text-text">verify:directory</span>.
          </div>
        ) : null}

        {allowVerify && (canApprove || canReject) ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="reviewer-notes" className="block text-xs font-semibold text-text">
                Reviewer Notes (Optional)
              </label>
              <textarea
                id="reviewer-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Document LTO/PRC verification observations..."
                rows={2}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            {canReject ? (
              <div className="space-y-1.5">
                <label htmlFor="reject-reason" className="block text-xs font-semibold text-text">
                  Clinical / Compliance Rejection Reason *
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectValidationError) setRejectValidationError(null);
                  }}
                  placeholder="Required when rejecting (e.g. Expired DOH LTO certificate or unreadable PRC ID)..."
                  rows={2}
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-surface-muted border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 ${
                    rejectValidationError
                      ? "border-red-500 focus:ring-red-500"
                      : "border-border focus:ring-primary"
                  }`}
                />
                {rejectValidationError ? (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {rejectValidationError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canApprove ? (
                <button
                  type="button"
                  disabled={submittingAction !== null}
                  onClick={handleApprove}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingAction === "approve" ? (
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconCheck className="h-3.5 w-3.5" />
                  )}
                  <span>Approve Request</span>
                </button>
              ) : null}

              {canReject ? (
                <button
                  type="button"
                  disabled={submittingAction !== null}
                  onClick={handleReject}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingAction === "reject" ? (
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconX className="h-3.5 w-3.5" />
                  )}
                  <span>Reject Request</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {allowRevoke && standalonePractitionerId ? (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2.5">
            <div className="text-xs font-bold text-red-600 dark:text-red-400">
              Revoke / Suspend Verification
            </div>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Optional compliance reason for practitioner suspension..."
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-red-500"
            />
            <button
              type="button"
              disabled={suspendingId === standalonePractitionerId}
              onClick={() => handleSuspendPractitioner(standalonePractitionerId)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {suspendingId === standalonePractitionerId ? (
                <IconLoader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconBan className="h-3.5 w-3.5" />
              )}
              <span>Suspend Practitioner Across Clinics</span>
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function VerificationDetailWorkspace({
  requestId,
  profile,
  queueSearch,
  initialDetail,
  onActionCompleted,
  initialShowAllServices = false,
}: VerificationDetailWorkspaceProps) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Outside RouterProvider in unit tests
  }

  const controller = useVerificationDetailController({
    requestId,
    profile,
    initialDetail,
    onActionCompleted,
  });

  const { detail, loading, error, loadDetail, fetchLtoEvidence, fetchPrcEvidence } = controller;

  const proofTabs = useMemo<WorkspaceProofTab[]>(() => {
    if (!detail) return [];
    const diff = detail.resubmissionDiff;
    const updatedChildProofSet = new Set(diff?.updatedChildPrcProofIds ?? []);
    if (detail.kind === "Facility") {
      const tabs: WorkspaceProofTab[] = [
        {
          id: "lto",
          tabLabel: "DOH LTO Proof",
          cardLabel: "DOH License to Operate (LTO) Proof",
          objectKey: detail.ltoEvidenceObjectKey ?? detail.evidenceObjectKey,
          fetchEvidence: fetchLtoEvidence,
          isUpdated: Boolean(diff?.ltoProofUpdated),
        },
      ];
      for (const child of detail.childPractitionerRequests) {
        if (child.prcEvidenceObjectKey) {
          const childName = [child.title, child.firstName, child.lastName].filter(Boolean).join(" ");
          tabs.push({
            id: `child:${child.id}`,
            tabLabel: `PRC • ${childName}`,
            cardLabel: `PRC Proof (${childName})`,
            objectKey: child.prcEvidenceObjectKey,
            fetchEvidence: () =>
              verificationService.fetchVerificationEvidence(detail.id, {
                kind: "prc",
                childRequestId: child.id,
              }),
            isUpdated: updatedChildProofSet.has(child.id),
          });
        }
      }
      return tabs;
    }

    const tabs: WorkspaceProofTab[] = [
      {
        id: "prc",
        tabLabel: "PRC License Proof",
        cardLabel: "PRC License Proof",
        objectKey: detail.prcEvidenceObjectKey ?? detail.evidenceObjectKey,
        fetchEvidence: fetchPrcEvidence,
        isUpdated: Boolean(diff?.prcProofUpdated),
      },
    ];
    if (detail.ltoEvidenceObjectKey) {
      tabs.push({
        id: "lto",
        tabLabel: "Facility DOH LTO Proof",
        cardLabel: "Facility DOH LTO Proof",
        objectKey: detail.ltoEvidenceObjectKey,
        fetchEvidence: fetchLtoEvidence,
        isUpdated: Boolean(diff?.ltoProofUpdated),
      });
    }
    return tabs;
  }, [detail, fetchLtoEvidence, fetchPrcEvidence]);

  const proofPanelRef = useRef<HTMLDivElement | null>(null);
  const [selectedProofTabId, setSelectedProofTabId] = useState<string>("");
  const activeProofTab =
    proofTabs.find((t) => t.id === selectedProofTabId) ?? proofTabs[0] ?? null;

  const handleInspectChildProof = useCallback((childId: string) => {
    setSelectedProofTabId(`child:${childId}`);
    if (typeof proofPanelRef.current?.scrollIntoView === "function") {
      proofPanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const backHref = buildVerificationsQueueHref(queueSearch);

  const handleBackToQueue = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (navigate) {
      e.preventDefault();
      void navigate({
        to: "/verifications",
        search: queueSearch ?? {},
      });
    }
  };

  const handleNavigateTenant = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (navigate) {
      e.preventDefault();
      void navigate({ to: "/tenants/$slug", params: { slug } });
    }
  };

  return (
    <div
      className="space-y-6 animate-in fade-in duration-200"
      aria-label="Directory verification review workspace"
    >
      {/* Top Breadcrumb & Summary Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={backHref}
            onClick={handleBackToQueue}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text transition-colors"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Directory Verifications</span>
          </a>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadDetail()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {detail ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-text-muted">
                  Submission #{detail.submissionNumber}
                </span>
                <VerificationKindBadge kind={detail.kind} />
                <VerificationStatusBadge status={detail.status} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-text truncate">
                {detail.facilityName}
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-text-muted">
                <span>Workspace:</span>
                {detail.tenantSlug ? (
                  <a
                    href={`/tenants/${encodeURIComponent(detail.tenantSlug)}`}
                    onClick={(e) => handleNavigateTenant(e, detail.tenantSlug)}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <span>
                      {detail.tenantName} ({detail.tenantSlug})
                    </span>
                    <IconExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span>{detail.tenantName}</span>
                )}
                <span>• {detail.requestKind}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Content */}
      {loading && !detail ? (
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-pulse"
          aria-label="Loading verification detail"
        >
          <div className="lg:col-span-6 space-y-4">
            <div className="h-44 rounded-2xl bg-surface-muted" />
            <div className="h-56 rounded-2xl bg-surface-muted" />
            <div className="h-40 rounded-2xl bg-surface-muted" />
          </div>
          <div className="lg:col-span-6">
            <div className="h-[560px] rounded-2xl bg-surface-muted" />
          </div>
        </div>
      ) : error && !detail ? (
        <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs space-y-3">
          <div className="font-bold text-sm">Unable to load verification request</div>
          <p>{error}</p>
          <div className="flex items-center gap-2">
            <a
              href={backHref}
              onClick={handleBackToQueue}
              className="px-3.5 py-1.5 font-semibold rounded-lg bg-surface border border-border text-text hover:bg-surface-muted transition-colors"
            >
              Return to Queue
            </a>
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="px-3.5 py-1.5 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      ) : detail ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Typed Metadata, Bundled Clinicians, PRC Candidates, History & Actions */}
          <div className="lg:col-span-6 rounded-2xl border border-border bg-surface p-5 space-y-5 shadow-sm">
            <VerificationDetailMetadataAndActions
              detail={detail}
              controller={controller}
              inlineProofMode="workspace"
              activeProofTabId={activeProofTab?.id}
              onInspectChildProof={handleInspectChildProof}
              initialShowAllServices={initialShowAllServices}
            />
          </div>

          {/* Right Column: Tall Sticky Document Proof Comparison Viewer */}
          <div
            ref={proofPanelRef}
            className="lg:col-span-6 lg:sticky lg:top-20 rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-sm"
          >
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Uploaded Credential Proofs
              </div>
              <p className="text-xs text-text-muted">
                Verify DOH LTO and PRC license details side-by-side against the submitted record.
              </p>
            </div>

            {proofTabs.length > 1 ? (
              <div
                className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface-muted border border-border"
                role="tablist"
                aria-label="Select credential proof document"
              >
                {proofTabs.map((tab) => {
                  const active = activeProofTab?.id === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedProofTabId(tab.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? "bg-surface text-text shadow-xs"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      <span>{tab.tabLabel}</span>
                      {tab.isUpdated ? (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border whitespace-nowrap ${TONE_BADGE_CLASSES.warning}`}
                        >
                          Updated
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {activeProofTab ? (
              <ProofEvidenceCard
                key={`${detail.id}:${activeProofTab.id}`}
                label={activeProofTab.cardLabel}
                objectKey={activeProofTab.objectKey}
                fetchEvidence={activeProofTab.fetchEvidence}
                variant="workspace"
                isUpdated={activeProofTab.isUpdated}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function VerificationReviewDrawer({
  requestId,
  profile,
  onClose,
  onActionCompleted,
  initialDetail,
  initialShowAllServices = false,
}: VerificationReviewDrawerProps) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Outside RouterProvider in unit tests
  }

  const controller = useVerificationDetailController({
    requestId,
    profile,
    initialDetail,
    onActionCompleted,
  });

  if (!requestId) return null;

  const { detail, loading, error, loadDetail } = controller;

  const handleNavigateTenant = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (navigate) {
      e.preventDefault();
      void navigate({ to: "/tenants/$slug", params: { slug } });
    }
  };

  return (
    <aside
      aria-label="Verification review drawer"
      className="flex flex-col h-full bg-surface border border-border rounded-2xl shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-muted/40 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 space-y-1">
          {detail ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-text-muted">
                  Submission #{detail.submissionNumber}
                </span>
                <VerificationKindBadge kind={detail.kind} />
                <VerificationStatusBadge status={detail.status} />
              </div>
              <h2 className="text-base font-bold text-text truncate">{detail.facilityName}</h2>
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-text-muted">
                <span>Workspace:</span>
                {detail.tenantSlug ? (
                  <a
                    href={`/tenants/${encodeURIComponent(detail.tenantSlug)}`}
                    onClick={(e) => handleNavigateTenant(e, detail.tenantSlug)}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <span>
                      {detail.tenantName} ({detail.tenantSlug})
                    </span>
                    <IconExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span>{detail.tenantName}</span>
                )}
                <span>• {detail.requestKind}</span>
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-text">Verification Review</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close review drawer"
          className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="space-y-3 animate-pulse" aria-label="Loading verification detail">
            <div className="h-20 w-full rounded-xl bg-surface-muted" />
            <div className="h-32 w-full rounded-xl bg-surface-muted" />
            <div className="h-28 w-full rounded-xl bg-surface-muted" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs space-y-2">
            <div className="font-bold">Unable to load verification request</div>
            <p>{error}</p>
            <button
              type="button"
              onClick={loadDetail}
              className="px-3 py-1.5 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : detail ? (
          <VerificationDetailMetadataAndActions
            detail={detail}
            controller={controller}
            inlineProofMode="drawer"
            initialShowAllServices={initialShowAllServices}
          />
        ) : null}
      </div>
    </aside>
  );
}
