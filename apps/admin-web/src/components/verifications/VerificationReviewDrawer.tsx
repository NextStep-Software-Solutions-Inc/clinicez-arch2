import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconHistory,
  IconLoader,
  IconShieldCheck,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  formatScheduleSummary,
  formatVerificationTimestamp,
  type ScheduleWindowLike,
} from "@/lib/verificationStatus";
import {
  canRevokeDirectoryVerification,
  canVerifyDirectory,
  verificationService,
  type ChildPractitionerRequestDetailDto,
  type PrcMatchCandidateDto,
  type ReviewerProfile,
  type VerificationRequestDetailDto,
} from "@/services/verification.service";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
  VerificationKindBadge,
  VerificationStatusBadge,
} from "./VerificationStatusBadge";

export interface VerificationReviewDrawerProps {
  requestId: string | null;
  profile: ReviewerProfile;
  onClose: () => void;
  onActionCompleted: () => void;
  initialDetail?: VerificationRequestDetailDto | null;
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

function ChildPractitionerRow({
  parentRequestId,
  child,
  selectable,
  selected,
  onToggle,
}: {
  parentRequestId: string;
  child: ChildPractitionerRequestDetailDto;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const fullName = [child.title, child.firstName, child.lastName].filter(Boolean).join(" ");
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
    <div className="rounded-xl border border-border bg-surface-muted/40 p-3 space-y-2 text-xs">
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
            <div className="font-semibold text-text">{fullName}</div>
            <div className="text-[11px] text-text-muted">
              {child.professionKind} • PRC{" "}
              <span className="font-mono text-text">{child.normalizedPrcLicenseNo}</span>
              {child.prcExpiryDate ? ` • Exp ${child.prcExpiryDate}` : ""}
            </div>
            {child.specialty ? (
              <div className="text-[11px] text-text-muted">Specialty: {child.specialty}</div>
            ) : null}
          </div>
        </div>
        <VerificationStatusBadge status={child.status} />
      </div>

      <div className="text-[11px] text-text-muted">
        Schedule: {formatScheduleSummary(child.availabilities)}
      </div>

      {child.hasNameMismatch ? <NameMismatchAlert compact /> : null}
      {child.prcEvidenceObjectKey ? (
        <ProofEvidenceCard
          label={`PRC Proof (${fullName})`}
          objectKey={child.prcEvidenceObjectKey}
          fetchEvidence={fetchChildEvidence}
        />
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
}: VerificationReviewDrawerProps) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Outside RouterProvider in unit tests
  }

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

  const fetchLtoEvidence = React.useMemo(
    () =>
      detail && (detail.ltoEvidenceObjectKey || (detail.kind === "Facility" && detail.evidenceObjectKey))
        ? () => verificationService.fetchVerificationEvidence(detail.id, { kind: "lto" })
        : undefined,
    [detail],
  );

  const fetchPrcEvidence = React.useMemo(
    () =>
      detail && detail.kind !== "Facility" && (detail.prcEvidenceObjectKey || detail.evidenceObjectKey)
        ? () => verificationService.fetchVerificationEvidence(detail.id, { kind: "prc" })
        : undefined,
    [detail],
  );

  if (!requestId) return null;

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
      onActionCompleted();
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
      onActionCompleted();
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
      onActionCompleted();
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

  const handleNavigateTenant = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (navigate) {
      e.preventDefault();
      navigate({ to: "/tenants/$slug", params: { slug } });
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
          <>
            {detail.hasNameMismatch ? <NameMismatchAlert /> : null}

            {/* Decision Summary if already reviewed / withdrawn */}
            {detail.reviewedAtUtc || detail.withdrawnAtUtc ? (
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3 text-xs space-y-1">
                {detail.reviewedAtUtc ? (
                  <div>
                    <span className="font-semibold text-text">Reviewed:</span>{" "}
                    <span className="text-text-secondary">
                      {formatVerificationTimestamp(detail.reviewedAtUtc)}
                      {detail.reviewedByAdminUserId ? ` by ${detail.reviewedByAdminUserId}` : ""}
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

              <div className="rounded-xl border border-border bg-background p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <div className="text-[11px] text-text-muted">Submitted At</div>
                  <div className="font-medium text-text">
                    {formatVerificationTimestamp(detail.submittedAtUtc)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-text-muted">Submitted By</div>
                  <div className="font-medium text-text">
                    {detail.submittedByDisplayName || detail.submittedByClinicUserId || "Clinic Manager"}
                  </div>
                </div>
                {detail.dohLtoNumber ? (
                  <div>
                    <div className="text-[11px] text-text-muted">DOH LTO #</div>
                    <div className="font-mono font-semibold text-text">{detail.dohLtoNumber}</div>
                  </div>
                ) : null}
                {classification ? (
                  <div>
                    <div className="text-[11px] text-text-muted">Classification</div>
                    <div className="font-medium text-text">{classification}</div>
                  </div>
                ) : null}
                {operatingHours ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-text-muted">Operating Hours</div>
                    <div className="font-medium text-text">{operatingHours}</div>
                  </div>
                ) : null}
                {address ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-text-muted">Facility Address</div>
                    <div className="font-medium text-text">{address}</div>
                  </div>
                ) : null}
                {contactNumber || contactEmail ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-text-muted">Clinic Contacts</div>
                    <div className="font-medium text-text">
                      {[contactNumber, contactEmail].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                ) : null}
                {isOnlineBookingPaused !== null ? (
                  <div>
                    <div className="text-[11px] text-text-muted">Online Booking</div>
                    <div className="font-medium text-text">
                      {isOnlineBookingPaused ? "Booking Paused" : "Accepting Bookings"}
                    </div>
                  </div>
                ) : null}
                {specialty ? (
                  <div>
                    <div className="text-[11px] text-text-muted">Specialty</div>
                    <div className="font-medium text-text">{specialty}</div>
                  </div>
                ) : null}
                {verificationContact ? (
                  <div>
                    <div className="text-[11px] text-text-muted">Verification Contact</div>
                    <div className="font-medium text-text">{verificationContact}</div>
                  </div>
                ) : null}
                {availabilities.length > 0 ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-text-muted">Schedule Summary</div>
                    <div className="font-medium text-text">
                      {formatScheduleSummary(availabilities)}
                    </div>
                  </div>
                ) : null}
                {publicBio ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-text-muted">Public Bio</div>
                    <div className="text-text leading-relaxed">{publicBio}</div>
                  </div>
                ) : null}
              </div>

              {services.length > 0 ? (
                <div className="rounded-xl border border-border bg-surface-muted/40 p-3 space-y-1.5 text-xs">
                  <div className="font-semibold text-text">
                    Declared Clinic Services ({services.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {services.slice(0, 10).map((svc, idx) => (
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

            {/* Uploaded Proof Preview / Viewer */}
            <section className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Uploaded Credential Proofs
              </div>
              {detail.kind === "Facility" ? (
                <ProofEvidenceCard
                  label="DOH License to Operate (LTO) Proof"
                  objectKey={detail.ltoEvidenceObjectKey ?? detail.evidenceObjectKey}
                  fetchEvidence={fetchLtoEvidence}
                />
              ) : (
                <>
                  <ProofEvidenceCard
                    label="PRC License Proof"
                    objectKey={detail.prcEvidenceObjectKey ?? detail.evidenceObjectKey}
                    fetchEvidence={fetchPrcEvidence}
                  />
                  {detail.ltoEvidenceObjectKey ? (
                    <ProofEvidenceCard
                      label="Facility DOH LTO Proof"
                      objectKey={detail.ltoEvidenceObjectKey}
                      fetchEvidence={fetchLtoEvidence}
                    />
                  ) : null}
                </>
              )}
            </section>

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
                  {detail.submissionHistory.map((item) => (
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
                      {item.reviewerNotes ? (
                        <div className="text-[11px] text-text">Notes: {item.reviewerNotes}</div>
                      ) : null}
                      {item.withdrawalReason ? (
                        <div className="text-[11px] text-text-muted">
                          Withdrawal reason: {item.withdrawalReason}
                        </div>
                      ) : null}
                    </div>
                  ))}
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
        ) : null}
      </div>
    </aside>
  );
}
