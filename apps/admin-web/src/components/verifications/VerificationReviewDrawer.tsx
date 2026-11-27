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
  IconMailForward,
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
import { Button, Chip, TabList, TabButton, Text } from "@/components/ui";

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

export function isEmailAddressValue(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export interface PractitionerGovernanceTarget {
  practitionerId: string;
  status: "Verified" | "Suspended";
  displayName: string | null;
}

export function resolvePractitionerGovernanceTarget(
  detail?: VerificationRequestDetailDto | null,
): PractitionerGovernanceTarget | null {
  if (!detail || detail.kind !== "Practitioner") return null;

  const primary = detail.childPractitionerRequests[0] ?? null;
  const snapshotName = [
    readSnapshotField(detail.snapshot, "title"),
    readSnapshotField(detail.snapshot, "firstName"),
    readSnapshotField(detail.snapshot, "lastName"),
  ]
    .filter(Boolean)
    .join(" ");
  const childName = primary
    ? [primary.title, primary.firstName, primary.lastName].filter(Boolean).join(" ")
    : "";
  const fallbackName = childName || snapshotName || null;

  const canonicalStatus = detail.canonicalPractitionerStatus ?? null;
  if (
    detail.canonicalPractitionerId &&
    (canonicalStatus === "Verified" || canonicalStatus === "Suspended")
  ) {
    return {
      practitionerId: detail.canonicalPractitionerId,
      status: canonicalStatus,
      displayName: fallbackName,
    };
  }

  const candidateByChildId = primary?.practitionerId
    ? detail.prcMatchCandidates.find(
        (c) =>
          c.practitionerId === primary.practitionerId &&
          (c.verificationStatus === "Verified" || c.verificationStatus === "Suspended"),
      )
    : undefined;

  const matchedCandidate =
    candidateByChildId ??
    detail.prcMatchCandidates.find(
      (c) => c.verificationStatus === "Verified" || c.verificationStatus === "Suspended",
    );

  if (
    matchedCandidate &&
    (matchedCandidate.verificationStatus === "Verified" ||
      matchedCandidate.verificationStatus === "Suspended")
  ) {
    const candName = [matchedCandidate.title, matchedCandidate.firstName, matchedCandidate.lastName]
      .filter(Boolean)
      .join(" ");
    return {
      practitionerId: matchedCandidate.practitionerId,
      status: matchedCandidate.verificationStatus,
      displayName: fallbackName || candName || null,
    };
  }

  return null;
}

function CandidateCard({
  candidate,
  canRevoke,
  suspendingId,
  reinstatingId,
  onRequestSuspend,
  onRequestReinstate,
}: {
  candidate: PrcMatchCandidateDto;
  canRevoke: boolean;
  suspendingId: string | null;
  reinstatingId: string | null;
  onRequestSuspend: (candidate: PrcMatchCandidateDto) => void;
  onRequestReinstate: (candidate: PrcMatchCandidateDto) => void;
}) {
  const fullName = [candidate.title, candidate.firstName, candidate.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Text as="div" className="font-semibold text-text">
            {fullName}
          </Text>
          <div className="text-[11px] text-text-muted">
            {candidate.professionKind} • PRC{" "}
            <span className="font-mono text-text">{candidate.normalizedPrcLicenseNo}</span> •{" "}
            {candidate.primarySpecialty}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VerificationStatusBadge status={candidate.verificationStatus} />
          <Chip
            tone={candidate.isCompatibleNameMatch ? "success" : "warning"}
            size="xs"
          >
            {candidate.isCompatibleNameMatch ? "Name Match" : "Name Mismatch"}
          </Chip>
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
          <Button
            variant="unstyled"
            size="xs"
            disabled={suspendingId === candidate.practitionerId}
            onClick={() => onRequestSuspend(candidate)}
            leadingIcon={
              suspendingId === candidate.practitionerId ? (
                <IconLoader className="h-3 w-3 animate-spin" />
              ) : (
                <IconBan className="h-3 w-3" />
              )
            }
            className="gap-1 font-semibold text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10"
          >
            Suspend Practitioner
          </Button>
        </div>
      ) : canRevoke && candidate.verificationStatus === "Suspended" ? (
        <div className="pt-1 flex justify-end">
          <Button
            variant="unstyled"
            size="xs"
            disabled={reinstatingId === candidate.practitionerId}
            onClick={() => onRequestReinstate(candidate)}
            leadingIcon={
              reinstatingId === candidate.practitionerId ? (
                <IconLoader className="h-3 w-3 animate-spin" />
              ) : (
                <IconShieldCheck className="h-3 w-3" />
              )
            }
            className="gap-1 font-semibold text-primary border border-primary/30 hover:bg-primary-subtle"
          >
            Reinstate Practitioner
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FieldUpdatedPill({ change }: { change?: FieldChangeDto }) {
  if (!change) return null;
  return (
    <Chip
      tone="unstyled"
      size="custom"
      className={`px-1.5 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.warning}`}
      title={
        change.previousValue
          ? `Previous: ${change.previousValue}`
          : "Updated in this resubmission"
      }
    >
      Updated
    </Chip>
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
            <Chip
              tone="unstyled"
              size="custom"
              className={`px-2 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.warning}`}
            >
              DOH LTO Proof Updated
            </Chip>
          ) : null}
          {diff.prcProofUpdated ? (
            <Chip
              tone="unstyled"
              size="custom"
              className={`px-2 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.warning}`}
            >
              PRC Proof Updated
            </Chip>
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
                <Chip
                  tone="unstyled"
                  size="custom"
                  className={`px-1.5 py-0.5 text-[9px] border ${TONE_BADGE_CLASSES.info}`}
                >
                  {change.changeKind}
                </Chip>
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
                <Chip
                  tone="unstyled"
                  size="custom"
                  className={`px-1.5 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.warning}`}
                >
                  Updated
                </Chip>
              ) : null}
              {isProofUpdated ? (
                <Chip
                  tone="unstyled"
                  size="custom"
                  className={`px-1.5 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.info}`}
                >
                  PRC Proof Updated
                </Chip>
              ) : null}
            </div>
            <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5">
              <span>
                {child.professionKind} • PRC{" "}
                <span className="font-mono text-text">{child.normalizedPrcLicenseNo}</span>
                {prcExpiryDisplay ? ` • Exp ${prcExpiryDisplay.dateText}` : ""}
              </span>
              {prcExpiryDisplay?.badgeLabel && prcExpiryDisplay.badgeClassName ? (
                <Chip
                  tone="unstyled"
                  size="custom"
                  className={`px-1.5 py-0.5 text-[9px] border ${prcExpiryDisplay.badgeClassName}`}
                >
                  {prcExpiryDisplay.badgeLabel}
                </Chip>
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
          <Button
            variant={isProofActive ? "primary" : "secondary"}
            size="xs"
            onClick={() => onInspectProof(child.id)}
            leadingIcon={<IconFileText className="h-3 w-3" />}
            className={`gap-1 ${isProofActive ? "border border-primary" : "text-text font-semibold"}`}
          >
            {isProofActive ? "Viewing PRC Proof" : "Inspect PRC Proof"}
          </Button>
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

interface GovernanceConfirmDialogState {
  mode: "suspend" | "reinstate";
  practitionerId: string;
  practitionerName: string;
  reason: string;
  fromCandidateCard: boolean;
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
  const [suspendValidationError, setSuspendValidationError] = useState<string | null>(null);
  const [reinstateReason, setReinstateReason] = useState("");
  const [reinstateValidationError, setReinstateValidationError] = useState<string | null>(null);
  const [governanceConfirmDialog, setGovernanceConfirmDialog] =
    useState<GovernanceConfirmDialogState | null>(null);
  const [confirmModalValidationError, setConfirmModalValidationError] = useState<string | null>(
    null,
  );
  const [approveBundled, setApproveBundled] = useState(true);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(() =>
    (initialDetail?.childPractitionerRequests ?? [])
      .filter((c) => c.status === "PendingReview")
      .map((c) => c.id),
  );

  const [submittingAction, setSubmittingAction] = useState<"approve" | "reject" | "resend" | null>(
    null,
  );
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reinstatingId, setReinstatingId] = useState<string | null>(null);

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
      setSuspendValidationError(null);
      setReinstateReason("");
      setReinstateValidationError(null);
      setGovernanceConfirmDialog(null);
      setConfirmModalValidationError(null);
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

  const handleResendConfirmation = async () => {
    if (!detail || !allowVerify) return;
    setSubmittingAction("resend");
    try {
      const res = await verificationService.resendAffiliationConfirmation(detail.id);
      toast.success(`Confirmation email resent to ${res.sentTo}.`);
      await loadDetail();
      onActionCompleted?.();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to resend affiliation confirmation email."));
    } finally {
      setSubmittingAction(null);
    }
  };

  const practitionerGovernanceTarget = useMemo(
    () => resolvePractitionerGovernanceTarget(detail),
    [detail],
  );
  const isPractitionerSuspended = practitionerGovernanceTarget?.status === "Suspended";

  const requestSuspendFromPanel = (practitionerId: string, practitionerName: string) => {
    if (!allowRevoke) return;
    const trimmed = suspendReason.trim();
    if (!trimmed) {
      setSuspendValidationError("Compliance reason is required to suspend a practitioner.");
      return;
    }
    setSuspendValidationError(null);
    setConfirmModalValidationError(null);
    setGovernanceConfirmDialog({
      mode: "suspend",
      practitionerId,
      practitionerName,
      reason: trimmed,
      fromCandidateCard: false,
    });
  };

  const requestReinstateFromPanel = (practitionerId: string, practitionerName: string) => {
    if (!allowRevoke) return;
    const trimmed = reinstateReason.trim();
    if (!trimmed) {
      setReinstateValidationError(
        "Compliance clearance reason is required to reinstate a practitioner.",
      );
      return;
    }
    setReinstateValidationError(null);
    setConfirmModalValidationError(null);
    setGovernanceConfirmDialog({
      mode: "reinstate",
      practitionerId,
      practitionerName,
      reason: trimmed,
      fromCandidateCard: false,
    });
  };

  const requestCandidateGovernanceAction = (
    mode: "suspend" | "reinstate",
    candidate: PrcMatchCandidateDto,
  ) => {
    if (!allowRevoke) return;
    const fullName =
      [candidate.title, candidate.firstName, candidate.lastName].filter(Boolean).join(" ") ||
      candidate.normalizedPrcLicenseNo;
    setConfirmModalValidationError(null);
    setGovernanceConfirmDialog({
      mode,
      practitionerId: candidate.practitionerId,
      practitionerName: fullName,
      reason: mode === "suspend" ? suspendReason.trim() : reinstateReason.trim(),
      fromCandidateCard: true,
    });
  };

  const confirmGovernanceAction = async () => {
    if (!allowRevoke || !governanceConfirmDialog) return;
    const trimmed = governanceConfirmDialog.reason.trim();
    if (!trimmed) {
      setConfirmModalValidationError(
        governanceConfirmDialog.mode === "suspend"
          ? "Compliance reason is required to suspend a practitioner."
          : "Compliance clearance reason is required to reinstate a practitioner.",
      );
      return;
    }

    setConfirmModalValidationError(null);
    const { mode, practitionerId } = governanceConfirmDialog;
    if (mode === "suspend") {
      setSuspendingId(practitionerId);
      try {
        await verificationService.suspendPractitioner(practitionerId, { reason: trimmed });
        toast.success("Practitioner verification suspended across affiliated clinics.");
        setGovernanceConfirmDialog(null);
        await loadDetail();
        onActionCompleted?.();
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, "Failed to suspend practitioner."));
      } finally {
        setSuspendingId(null);
      }
      return;
    }

    setReinstatingId(practitionerId);
    try {
      await verificationService.reinstatePractitioner(practitionerId, { reason: trimmed });
      toast.success("Practitioner verification reinstated across affiliated clinics.");
      setGovernanceConfirmDialog(null);
      await loadDetail();
      onActionCompleted?.();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to reinstate practitioner."));
    } finally {
      setReinstatingId(null);
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

  const canApprove = Boolean(detail && detail.status === "PendingReview" && allowVerify);
  const canReject = Boolean(
    detail && (detail.status === "PendingReview" || detail.status === "AwaitingOtp") && allowVerify,
  );
  const isAwaitingConfirmation = Boolean(
    detail && (detail.status === "AwaitingOtp" || detail.status === "AwaitingConfirmation"),
  );
  const resolvedVerificationContact =
    verificationContact ?? detail?.verificationContact ?? null;
  const canResendConfirmation = Boolean(
    isAwaitingConfirmation && allowVerify && isEmailAddressValue(resolvedVerificationContact),
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
    isAwaitingConfirmation,
    resolvedVerificationContact,
    canResendConfirmation,
    handleResendConfirmation,
    reviewNotes,
    setReviewNotes,
    rejectReason,
    setRejectReason,
    rejectValidationError,
    setRejectValidationError,
    suspendReason,
    setSuspendReason,
    suspendValidationError,
    setSuspendValidationError,
    reinstateReason,
    setReinstateReason,
    reinstateValidationError,
    setReinstateValidationError,
    governanceConfirmDialog,
    setGovernanceConfirmDialog,
    confirmModalValidationError,
    setConfirmModalValidationError,
    approveBundled,
    setApproveBundled,
    selectedChildIds,
    handleToggleChild,
    submittingAction,
    suspendingId,
    reinstatingId,
    handleApprove,
    handleReject,
    requestSuspendFromPanel,
    requestReinstateFromPanel,
    requestCandidateGovernanceAction,
    confirmGovernanceAction,
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
    practitionerGovernanceTarget,
    isPractitionerSuspended,
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
    isAwaitingConfirmation,
    resolvedVerificationContact,
    canResendConfirmation,
    handleResendConfirmation,
    reviewNotes,
    setReviewNotes,
    rejectReason,
    setRejectReason,
    rejectValidationError,
    setRejectValidationError,
    suspendReason,
    setSuspendReason,
    suspendValidationError,
    setSuspendValidationError,
    reinstateReason,
    setReinstateReason,
    reinstateValidationError,
    setReinstateValidationError,
    governanceConfirmDialog,
    setGovernanceConfirmDialog,
    confirmModalValidationError,
    setConfirmModalValidationError,
    approveBundled,
    setApproveBundled,
    selectedChildIds,
    handleToggleChild,
    submittingAction,
    suspendingId,
    reinstatingId,
    handleApprove,
    handleReject,
    requestSuspendFromPanel,
    requestReinstateFromPanel,
    requestCandidateGovernanceAction,
    confirmGovernanceAction,
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
    practitionerGovernanceTarget,
    isPractitionerSuspended,
  } = controller;

  const [showAllServices, setShowAllServices] = useState(initialShowAllServices);
  useEffect(() => {
    setShowAllServices(initialShowAllServices);
  }, [detail.id, initialShowAllServices]);

  useEffect(() => {
    if (
      !governanceConfirmDialog ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !suspendingId && !reinstatingId) {
        setGovernanceConfirmDialog(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (typeof window.removeEventListener === "function") {
        window.removeEventListener("keydown", onKeyDown);
      }
    };
  }, [governanceConfirmDialog, suspendingId, reinstatingId, setGovernanceConfirmDialog]);

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

  const rawPhoneCandidates = [detail.clinicContactNumber, contactNumber];
  const resolvedPhone =
    rawPhoneCandidates.find((value) => Boolean(value?.trim()) && !isEmailAddressValue(value)) ??
    null;
  const fallbackEmailFromPhone =
    rawPhoneCandidates.find((value) => isEmailAddressValue(value)) ?? null;
  const resolvedEmail = detail.clinicContactEmail ?? contactEmail ?? fallbackEmailFromPhone;

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
                  <Chip
                    tone="unstyled"
                    size="custom"
                    className={`px-2 py-0.5 text-[10px] font-sans border ${prcExpiryDisplay.badgeClassName}`}
                  >
                    {prcExpiryDisplay.badgeLabel}
                  </Chip>
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
                  <Chip
                    tone="unstyled"
                    size="custom"
                    className={`px-2 py-0.5 text-[10px] font-sans border ${ltoExpiryDisplay.badgeClassName}`}
                  >
                    {ltoExpiryDisplay.badgeLabel}
                  </Chip>
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
                <Chip
                  tone="unstyled"
                  size="custom"
                  className={`px-2 py-0.5 text-[10px] border ${
                    isPhilHealthAccredited
                      ? TONE_BADGE_CLASSES.success
                      : TONE_BADGE_CLASSES.neutral
                  }`}
                >
                  {isPhilHealthAccredited ? "Accredited" : "Not Accredited"}
                </Chip>
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
                  <Chip
                    tone="unstyled"
                    size="custom"
                    className={`px-2 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.info}`}
                  >
                    In-Person
                  </Chip>
                ) : null}
                {resolvedTeleconsult ? (
                  <Chip
                    tone="unstyled"
                    size="custom"
                    className={`px-2 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.info}`}
                  >
                    Teleconsult
                  </Chip>
                ) : null}
                {!resolvedInPerson && !resolvedTeleconsult ? (
                  <Chip
                    tone="unstyled"
                    size="custom"
                    className={`px-2 py-0.5 text-[10px] border ${TONE_BADGE_CLASSES.neutral}`}
                  >
                    None specified
                  </Chip>
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
              <div className="font-medium text-text break-all">{verificationContact}</div>
              <FieldPreviousValueCaption change={verificationContactChange} />
            </div>
          ) : null}
          {isAwaitingConfirmation && detail.otpExpiresAtUtc ? (
            <div>
              <div className="text-[11px] text-text-muted">Confirmation Link Expires</div>
              <div className="font-medium text-text">
                {formatVerificationTimestamp(detail.otpExpiresAtUtc)}
              </div>
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
                <Button
                  variant="unstyled"
                  size="xs"
                  aria-expanded={showAllServices}
                  onClick={() => setShowAllServices((prev) => !prev)}
                  className="font-semibold text-primary bg-primary-subtle hover:bg-primary/20"
                >
                  {showAllServices
                    ? "Show fewer"
                    : `Show all ${services.length} services (+${hiddenCount} more)`}
                </Button>
              ) : null}
            </div>
            <FieldPreviousValueCaption change={servicesChange} />
            <div className="flex flex-wrap gap-1.5">
              {visibleServices.map((svc, idx) => (
                <Chip
                  key={`${svc.name ?? "svc"}-${idx}`}
                  tone="unstyled"
                  size="custom"
                  className="px-2 py-0.5 rounded-md text-[11px] font-normal bg-surface border border-border text-text-secondary"
                >
                  {svc.name || "Service"}
                </Chip>
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
                reinstatingId={reinstatingId}
                onRequestSuspend={(candidate) => requestCandidateGovernanceAction("suspend", candidate)}
                onRequestReinstate={(candidate) =>
                  requestCandidateGovernanceAction("reinstate", candidate)
                }
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

        {isAwaitingConfirmation ? (
          <div
            role="status"
            data-testid="awaiting-confirmation-callout"
            className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <IconMailForward className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <div className="space-y-1 min-w-0">
                <div className="font-bold text-sky-800 dark:text-sky-300">
                  Awaiting Practitioner Email Confirmation
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  This practitioner&apos;s PRC license is already verified on Clinic EZ, so manual admin approval is skipped. The affiliation will activate automatically once the practitioner confirms via their email link and 6-digit code.
                </p>
                {resolvedVerificationContact ? (
                  <p className="text-[11px] text-text-secondary">
                    Destination:{" "}
                    <span className="font-mono font-semibold text-text break-all">
                      {resolvedVerificationContact}
                    </span>
                    {detail.otpExpiresAtUtc ? (
                      <>
                        {" · "}
                        {new Date(detail.otpExpiresAtUtc).getTime() <= Date.now() ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-300">
                            Expired {formatVerificationTimestamp(detail.otpExpiresAtUtc)}
                          </span>
                        ) : (
                          <span>
                            Expires {formatVerificationTimestamp(detail.otpExpiresAtUtc)}
                          </span>
                        )}
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                    No valid email address is set on Verification Contact. Ask the clinic to update the practitioner&apos;s email before resending.
                  </p>
                )}
              </div>
            </div>
            {allowVerify ? (
              <div className="pt-0.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submittingAction !== null || !canResendConfirmation}
                  onClick={handleResendConfirmation}
                  leadingIcon={
                    submittingAction === "resend" ? (
                      <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconMailForward className="h-3.5 w-3.5" />
                    )
                  }
                >
                  {submittingAction === "resend"
                    ? "Resending Confirmation..."
                    : "Resend Confirmation Email"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {allowVerify && (canApprove || canReject) ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Text as="label" htmlFor="reviewer-notes" className="text-xs font-semibold text-text">
                Reviewer Notes (Optional)
              </Text>
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
                <Text as="label" htmlFor="reject-reason" className="text-xs font-semibold text-text">
                  Clinical / Compliance Rejection Reason *
                </Text>
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

            {canApprove && isPractitionerSuspended ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
              >
                <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Practitioner verification is currently suspended across clinics. Reinstate the practitioner before approving, or reject this submission.
                </span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canApprove ? (
                <Button
                  variant="primary"
                  size="md"
                  disabled={submittingAction !== null || isPractitionerSuspended}
                  onClick={handleApprove}
                  leadingIcon={
                    submittingAction === "approve" ? (
                      <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconCheck className="h-3.5 w-3.5" />
                    )
                  }
                  className="flex-1"
                >
                  Approve Request
                </Button>
              ) : null}

              {canReject ? (
                <Button
                  variant="danger"
                  size="md"
                  disabled={submittingAction !== null}
                  onClick={handleReject}
                  leadingIcon={
                    submittingAction === "reject" ? (
                      <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconX className="h-3.5 w-3.5" />
                    )
                  }
                  className="flex-1"
                >
                  Reject Request
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {allowRevoke && practitionerGovernanceTarget ? (
          practitionerGovernanceTarget.status === "Suspended" ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-bold text-red-600 dark:text-red-400">
                  Practitioner Verification Suspended
                </div>
                <VerificationStatusBadge status="Suspended" />
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                This practitioner&apos;s directory verification is currently suspended across affiliated clinics. Reinstate verification only after compliance clearance.
              </p>
              <div className="space-y-1.5">
                <Text as="label" htmlFor="reinstate-reason" className="text-xs font-semibold text-text">
                  Compliance Reinstatement Reason *
                </Text>
                <textarea
                  id="reinstate-reason"
                  value={reinstateReason}
                  onChange={(e) => {
                    setReinstateReason(e.target.value);
                    if (reinstateValidationError) setReinstateValidationError(null);
                  }}
                  placeholder="Required reason for reinstating practitioner verification..."
                  rows={2}
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-background border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 ${
                    reinstateValidationError
                      ? "border-red-500 focus:ring-red-500"
                      : "border-border focus:ring-primary"
                  }`}
                />
                {reinstateValidationError ? (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {reinstateValidationError}
                  </p>
                ) : null}
              </div>
              <Button
                variant="primary"
                size="md"
                disabled={reinstatingId === practitionerGovernanceTarget.practitionerId}
                onClick={() =>
                  requestReinstateFromPanel(
                    practitionerGovernanceTarget.practitionerId,
                    practitionerGovernanceTarget.displayName || practitionerName || "Practitioner",
                  )
                }
                leadingIcon={
                  reinstatingId === practitionerGovernanceTarget.practitionerId ? (
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconShieldCheck className="h-3.5 w-3.5" />
                  )
                }
                className="w-full"
              >
                Reinstate Practitioner Across Clinics
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-bold text-red-600 dark:text-red-400">
                  Revoke / Suspend Verification
                </div>
                <VerificationStatusBadge status="Verified" />
              </div>
              <div className="space-y-1.5">
                <Text as="label" htmlFor="suspend-reason" className="text-xs font-semibold text-text">
                  Compliance Suspension Reason *
                </Text>
                <textarea
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => {
                    setSuspendReason(e.target.value);
                    if (suspendValidationError) setSuspendValidationError(null);
                  }}
                  placeholder="Required compliance reason for practitioner suspension..."
                  rows={2}
                  className={`w-full px-3 py-2 text-xs rounded-xl bg-background border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 ${
                    suspendValidationError
                      ? "border-red-500 focus:ring-red-500"
                      : "border-border focus:ring-red-500"
                  }`}
                />
                {suspendValidationError ? (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {suspendValidationError}
                  </p>
                ) : null}
              </div>
              <Button
                variant="danger"
                size="md"
                disabled={suspendingId === practitionerGovernanceTarget.practitionerId}
                onClick={() =>
                  requestSuspendFromPanel(
                    practitionerGovernanceTarget.practitionerId,
                    practitionerGovernanceTarget.displayName || practitionerName || "Practitioner",
                  )
                }
                leadingIcon={
                  suspendingId === practitionerGovernanceTarget.practitionerId ? (
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconBan className="h-3.5 w-3.5" />
                  )
                }
                className="w-full"
              >
                Suspend Practitioner Across Clinics
              </Button>
            </div>
          )
        ) : null}
      </div>

      {governanceConfirmDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!suspendingId && !reinstatingId) setGovernanceConfirmDialog(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={
            governanceConfirmDialog.mode === "suspend"
              ? "Confirm practitioner suspension"
              : "Confirm practitioner reinstatement"
          }
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl ${
                  governanceConfirmDialog.mode === "suspend"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-primary-subtle text-primary"
                }`}
              >
                {governanceConfirmDialog.mode === "suspend" ? (
                  <IconBan className="h-5 w-5" />
                ) : (
                  <IconShieldCheck className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base text-text">
                  {governanceConfirmDialog.mode === "suspend"
                    ? "Confirm Practitioner Suspension"
                    : "Confirm Practitioner Reinstatement"}
                </h3>
                <p className="text-xs text-text-muted">
                  {governanceConfirmDialog.practitionerName}
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {governanceConfirmDialog.mode === "suspend"
                ? "Suspending this practitioner revokes their public directory verification across all affiliated clinics and automatically closes any open Pending Review or Awaiting Confirmation submissions."
                : "Reinstating this practitioner restores Verified directory status and reactivates suspended clinic affiliations across the platform."}
            </p>

            <div className="space-y-1.5">
              <Text as="label" htmlFor="governance-confirm-reason" className="text-xs font-semibold text-text">
                {governanceConfirmDialog.mode === "suspend"
                  ? "Compliance Suspension Reason *"
                  : "Compliance Reinstatement Reason *"}
              </Text>
              <textarea
                id="governance-confirm-reason"
                value={governanceConfirmDialog.reason}
                onChange={(e) => {
                  const nextReason = e.target.value;
                  setGovernanceConfirmDialog((prev) =>
                    prev ? { ...prev, reason: nextReason } : null,
                  );
                  if (confirmModalValidationError) setConfirmModalValidationError(null);
                }}
                placeholder={
                  governanceConfirmDialog.mode === "suspend"
                    ? "Enter compliance reason for suspension..."
                    : "Enter compliance clearance reason for reinstatement..."
                }
                rows={2}
                className={`w-full px-3 py-2 text-xs rounded-xl bg-surface-muted border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 ${
                  confirmModalValidationError
                    ? "border-red-500 focus:ring-red-500"
                    : "border-border focus:ring-primary"
                }`}
              />
              {confirmModalValidationError ? (
                <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                  {confirmModalValidationError}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="md"
                disabled={Boolean(suspendingId || reinstatingId)}
                onClick={() => setGovernanceConfirmDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant={governanceConfirmDialog.mode === "suspend" ? "danger" : "primary"}
                size="md"
                disabled={Boolean(suspendingId || reinstatingId)}
                onClick={() => void confirmGovernanceAction()}
                leadingIcon={
                  suspendingId || reinstatingId ? (
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  ) : governanceConfirmDialog.mode === "suspend" ? (
                    <IconBan className="h-3.5 w-3.5" />
                  ) : (
                    <IconShieldCheck className="h-3.5 w-3.5" />
                  )
                }
                className="px-5"
              >
                {governanceConfirmDialog.mode === "suspend"
                  ? "Confirm Suspension"
                  : "Confirm Reinstatement"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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

          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => void loadDetail()}
            leadingIcon={<IconRefresh className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />}
            className="rounded-xl"
          >
            Refresh
          </Button>
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
                {detail.kind === "Practitioner" &&
                controller.practitionerGovernanceTarget?.status === "Suspended" &&
                detail.status !== "Suspended" ? (
                  <VerificationStatusBadge status="Suspended" />
                ) : null}
              </div>
              <Text as="h1" className="text-2xl font-bold tracking-tight text-text">
                {detail.facilityName}
              </Text>
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
            <Button
              variant="dangerSubtle"
              size="xs"
              onClick={() => void loadDetail()}
            >
              Retry
            </Button>
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
              <TabList ariaLabel="Select credential proof document">
                {proofTabs.map((tab) => {
                  const active = activeProofTab?.id === tab.id;
                  return (
                    <TabButton
                      key={tab.id}
                      active={active}
                      onClick={() => setSelectedProofTabId(tab.id)}
                      badge={
                        tab.isUpdated ? (
                          <Chip
                            tone="unstyled"
                            size="custom"
                            className={`px-1.5 py-0.5 text-[9px] border ${TONE_BADGE_CLASSES.warning}`}
                          >
                            Updated
                          </Chip>
                        ) : undefined
                      }
                    >
                      {tab.tabLabel}
                    </TabButton>
                  );
                })}
              </TabList>
            ) : null}

            {activeProofTab ? (
              <ProofEvidenceCard
                key={`${detail.id}:${activeProofTab.id}:${activeProofTab.objectKey ?? ""}`}
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
                {detail.kind === "Practitioner" &&
                controller.practitionerGovernanceTarget?.status === "Suspended" &&
                detail.status !== "Suspended" ? (
                  <VerificationStatusBadge status="Suspended" />
                ) : null}
              </div>
              <Text as="h2" className="text-base font-bold text-text">
                {detail.facilityName}
              </Text>
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
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          aria-label="Close review drawer"
          className="text-text-muted hover:text-text shrink-0"
        >
          <IconX className="h-4 w-4" />
        </Button>
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
            <Button
              variant="dangerSubtle"
              size="xs"
              onClick={loadDetail}
            >
              Retry
            </Button>
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
