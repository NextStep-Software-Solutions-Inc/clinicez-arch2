"use client";

import React, { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconClock,
  IconHistory,
  IconLoader,
  IconShieldCheck,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
import { toastApiError } from "@/lib/apiToast";
import { toast } from "sonner";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
  VerificationKindBadge,
  VerificationStatusBadge,
} from "./VerificationStatusBadge";

interface VerificationReviewDrawerProps {
  requestId: string | null;
  profile: ReviewerProfile;
  onClose: () => void;
  onActionCompleted: () => void;
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
    <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{fullName}</div>
          <div className="text-[11px] text-muted-foreground">
            {candidate.professionKind} • PRC{" "}
            <span className="font-mono text-foreground">{candidate.normalizedPrcLicenseNo}</span> •{" "}
            {candidate.primarySpecialty}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VerificationStatusBadge status={candidate.verificationStatus} />
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold",
              candidate.isCompatibleNameMatch
                ? "bg-success/10 text-success border-success/25"
                : "bg-warning/10 text-warning border-warning/25",
            )}
          >
            {candidate.isCompatibleNameMatch ? "Name Match" : "Name Mismatch"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Affiliated clinics: {candidate.affiliatedFacilityCount}</span>
        {candidate.prcExpiryDate ? <span>PRC expiry: {candidate.prcExpiryDate}</span> : null}
        {candidate.verifiedAtUtc ? (
          <span>Verified: {formatVerificationTimestamp(candidate.verifiedAtUtc)}</span>
        ) : null}
      </div>

      {candidate.affiliatedClinics.length > 0 ? (
        <div className="text-[11px] text-muted-foreground">
          Clinics: {candidate.affiliatedClinics.join(", ")}
        </div>
      ) : null}

      {canRevoke && candidate.verificationStatus === "Verified" ? (
        <div className="pt-1 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={suspendingId === candidate.practitionerId}
            onClick={() => onSuspend(candidate.practitionerId)}
            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
          >
            {suspendingId === candidate.practitionerId ? (
              <IconLoader className="h-3 w-3 animate-spin" />
            ) : (
              <IconBan className="h-3 w-3" />
            )}
            <span>Suspend Practitioner</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChildPractitionerRow({
  child,
  selectable,
  selected,
  onToggle,
}: {
  child: ChildPractitionerRequestDetailDto;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const fullName = [child.title, child.firstName, child.lastName].filter(Boolean).join(" ");
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {selectable ? (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onToggle(child.id, checked === true)}
              aria-label={`Include ${fullName} in approval`}
              className="mt-0.5"
            />
          ) : null}
          <div className="min-w-0">
            <div className="font-semibold text-foreground">{fullName}</div>
            <div className="text-[11px] text-muted-foreground">
              {child.professionKind} • PRC{" "}
              <span className="font-mono text-foreground">{child.normalizedPrcLicenseNo}</span>
              {child.prcExpiryDate ? ` • Exp ${child.prcExpiryDate}` : ""}
            </div>
            {child.specialty ? (
              <div className="text-[11px] text-muted-foreground">Specialty: {child.specialty}</div>
            ) : null}
          </div>
        </div>
        <VerificationStatusBadge status={child.status} />
      </div>

      <div className="text-[11px] text-muted-foreground">
        Schedule: {formatScheduleSummary(child.availabilities)}
      </div>

      {child.hasNameMismatch ? <NameMismatchAlert compact /> : null}
      {child.prcEvidenceObjectKey ? (
        <ProofEvidenceCard label={`PRC Proof (${fullName})`} objectKey={child.prcEvidenceObjectKey} />
      ) : null}
    </div>
  );
}

export function VerificationReviewDrawer({
  requestId,
  profile,
  onClose,
  onActionCompleted,
}: VerificationReviewDrawerProps) {
  const [detail, setDetail] = useState<VerificationRequestDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectValidationError, setRejectValidationError] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [approveBundled, setApproveBundled] = useState(true);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);

  const [submittingAction, setSubmittingAction] = useState<"approve" | "reject" | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);

  const allowVerify = canVerifyDirectory(profile);
  const allowRevoke = canRevokeDirectoryVerification(profile);

  const loadDetail = React.useCallback(async () => {
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
      const message = err instanceof Error ? err.message : "Unable to load verification request.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (requestId) {
      void loadDetail();
    } else {
      setDetail(null);
      setError(null);
    }
  }, [requestId, loadDetail]);

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
      toastApiError(err, "Failed to approve verification request");
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
      toastApiError(err, "Failed to reject verification request");
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
      toastApiError(err, "Failed to suspend practitioner");
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

  return (
    <aside
      aria-label="Verification review drawer"
      className="flex flex-col h-full bg-card border border-border rounded-2xl shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/20 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 space-y-1">
          {detail ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-muted-foreground">
                  Submission #{detail.submissionNumber}
                </span>
                <VerificationKindBadge kind={detail.kind} />
                <VerificationStatusBadge status={detail.status} />
              </div>
              <h2 className="text-base font-bold text-foreground truncate">{detail.facilityName}</h2>
              <p className="text-xs text-muted-foreground truncate">
                Workspace: {detail.tenantName} ({detail.tenantSlug}) • {detail.requestKind}
              </p>
            </>
          ) : (
            <div className="text-sm font-bold text-foreground">Verification Review</div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close review drawer"
          className="h-8 w-8 rounded-lg shrink-0"
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="space-y-3" aria-label="Loading verification detail">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs space-y-2">
            <div className="font-bold">Unable to load verification request</div>
            <p>{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={loadDetail} className="h-8 rounded-lg text-xs">
              Retry
            </Button>
          </div>
        ) : detail ? (
          <>
            {detail.hasNameMismatch ? <NameMismatchAlert /> : null}

            {/* Decision Summary if already reviewed / withdrawn */}
            {detail.reviewedAtUtc || detail.withdrawnAtUtc ? (
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs space-y-1">
                {detail.reviewedAtUtc ? (
                  <div>
                    <span className="font-semibold text-foreground">Reviewed:</span>{" "}
                    <span className="text-muted-foreground">
                      {formatVerificationTimestamp(detail.reviewedAtUtc)}
                      {detail.reviewedByAdminUserId ? ` by ${detail.reviewedByAdminUserId}` : ""}
                    </span>
                  </div>
                ) : null}
                {detail.reviewerNotes ? (
                  <div>
                    <span className="font-semibold text-foreground">Reviewer notes:</span>{" "}
                    <span className="text-muted-foreground">{detail.reviewerNotes}</span>
                  </div>
                ) : null}
                {detail.withdrawnAtUtc ? (
                  <div>
                    <span className="font-semibold text-foreground">Withdrawn:</span>{" "}
                    <span className="text-muted-foreground">
                      {formatVerificationTimestamp(detail.withdrawnAtUtc)}
                      {detail.withdrawalReason ? ` — ${detail.withdrawalReason}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Submitted Snapshot */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Submitted Snapshot</span>
              </div>

              <div className="rounded-xl border border-border bg-background p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <div className="text-[11px] text-muted-foreground">Submitted At</div>
                  <div className="font-medium text-foreground">
                    {formatVerificationTimestamp(detail.submittedAtUtc)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Submitted By</div>
                  <div className="font-medium text-foreground">
                    {detail.submittedByDisplayName || detail.submittedByClinicUserId || "Clinic Manager"}
                  </div>
                </div>
                {detail.dohLtoNumber ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">DOH LTO #</div>
                    <div className="font-mono font-semibold text-foreground">{detail.dohLtoNumber}</div>
                  </div>
                ) : null}
                {classification ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Classification</div>
                    <div className="font-medium text-foreground">{classification}</div>
                  </div>
                ) : null}
                {operatingHours ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">Operating Hours</div>
                    <div className="font-medium text-foreground">{operatingHours}</div>
                  </div>
                ) : null}
                {address ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">Facility Address</div>
                    <div className="font-medium text-foreground">{address}</div>
                  </div>
                ) : null}
                {contactNumber || contactEmail ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">Clinic Contacts</div>
                    <div className="font-medium text-foreground">
                      {[contactNumber, contactEmail].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                ) : null}
                {isOnlineBookingPaused !== null ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Online Booking</div>
                    <div className="font-medium text-foreground">
                      {isOnlineBookingPaused ? "Booking Paused" : "Accepting Bookings"}
                    </div>
                  </div>
                ) : null}
                {specialty ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Specialty</div>
                    <div className="font-medium text-foreground">{specialty}</div>
                  </div>
                ) : null}
                {verificationContact ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Verification Contact</div>
                    <div className="font-medium text-foreground">{verificationContact}</div>
                  </div>
                ) : null}
                {availabilities.length > 0 ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">Schedule Summary</div>
                    <div className="font-medium text-foreground">
                      {formatScheduleSummary(availabilities)}
                    </div>
                  </div>
                ) : null}
                {publicBio ? (
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">Public Bio</div>
                    <div className="text-foreground leading-relaxed">{publicBio}</div>
                  </div>
                ) : null}
              </div>

              {services.length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5 text-xs">
                  <div className="font-semibold text-foreground">
                    Declared Clinic Services ({services.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {services.slice(0, 10).map((svc, idx) => (
                      <Badge key={`${svc.name ?? "svc"}-${idx}`} variant="outline" className="text-[11px] bg-background">
                        {svc.name || "Service"}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Uploaded Proof Preview / Link */}
            <section className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Uploaded Credential Proofs
              </div>
              {detail.kind === "Facility" ? (
                <ProofEvidenceCard
                  label="DOH License to Operate (LTO) Proof"
                  objectKey={detail.ltoEvidenceObjectKey ?? detail.evidenceObjectKey}
                />
              ) : (
                <>
                  <ProofEvidenceCard
                    label="PRC License Proof"
                    objectKey={detail.prcEvidenceObjectKey ?? detail.evidenceObjectKey}
                  />
                  {detail.ltoEvidenceObjectKey ? (
                    <ProofEvidenceCard
                      label="Facility DOH LTO Proof"
                      objectKey={detail.ltoEvidenceObjectKey}
                    />
                  ) : null}
                </>
              )}
            </section>

            {/* Bundled / Child Practitioner Requests */}
            {detail.childPractitionerRequests.length > 0 ? (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <IconUserCheck className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {detail.kind === "Facility"
                        ? `Bundled Clinicians (${detail.childPractitionerRequests.length})`
                        : "Clinician Request Details"}
                    </span>
                  </div>
                  {detail.kind === "Facility" && canApprove && pendingChildren.length > 0 ? (
                    <label className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
                      <Checkbox
                        checked={approveBundled}
                        onCheckedChange={(checked) => setApproveBundled(checked === true)}
                      />
                      <span>Approve bundled clinicians</span>
                    </label>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {detail.childPractitionerRequests.map((child) => (
                    <ChildPractitionerRow
                      key={child.id}
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
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <IconAlertTriangle className="h-3.5 w-3.5 text-primary" />
                <span>PRC Match Candidates ({detail.prcMatchCandidates.length})</span>
              </div>
              {detail.prcMatchCandidates.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <IconHistory className="h-3.5 w-3.5 text-primary" />
                <span>Submission History ({detail.submissionHistory.length})</span>
              </div>
              {detail.submissionHistory.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
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
                        <span className="font-semibold text-foreground">
                          Submission #{item.submissionNumber} • {item.requestKind}
                        </span>
                        <VerificationStatusBadge status={item.status} />
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <IconClock className="h-3 w-3 shrink-0" />
                        <span>Submitted {formatVerificationTimestamp(item.submittedAtUtc)}</span>
                      </div>
                      {item.reviewerNotes ? (
                        <div className="text-[11px] text-foreground">Notes: {item.reviewerNotes}</div>
                      ) : null}
                      {item.withdrawalReason ? (
                        <div className="text-[11px] text-muted-foreground">
                          Withdrawal reason: {item.withdrawalReason}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Reviewer Action Controls */}
            <Separator />
            <section className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reviewer Actions
              </div>

              {!allowVerify && !allowRevoke ? (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Read-only access. Approving or rejecting requests requires <span className="font-mono">verify:directory</span>.
                </div>
              ) : null}

              {allowVerify && (canApprove || canReject) ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reviewer-notes" className="text-xs font-semibold">
                      Reviewer Notes (Optional)
                    </Label>
                    <Textarea
                      id="reviewer-notes"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Document LTO/PRC verification observations..."
                      className="text-xs min-h-16 rounded-xl"
                    />
                  </div>

                  {canReject ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="reject-reason" className="text-xs font-semibold">
                        Clinical / Compliance Rejection Reason *
                      </Label>
                      <Textarea
                        id="reject-reason"
                        value={rejectReason}
                        onChange={(e) => {
                          setRejectReason(e.target.value);
                          if (rejectValidationError) setRejectValidationError(null);
                        }}
                        placeholder="Required when rejecting (e.g. Expired DOH LTO certificate or unreadable PRC ID)..."
                        className={cn(
                          "text-xs min-h-16 rounded-xl",
                          rejectValidationError && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                      {rejectValidationError ? (
                        <p className="text-[11px] font-medium text-destructive">{rejectValidationError}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {canApprove ? (
                      <Button
                        type="button"
                        disabled={submittingAction !== null}
                        onClick={handleApprove}
                        className="flex-1 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {submittingAction === "approve" ? (
                          <IconLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <IconCheck className="h-3.5 w-3.5" />
                        )}
                        <span>Approve Request</span>
                      </Button>
                    ) : null}

                    {canReject ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={submittingAction !== null}
                        onClick={handleReject}
                        className="flex-1 rounded-xl text-xs font-bold gap-1.5"
                      >
                        {submittingAction === "reject" ? (
                          <IconLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <IconX className="h-3.5 w-3.5" />
                        )}
                        <span>Reject Request</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {allowRevoke && standalonePractitionerId ? (
                <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 space-y-2.5">
                  <div className="text-xs font-bold text-destructive">Revoke / Suspend Verification</div>
                  <Textarea
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="Optional compliance reason for practitioner suspension..."
                    className="text-xs min-h-14 rounded-xl bg-background"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={suspendingId === standalonePractitionerId}
                    onClick={() => handleSuspendPractitioner(standalonePractitionerId)}
                    className="w-full rounded-xl text-xs font-bold gap-1.5"
                  >
                    {suspendingId === standalonePractitionerId ? (
                      <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconBan className="h-3.5 w-3.5" />
                    )}
                    <span>Suspend Practitioner Across Clinics</span>
                  </Button>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
