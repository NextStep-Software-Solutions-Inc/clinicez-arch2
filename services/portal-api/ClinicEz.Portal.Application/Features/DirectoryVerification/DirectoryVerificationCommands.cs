using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public sealed record ApproveVerificationResult(
    Guid RequestId,
    string Kind,
    string Status,
    Guid FacilityId,
    List<Guid> ApprovedPractitionerIds,
    DateTime ReviewedAtUtc);

public sealed record RejectVerificationResult(
    Guid RequestId,
    string Kind,
    string Status,
    Guid FacilityId,
    string Reason,
    DateTime ReviewedAtUtc);

public sealed record SuspendPractitionerResult(
    Guid PractitionerId,
    PractitionerVerificationLevel Status,
    int SuspendedAffiliationsCount,
    DateTime RevokedAtUtc,
    int ClosedPendingRequestsCount = 0);

public sealed record ReinstatePractitionerResult(
    Guid PractitionerId,
    PractitionerVerificationLevel Status,
    int ReinstatedAffiliationsCount,
    DateTime ReinstatedAtUtc);

public sealed record AffiliationConfirmationInfoDto(
    Guid RequestId,
    Guid? PractitionerId,
    string PractitionerName,
    string ProfessionKind,
    Guid FacilityId,
    string FacilityName,
    string? Specialty,
    string Status,
    DateTime? ExpiresAtUtc,
    bool AlreadyConfirmed,
    bool IsExpired,
    bool RequiresOtpCode);

public sealed record AffiliationConfirmationResultDto(
    Guid RequestId,
    Guid PractitionerId,
    Guid AffiliationId,
    Guid FacilityId,
    string FacilityName,
    string AffiliationStatus,
    bool AlreadyConfirmed,
    DateTime ConfirmedAtUtc);

public sealed record ResendAffiliationConfirmationResult(
    Guid RequestId,
    string SentTo,
    DateTime ExpiresAtUtc,
    DateTime ResentAtUtc);

public sealed record ApproveVerificationRequestCommand(
    Guid RequestId,
    string AdminUserId,
    string AdminName,
    string? Notes = null,
    IReadOnlyList<Guid>? PractitionerRequestIds = null,
    bool ApproveBundledPractitioners = true,
    string? AdminEmail = null) : IRequest<ApproveVerificationResult>;

public sealed record RejectVerificationRequestCommand(
    Guid RequestId,
    string AdminUserId,
    string AdminName,
    string Reason,
    string? Notes = null,
    string? AdminEmail = null) : IRequest<RejectVerificationResult>;

public sealed record SuspendPractitionerCommand(
    Guid PractitionerId,
    string AdminUserId,
    string AdminName,
    string? Reason = null,
    string? AdminEmail = null) : IRequest<SuspendPractitionerResult>;

public sealed record ReinstatePractitionerCommand(
    Guid PractitionerId,
    string AdminUserId,
    string AdminName,
    string? Reason = null,
    string? AdminEmail = null) : IRequest<ReinstatePractitionerResult>;

public sealed record GetAffiliationConfirmationQuery(string Token) : IRequest<AffiliationConfirmationInfoDto?>;

public sealed record ConfirmPractitionerAffiliationCommand(
    string Token,
    string? OtpCode = null) : IRequest<AffiliationConfirmationResultDto>;

public sealed record ResendAffiliationConfirmationCommand(
    Guid RequestId,
    string AdminUserId,
    string AdminName,
    string? AdminEmail = null) : IRequest<ResendAffiliationConfirmationResult>;

public sealed class ApproveVerificationRequestCommandHandler(
    IApplicationDbContext db,
    IFacilityProvisioningPublisher provisioningPublisher,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider)
    : IRequestHandler<ApproveVerificationRequestCommand, ApproveVerificationResult>
{
    public async Task<ApproveVerificationResult> Handle(ApproveVerificationRequestCommand request, CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var facilityReq = await db.FacilityVerificationRequests
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .Include(r => r.PractitionerRequests)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct);

        if (facilityReq is not null)
        {
            if (facilityReq.Status != "PendingReview")
            {
                throw new CodedConflictException(
                    "verification_request_not_pending",
                    $"Facility verification request has already been {facilityReq.Status}.");
            }

            var (reviewerName, reviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
                db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

            facilityReq.Status = "Approved";
            facilityReq.ReviewedByAdminUserId = request.AdminUserId;
            facilityReq.ReviewedByDisplayName = reviewerName;
            facilityReq.ReviewedByEmail = reviewerEmail;
            facilityReq.ReviewedAtUtc = now;
            facilityReq.ReviewerNotes = string.IsNullOrWhiteSpace(request.Notes) ? facilityReq.ReviewerNotes : request.Notes.Trim();

            var facility = facilityReq.Facility;
            facility.PlatformVerificationStatus = PlatformVerificationStatus.Verified;
            facility.VerifiedAtUtc = now;
            facility.VerifiedByAdminUserId = request.AdminUserId;
            facility.LatestVerificationRequestId = facilityReq.Id;
            facility.RejectionReason = null;
            if (!string.IsNullOrWhiteSpace(facilityReq.LtoEvidenceObjectKey))
            {
                facility.LtoEvidenceObjectKey = facilityReq.LtoEvidenceObjectKey;
            }

            var snapshot = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facilityReq.SubmittedSnapshotJson);
            if (snapshot is not null)
            {
                if (!string.IsNullOrWhiteSpace(snapshot.DohLtoNumber))
                    facility.LicenseToOperate = snapshot.DohLtoNumber.Trim();
                else if (VerificationReviewerLookup.HasJsonPropertyKey(facilityReq.SubmittedSnapshotJson, "dohLtoNumber"))
                    facility.LicenseToOperate = null;
                if (VerificationReviewerLookup.HasJsonPropertyKey(facilityReq.SubmittedSnapshotJson, "dohLtoExpiryDate")
                    || snapshot.DohLtoExpiryDate.HasValue)
                    facility.LtoExpiryDate = snapshot.DohLtoExpiryDate;
                if (!string.IsNullOrWhiteSpace(snapshot.Classification))
                    facility.Classification = snapshot.Classification.Trim();
                if (!string.IsNullOrWhiteSpace(snapshot.OperatingHours))
                    facility.OperatingHours = snapshot.OperatingHours.Trim();
                var (normContactNumber, normContactEmail) = DirectoryVerificationHelper.NormalizeFacilityContacts(
                    snapshot.ContactNumber,
                    snapshot.ContactEmail);
                if (VerificationReviewerLookup.HasJsonPropertyKey(facilityReq.SubmittedSnapshotJson, "contactNumber")
                    || !string.IsNullOrWhiteSpace(normContactNumber))
                    facility.ContactNumber = normContactNumber;
                if (!string.IsNullOrWhiteSpace(normContactEmail))
                    facility.ContactEmail = normContactEmail;
                else if (snapshot.ContactEmail is not null)
                    facility.ContactEmail = null;
                if (VerificationReviewerLookup.HasJsonPropertyKey(facilityReq.SubmittedSnapshotJson, "philHealthAccreditationNumber")
                    || !string.IsNullOrWhiteSpace(snapshot.PhilHealthAccreditationNumber)
                    || (VerificationReviewerLookup.HasJsonPropertyKey(facilityReq.SubmittedSnapshotJson, "isPhilHealthAccredited")
                        && !snapshot.IsPhilHealthAccredited))
                    facility.PhilHealthAccreditationNumber = string.IsNullOrWhiteSpace(snapshot.PhilHealthAccreditationNumber)
                        ? null
                        : snapshot.PhilHealthAccreditationNumber.Trim();
            }

            var approvedPractitionerIds = new List<Guid>();
            if (request.ApproveBundledPractitioners)
            {
                var targetSet = request.PractitionerRequestIds is { Count: > 0 }
                    ? request.PractitionerRequestIds.ToHashSet()
                    : null;

                foreach (var childReq in facilityReq.PractitionerRequests.Where(c => !c.IsDeleted && c.Status == "PendingReview"))
                {
                    if (targetSet is not null && !targetSet.Contains(childReq.Id))
                        continue;

                    var existingCanonical = await ResolveExistingCanonicalPractitionerAsync(db, childReq, ct);
                    if (existingCanonical is { VerificationStatus: PractitionerVerificationLevel.Suspended })
                    {
                        if (targetSet is not null)
                        {
                            throw new CodedConflictException(
                                "practitioner_suspended",
                                "Cannot approve a verification request while this practitioner is suspended across clinics. Reinstate the practitioner first.");
                        }

                        continue;
                    }

                    var childSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(childReq.SubmittedSnapshotJson);
                    var (practitioner, affiliation) = await DirectoryVerificationHelper.UpsertVerifiedPractitionerAndAffiliationAsync(
                        db, childReq, childSnap, request.AdminUserId, now, confirmedViaOtp: false, ct);

                    childReq.Status = "Approved";
                    childReq.ReviewedByAdminUserId = request.AdminUserId;
                    childReq.ReviewedByDisplayName = reviewerName;
                    childReq.ReviewedByEmail = reviewerEmail;
                    childReq.ReviewedAtUtc = now;
                    childReq.ReviewerNotes = request.Notes?.Trim();

                    DirectoryVerificationHelper.StagePractitionerIdentityUpdated(
                        interopPublisher, practitioner, affiliation, facility, childReq.Id);

                    approvedPractitionerIds.Add(practitioner.Id);
                }
            }

            await provisioningPublisher.StageDirectoryUpdateAsync(facilityReq.Tenant, facility, ct);

            DirectoryVerificationHelper.StageAuditEntry(
                db,
                facilityReq.TenantId,
                request.AdminUserId,
                request.AdminName,
                "PlatformAdmin",
                "facility-approved",
                new
                {
                    requestId = facilityReq.Id,
                    facilityId = facility.Id,
                    submissionNumber = facilityReq.SubmissionNumber,
                    approvedPractitionerIds,
                    notes = request.Notes?.Trim()
                });

            await db.SaveChangesAsync(ct);

            return new ApproveVerificationResult(
                facilityReq.Id,
                "Facility",
                facilityReq.Status,
                facility.Id,
                approvedPractitionerIds,
                now);
        }

        var pracReq = await db.PractitionerVerificationRequests
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct)
            ?? throw new KeyNotFoundException($"Verification request '{request.RequestId}' was not found.");

        if (pracReq.Status == "AwaitingOtp")
        {
            throw new CodedConflictException(
                "practitioner_awaiting_otp",
                "This affiliation request is awaiting practitioner OTP confirmation.");
        }

        if (pracReq.Status != "PendingReview")
        {
            throw new CodedConflictException(
                "verification_request_not_pending",
                $"Practitioner verification request has already been {pracReq.Status}.");
        }

        var existingPrac = await ResolveExistingCanonicalPractitionerAsync(db, pracReq, ct);
        if (existingPrac is { VerificationStatus: PractitionerVerificationLevel.Suspended })
        {
            throw new CodedConflictException(
                "practitioner_suspended",
                "Cannot approve a verification request while this practitioner is suspended across clinics. Reinstate the practitioner first.");
        }

        var (pracReviewerName, pracReviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
            db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

        var pracSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        var (upsertedPrac, upsertedAff) = await DirectoryVerificationHelper.UpsertVerifiedPractitionerAndAffiliationAsync(
            db, pracReq, pracSnap, request.AdminUserId, now, confirmedViaOtp: false, ct);

        pracReq.Status = "Approved";
        pracReq.ReviewedByAdminUserId = request.AdminUserId;
        pracReq.ReviewedByDisplayName = pracReviewerName;
        pracReq.ReviewedByEmail = pracReviewerEmail;
        pracReq.ReviewedAtUtc = now;
        pracReq.ReviewerNotes = string.IsNullOrWhiteSpace(request.Notes) ? pracReq.ReviewerNotes : request.Notes.Trim();

        DirectoryVerificationHelper.StagePractitionerIdentityUpdated(
            interopPublisher, upsertedPrac, upsertedAff, pracReq.Facility, pracReq.Id);

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            pracReq.TenantId,
            request.AdminUserId,
            request.AdminName,
            "PlatformAdmin",
            "practitioner-approved",
            new
            {
                requestId = pracReq.Id,
                facilityId = pracReq.FacilityId,
                practitionerId = upsertedPrac.Id,
                clinicStaffMemberId = pracReq.ClinicStaffMemberId,
                normalizedPrcLicenseNo = upsertedPrac.NormalizedPrcLicenseNo,
                notes = request.Notes?.Trim()
            });

        await db.SaveChangesAsync(ct);

        return new ApproveVerificationResult(
            pracReq.Id,
            "Practitioner",
            pracReq.Status,
            pracReq.FacilityId,
            [upsertedPrac.Id],
            now);
    }

    private static async Task<Practitioner?> ResolveExistingCanonicalPractitionerAsync(
        IApplicationDbContext db,
        PractitionerVerificationRequest pracReq,
        CancellationToken ct)
    {
        if (pracReq.PractitionerId.HasValue)
        {
            var linked = await db.Practitioners
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == pracReq.PractitionerId.Value && !p.IsDeleted, ct);
            if (linked is not null)
            {
                if (linked.MergedIntoPractitionerId is { } mergedId)
                {
                    return await db.Practitioners
                        .AsNoTracking()
                        .FirstOrDefaultAsync(p => p.Id == mergedId && !p.IsDeleted, ct)
                        ?? linked;
                }

                return linked;
            }
        }

        var professionKind = DirectoryVerificationHelper.NormalizeProfessionOrFallback(pracReq.ProfessionKind);
        var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(pracReq.NormalizedPrcLicenseNo, pracReq.SubmittedPrcLicenseNo);

        return await db.Practitioners
            .AsNoTracking()
            .FirstOrDefaultAsync(p => !p.IsDeleted
                                      && p.MergedIntoPractitionerId == null
                                      && p.ProfessionKind == professionKind
                                      && p.NormalizedPrcLicenseNo == normalizedPrc, ct);
    }
}

public sealed class RejectVerificationRequestCommandHandler(
    IApplicationDbContext db,
    IFacilityProvisioningPublisher provisioningPublisher,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider)
    : IRequestHandler<RejectVerificationRequestCommand, RejectVerificationResult>
{
    public async Task<RejectVerificationResult> Handle(RejectVerificationRequestCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ArgumentException("A rejection reason is required.", nameof(request.Reason));

        var reason = request.Reason.Trim();
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var facilityReq = await db.FacilityVerificationRequests
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .Include(r => r.PractitionerRequests)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct);

        if (facilityReq is not null)
        {
            if (facilityReq.Status != "PendingReview")
            {
                throw new CodedConflictException(
                    "verification_request_not_pending",
                    $"Facility verification request has already been {facilityReq.Status}.");
            }

            var (reviewerName, reviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
                db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

            facilityReq.Status = "Rejected";
            facilityReq.ReviewedByAdminUserId = request.AdminUserId;
            facilityReq.ReviewedByDisplayName = reviewerName;
            facilityReq.ReviewedByEmail = reviewerEmail;
            facilityReq.ReviewedAtUtc = now;
            facilityReq.ReviewerNotes = string.IsNullOrWhiteSpace(request.Notes) ? reason : request.Notes.Trim();

            foreach (var child in facilityReq.PractitionerRequests.Where(c => !c.IsDeleted && c.Status is "PendingReview" or "AwaitingOtp"))
            {
                child.Status = "Rejected";
                child.ReviewedByAdminUserId = request.AdminUserId;
                child.ReviewedByDisplayName = reviewerName;
                child.ReviewedByEmail = reviewerEmail;
                child.ReviewedAtUtc = now;
                child.ReviewerNotes = reason;
            }

            var facility = facilityReq.Facility;
            facility.PlatformVerificationStatus = PlatformVerificationStatus.Rejected;
            facility.RejectionReason = reason;
            facility.LatestVerificationRequestId = facilityReq.Id;
            facility.UpdatedAt = now;

            if (!facility.IsDeleted && facility.Status is FacilityStatus.Provisioning or FacilityStatus.Active)
            {
                interopPublisher.Enqueue(
                    InteropTypes.FacilityVerificationRejected,
                    Party.Portal,
                    Party.ForFacility(facilityReq.TenantId.ToString(), facility.Id.ToString(), facility.FacilityType),
                    facilityReq.Id,
                    new FacilityVerificationRejectedPayload
                    {
                        RequestId = facilityReq.Id,
                        TenantId = facilityReq.TenantId.ToString(),
                        FacilityId = facility.Id,
                        Status = "Rejected",
                        Reason = reason,
                        ReviewedByAdminUserId = request.AdminUserId,
                        ReviewedAtUtc = now
                    });
            }

            await provisioningPublisher.StageDirectoryUpdateAsync(facilityReq.Tenant, facility, ct);

            DirectoryVerificationHelper.StageAuditEntry(
                db,
                facilityReq.TenantId,
                request.AdminUserId,
                request.AdminName,
                "PlatformAdmin",
                "facility-rejected",
                new
                {
                    requestId = facilityReq.Id,
                    facilityId = facility.Id,
                    submissionNumber = facilityReq.SubmissionNumber,
                    reason
                });

            await db.SaveChangesAsync(ct);

            return new RejectVerificationResult(
                facilityReq.Id,
                "Facility",
                facilityReq.Status,
                facility.Id,
                reason,
                now);
        }

        var pracReq = await db.PractitionerVerificationRequests
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .Include(r => r.Practitioner)
            .Include(r => r.Affiliation)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct)
            ?? throw new KeyNotFoundException($"Verification request '{request.RequestId}' was not found.");

        if (pracReq.Status is not ("PendingReview" or "AwaitingOtp"))
        {
            throw new CodedConflictException(
                "verification_request_not_pending",
                $"Practitioner verification request has already been {pracReq.Status}.");
        }

        var (pracReviewerName, pracReviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
            db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

        pracReq.Status = "Rejected";
        pracReq.ReviewedByAdminUserId = request.AdminUserId;
        pracReq.ReviewedByDisplayName = pracReviewerName;
        pracReq.ReviewedByEmail = pracReviewerEmail;
        pracReq.ReviewedAtUtc = now;
        pracReq.ReviewerNotes = string.IsNullOrWhiteSpace(request.Notes) ? reason : request.Notes.Trim();

        // Only revoke a local pending affiliation on rejection; never downgrade an already-verified canonical practitioner at other clinics.
        if (pracReq.Affiliation is not null && pracReq.Affiliation.AffiliationStatus != "Active")
        {
            pracReq.Affiliation.AffiliationStatus = "Rejected";
        }

        if (!pracReq.Facility.IsDeleted && pracReq.Facility.Status is FacilityStatus.Provisioning or FacilityStatus.Active)
        {
            interopPublisher.Enqueue(
                InteropTypes.PractitionerVerificationRevoked,
                Party.Portal,
                Party.ForFacility(pracReq.TenantId.ToString(), pracReq.FacilityId.ToString(), pracReq.Facility.FacilityType),
                pracReq.Id,
                new PractitionerVerificationRevokedPayload
                {
                    PractitionerId = pracReq.Practitioner is { VerificationStatus: PractitionerVerificationLevel.Verified } ? null : pracReq.PractitionerId,
                    TenantId = pracReq.TenantId.ToString(),
                    FacilityId = pracReq.FacilityId,
                    ClinicStaffMemberId = pracReq.ClinicStaffMemberId,
                    ProfessionKind = pracReq.ProfessionKind,
                    NormalizedPrcLicenseNo = pracReq.NormalizedPrcLicenseNo,
                    NewStatus = PractitionerVerificationLevel.Rejected,
                    Reason = reason,
                    RevokedAtUtc = now
                });
        }

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            pracReq.TenantId,
            request.AdminUserId,
            request.AdminName,
            "PlatformAdmin",
            "practitioner-rejected",
            new
            {
                requestId = pracReq.Id,
                facilityId = pracReq.FacilityId,
                clinicStaffMemberId = pracReq.ClinicStaffMemberId,
                normalizedPrcLicenseNo = pracReq.NormalizedPrcLicenseNo,
                reason
            });

        await db.SaveChangesAsync(ct);

        return new RejectVerificationResult(
            pracReq.Id,
            "Practitioner",
            pracReq.Status,
            pracReq.FacilityId,
            reason,
            now);
    }
}

public sealed class SuspendPractitionerCommandHandler(
    IApplicationDbContext db,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider)
    : IRequestHandler<SuspendPractitionerCommand, SuspendPractitionerResult>
{
    public async Task<SuspendPractitionerResult> Handle(SuspendPractitionerCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ArgumentException("A compliance reason is required to suspend a practitioner.", nameof(request.Reason));

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var reason = request.Reason.Trim();

        var practitioner = await db.Practitioners
            .Include(p => p.Affiliations)
                .ThenInclude(a => a.Facility)
            .FirstOrDefaultAsync(p => p.Id == request.PractitionerId && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException($"Practitioner '{request.PractitionerId}' was not found.");

        var targetPractitionerIds = new HashSet<Guid> { request.PractitionerId, practitioner.Id };
        if (practitioner.MergedIntoPractitionerId.HasValue)
        {
            var canonical = await db.Practitioners
                .Include(p => p.Affiliations)
                    .ThenInclude(a => a.Facility)
                .FirstOrDefaultAsync(p => p.Id == practitioner.MergedIntoPractitionerId.Value && !p.IsDeleted, ct);
            if (canonical is not null)
            {
                practitioner = canonical;
                targetPractitionerIds.Add(canonical.Id);
            }
        }

        var (reviewerName, reviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
            db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

        practitioner.VerificationStatus = PractitionerVerificationLevel.Suspended;
        practitioner.UpdatedAt = now;

        var activeAffiliations = practitioner.Affiliations
            .Where(a => !a.IsDeleted && a.AffiliationStatus == "Active")
            .ToList();

        foreach (var affiliation in activeAffiliations)
        {
            affiliation.AffiliationStatus = "Suspended";
            affiliation.UpdatedAt = now;
        }

        // Unconfirmed pending affiliations (e.g. AwaitingConfirmation via OTP) must be rejected rather
        // than suspended so later reinstatement cannot promote unconfirmed affiliations to Active.
        foreach (var pendingAff in practitioner.Affiliations.Where(
                     a => !a.IsDeleted
                          && a.AffiliationStatus is not ("Active" or "Suspended" or "Withdrawn" or "Rejected")))
        {
            pendingAff.AffiliationStatus = "Rejected";
            pendingAff.UpdatedAt = now;
        }

        var normProf = DirectoryVerificationHelper.NormalizeProfessionOrFallback(practitioner.ProfessionKind);
        var normPrc = practitioner.NormalizedPrcLicenseNo;

        var candidateOpenRequests = await db.PractitionerVerificationRequests
            .Include(r => r.Facility)
            .Where(r => !r.IsDeleted
                        && (r.Status == "PendingReview" || r.Status == "AwaitingOtp")
                        && ((r.PractitionerId.HasValue && targetPractitionerIds.Contains(r.PractitionerId.Value))
                            || (!string.IsNullOrWhiteSpace(normPrc) && r.NormalizedPrcLicenseNo == normPrc)))
            .ToListAsync(ct);

        var openRequests = candidateOpenRequests
            .Where(r => (r.PractitionerId.HasValue && targetPractitionerIds.Contains(r.PractitionerId.Value))
                        || string.Equals(
                            DirectoryVerificationHelper.NormalizeProfessionOrFallback(r.ProfessionKind),
                            normProf,
                            StringComparison.OrdinalIgnoreCase))
            .ToList();

        foreach (var openReq in openRequests)
        {
            openReq.PractitionerId ??= practitioner.Id;
            openReq.Status = "Rejected";
            openReq.OtpTokenHash = null;
            openReq.OtpExpiresAtUtc = null;
            openReq.ReviewedByAdminUserId = request.AdminUserId;
            openReq.ReviewedByDisplayName = reviewerName;
            openReq.ReviewedByEmail = reviewerEmail;
            openReq.ReviewedAtUtc = now;
            openReq.ReviewerNotes = $"Practitioner suspended: {reason}";
            openReq.UpdatedAt = now;
        }

        DirectoryVerificationHelper.StagePractitionerRevokedForAll(
            interopPublisher,
            practitioner,
            activeAffiliations.Select(a => (a, (Facility?)a.Facility)),
            PractitionerVerificationLevel.Suspended,
            reason,
            now,
            practitioner.Id);

        var coveredFacilityStaffKeys = activeAffiliations
            .Select(a => (a.FacilityId, a.ClinicStaffMemberId))
            .ToHashSet();

        foreach (var openReq in openRequests)
        {
            if (coveredFacilityStaffKeys.Contains((openReq.FacilityId, openReq.ClinicStaffMemberId)))
                continue;

            coveredFacilityStaffKeys.Add((openReq.FacilityId, openReq.ClinicStaffMemberId));

            var fac = openReq.Facility;
            if (fac is null || fac.IsDeleted || fac.Status is FacilityStatus.Suspended or FacilityStatus.Failed)
                continue;

            interopPublisher.Enqueue(
                InteropTypes.PractitionerVerificationRevoked,
                Party.Portal,
                Party.ForFacility(openReq.TenantId.ToString(), openReq.FacilityId.ToString(), fac.FacilityType),
                practitioner.Id,
                new PractitionerVerificationRevokedPayload
                {
                    PractitionerId = practitioner.Id,
                    TenantId = openReq.TenantId.ToString(),
                    FacilityId = openReq.FacilityId,
                    ClinicStaffMemberId = openReq.ClinicStaffMemberId,
                    ProfessionKind = practitioner.ProfessionKind,
                    NormalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
                    NewStatus = PractitionerVerificationLevel.Suspended,
                    Reason = reason,
                    RevokedAtUtc = now
                });
        }

        var affectedTenantIds = activeAffiliations
            .Select(a => a.TenantId)
            .Concat(openRequests.Select(r => r.TenantId))
            .Distinct()
            .ToList();

        foreach (var tenantId in affectedTenantIds)
        {
            DirectoryVerificationHelper.StageAuditEntry(
                db,
                tenantId,
                request.AdminUserId,
                request.AdminName,
                "PlatformAdmin",
                "practitioner-suspended",
                new
                {
                    practitionerId = practitioner.Id,
                    professionKind = practitioner.ProfessionKind,
                    normalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
                    reason,
                    closedPendingRequestIds = openRequests.Where(r => r.TenantId == tenantId).Select(r => r.Id).ToList()
                });
        }

        await db.SaveChangesAsync(ct);

        return new SuspendPractitionerResult(
            practitioner.Id,
            practitioner.VerificationStatus,
            activeAffiliations.Count,
            now,
            openRequests.Count);
    }
}

public sealed class ReinstatePractitionerCommandHandler(
    IApplicationDbContext db,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider)
    : IRequestHandler<ReinstatePractitionerCommand, ReinstatePractitionerResult>
{
    public async Task<ReinstatePractitionerResult> Handle(ReinstatePractitionerCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ArgumentException("A compliance reason is required to reinstate a practitioner.", nameof(request.Reason));

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var reason = request.Reason.Trim();

        var practitioner = await db.Practitioners
            .Include(p => p.Affiliations)
                .ThenInclude(a => a.Facility)
            .FirstOrDefaultAsync(p => p.Id == request.PractitionerId && !p.IsDeleted, ct)
            ?? throw new KeyNotFoundException($"Practitioner '{request.PractitionerId}' was not found.");

        if (practitioner.MergedIntoPractitionerId.HasValue)
        {
            var canonical = await db.Practitioners
                .Include(p => p.Affiliations)
                    .ThenInclude(a => a.Facility)
                .FirstOrDefaultAsync(p => p.Id == practitioner.MergedIntoPractitionerId.Value && !p.IsDeleted, ct);
            if (canonical is not null)
                practitioner = canonical;
        }

        if (practitioner.VerificationStatus != PractitionerVerificationLevel.Suspended)
        {
            throw new CodedConflictException(
                "practitioner_not_suspended",
                $"Practitioner is currently {practitioner.VerificationStatus} and cannot be reinstated.");
        }

        practitioner.VerificationStatus = PractitionerVerificationLevel.Verified;
        practitioner.VerifiedAtUtc ??= now;
        practitioner.VerifiedByAdminUserId = request.AdminUserId;
        practitioner.UpdatedAt = now;

        var suspendedAffiliations = practitioner.Affiliations
            .Where(a => !a.IsDeleted && a.AffiliationStatus == "Suspended")
            .ToList();

        var stagedAnyIdentityUpdate = false;
        foreach (var affiliation in suspendedAffiliations)
        {
            affiliation.AffiliationStatus = "Active";
            affiliation.UpdatedAt = now;

            if (affiliation.Facility is not null)
            {
                DirectoryVerificationHelper.StagePractitionerIdentityUpdated(
                    interopPublisher, practitioner, affiliation, affiliation.Facility, practitioner.Id);
                stagedAnyIdentityUpdate = true;
            }
        }

        if (!stagedAnyIdentityUpdate)
        {
            interopPublisher.Enqueue(
                InteropTypes.PractitionerIdentityUpdated,
                Party.Portal,
                new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
                practitioner.Id,
                new PractitionerIdentityUpdatedPayload
                {
                    PractitionerId = practitioner.Id,
                    MergedIntoPractitionerId = practitioner.MergedIntoPractitionerId,
                    ProfessionKind = practitioner.ProfessionKind,
                    NormalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
                    DisplayPrcLicenseNo = practitioner.DisplayPrcLicenseNo,
                    PrcExpiryDate = practitioner.PrcExpiryDate,
                    VerificationLevel = practitioner.VerificationStatus,
                    FirstName = practitioner.FirstName,
                    LastName = practitioner.LastName,
                    Title = practitioner.Title,
                    PrimarySpecialty = practitioner.PrimarySpecialty,
                    PublicBio = practitioner.PublicBio,
                    AvatarUrl = practitioner.AvatarUrl,
                    VerifiedAtUtc = practitioner.VerifiedAtUtc
                });
        }

        foreach (var tenantId in suspendedAffiliations.Select(a => a.TenantId).Distinct())
        {
            DirectoryVerificationHelper.StageAuditEntry(
                db,
                tenantId,
                request.AdminUserId,
                request.AdminName,
                "PlatformAdmin",
                "practitioner-reinstated",
                new
                {
                    practitionerId = practitioner.Id,
                    professionKind = practitioner.ProfessionKind,
                    normalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
                    reason
                });
        }

        await db.SaveChangesAsync(ct);

        return new ReinstatePractitionerResult(
            practitioner.Id,
            practitioner.VerificationStatus,
            suspendedAffiliations.Count,
            now);
    }
}

public sealed class GetAffiliationConfirmationQueryHandler(
    IApplicationDbContext db,
    TimeProvider timeProvider)
    : IRequestHandler<GetAffiliationConfirmationQuery, AffiliationConfirmationInfoDto?>
{
    public async Task<AffiliationConfirmationInfoDto?> Handle(GetAffiliationConfirmationQuery request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
            return null;

        var tokenHash = DirectoryVerificationHelper.HashSecret(request.Token);
        var pracReq = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Include(r => r.Facility)
            .Include(r => r.Practitioner)
            .FirstOrDefaultAsync(r => r.OtpTokenHash == tokenHash && !r.IsDeleted, ct);

        if (pracReq is null)
            return null;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        var displayName = pracReq.Practitioner is not null
            ? DirectoryVerificationHelper.FormatDisplayName(pracReq.Practitioner.Title, pracReq.Practitioner.FirstName, pracReq.Practitioner.LastName)
            : DirectoryVerificationHelper.FormatDisplayName(snap?.Title, snap?.FirstName ?? string.Empty, snap?.LastName ?? string.Empty);

        var isExpired = pracReq.OtpExpiresAtUtc.HasValue && pracReq.OtpExpiresAtUtc.Value <= now;
        var alreadyConfirmed = pracReq.Status == "Approved";

        return new AffiliationConfirmationInfoDto(
            RequestId: pracReq.Id,
            PractitionerId: pracReq.PractitionerId,
            PractitionerName: displayName,
            ProfessionKind: pracReq.ProfessionKind,
            FacilityId: pracReq.FacilityId,
            FacilityName: pracReq.Facility.Name,
            Specialty: snap?.Specialty ?? pracReq.Practitioner?.PrimarySpecialty,
            Status: pracReq.Status,
            ExpiresAtUtc: pracReq.OtpExpiresAtUtc,
            AlreadyConfirmed: alreadyConfirmed,
            IsExpired: isExpired && !alreadyConfirmed,
            RequiresOtpCode: !string.IsNullOrWhiteSpace(snap?.OtpCodeHash));
    }
}

public sealed class ConfirmPractitionerAffiliationCommandHandler(
    IApplicationDbContext db,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider)
    : IRequestHandler<ConfirmPractitionerAffiliationCommand, AffiliationConfirmationResultDto>
{
    public async Task<AffiliationConfirmationResultDto> Handle(ConfirmPractitionerAffiliationCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
            throw new ArgumentException("Confirmation token is required.", nameof(request.Token));

        var tokenHash = DirectoryVerificationHelper.HashSecret(request.Token);
        var pracReq = await db.PractitionerVerificationRequests
            .Include(r => r.Facility)
            .Include(r => r.Practitioner)
            .Include(r => r.Affiliation)
            .FirstOrDefaultAsync(r => r.OtpTokenHash == tokenHash && !r.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Invalid or unrecognized affiliation confirmation token.");

        var now = timeProvider.GetUtcNow().UtcDateTime;

        if (pracReq.Status == "Approved" && pracReq.PractitionerId.HasValue && pracReq.AffiliationId.HasValue)
        {
            return new AffiliationConfirmationResultDto(
                pracReq.Id,
                pracReq.PractitionerId.Value,
                pracReq.AffiliationId.Value,
                pracReq.FacilityId,
                pracReq.Facility.Name,
                pracReq.Affiliation?.AffiliationStatus ?? "Active",
                AlreadyConfirmed: true,
                pracReq.Affiliation?.ConfirmedViaOtpAtUtc ?? pracReq.ReviewedAtUtc ?? now);
        }

        if (pracReq.Status != "AwaitingOtp")
        {
            throw new CodedConflictException(
                "affiliation_confirmation_unavailable",
                $"Affiliation confirmation is no longer active (current status: {pracReq.Status}).");
        }

        if (pracReq.OtpExpiresAtUtc.HasValue && pracReq.OtpExpiresAtUtc.Value <= now)
        {
            throw new InvalidOperationException("This confirmation link has expired.");
        }

        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        if (!string.IsNullOrWhiteSpace(request.OtpCode))
        {
            var expectedCodeHash = snap?.OtpCodeHash;
            var providedCodeHash = DirectoryVerificationHelper.HashSecret(request.OtpCode);
            if (string.IsNullOrWhiteSpace(expectedCodeHash) || !string.Equals(expectedCodeHash, providedCodeHash, StringComparison.Ordinal))
            {
                throw new ArgumentException("The verification code does not match.", nameof(request.OtpCode));
            }
        }

        var (practitioner, affiliation) = await DirectoryVerificationHelper.UpsertVerifiedPractitionerAndAffiliationAsync(
            db, pracReq, snap, "practitioner-otp", now, confirmedViaOtp: true, ct);

        pracReq.Status = "Approved";
        pracReq.ReviewedByAdminUserId = "practitioner-otp";
        pracReq.ReviewedByDisplayName = "Practitioner (OTP Confirmation)";
        pracReq.ReviewedByEmail = !string.IsNullOrWhiteSpace(practitioner.VerificationContact)
            ? practitioner.VerificationContact
            : pracReq.VerificationContact;
        pracReq.ReviewedAtUtc = now;
        pracReq.ReviewerNotes = "Confirmed by practitioner via affiliation confirmation.";

        DirectoryVerificationHelper.StagePractitionerIdentityUpdated(
            interopPublisher, practitioner, affiliation, pracReq.Facility, pracReq.Id);

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            pracReq.TenantId,
            practitioner.Id.ToString(),
            DirectoryVerificationHelper.FormatDisplayName(practitioner.Title, practitioner.FirstName, practitioner.LastName),
            "Practitioner",
            "affiliation-confirmed",
            new
            {
                requestId = pracReq.Id,
                practitionerId = practitioner.Id,
                affiliationId = affiliation.Id,
                facilityId = pracReq.FacilityId
            });

        await db.SaveChangesAsync(ct);

        return new AffiliationConfirmationResultDto(
            pracReq.Id,
            practitioner.Id,
            affiliation.Id,
            pracReq.FacilityId,
            pracReq.Facility.Name,
            affiliation.AffiliationStatus,
            AlreadyConfirmed: false,
            now);
    }
}

public sealed class ResendAffiliationConfirmationCommandHandler(
    IApplicationDbContext db,
    TimeProvider timeProvider,
    ILogger<ResendAffiliationConfirmationCommandHandler> logger,
    INotificationService? notifications = null,
    IFrontendUrlProvider? frontendUrlProvider = null)
    : IRequestHandler<ResendAffiliationConfirmationCommand, ResendAffiliationConfirmationResult>
{
    public async Task<ResendAffiliationConfirmationResult> Handle(ResendAffiliationConfirmationCommand request, CancellationToken ct)
    {
        var pracReq = await db.PractitionerVerificationRequests
            .Include(r => r.Facility)
            .Include(r => r.Practitioner)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct)
            ?? throw new KeyNotFoundException($"Practitioner verification request '{request.RequestId}' was not found.");

        if (!string.Equals(pracReq.Status, "AwaitingOtp", StringComparison.Ordinal))
        {
            throw new CodedConflictException(
                "verification_request_not_awaiting_otp",
                $"Cannot resend affiliation confirmation because this request is currently '{pracReq.Status}'.");
        }

        var contact = !string.IsNullOrWhiteSpace(pracReq.VerificationContact)
            ? pracReq.VerificationContact.Trim()
            : pracReq.Practitioner?.VerificationContact?.Trim();

        if (!DirectoryVerificationHelper.IsPureEmailAddress(contact))
        {
            throw new ArgumentException(
                "No valid verification email address is configured on this request. Ask the clinic to update the practitioner's Verification Contact email.");
        }

        if (notifications is null)
        {
            throw new InvalidOperationException("Email notifications are not configured on this server.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var rawToken = TokenGenerator.GenerateSecureToken(32);
        var otpCode = DirectoryVerificationHelper.GenerateOtpCode();
        var otpTokenHash = DirectoryVerificationHelper.HashSecret(rawToken);
        var otpCodeHash = DirectoryVerificationHelper.HashSecret(otpCode);
        var otpExpiresAt = now.AddHours(DirectoryVerificationHelper.AffiliationOtpTtlHours);

        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        if (snap is not null)
        {
            pracReq.SubmittedSnapshotJson = JsonSerializer.Serialize(snap with { OtpCodeHash = otpCodeHash }, InteropJson.Options);
        }

        pracReq.OtpTokenHash = otpTokenHash;
        pracReq.OtpExpiresAtUtc = otpExpiresAt;
        pracReq.UpdatedAt = now;

        var (reviewerName, reviewerEmail) = await VerificationReviewerLookup.ResolveAsync(
            db, request.AdminUserId, request.AdminName, request.AdminEmail, ct);

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            pracReq.TenantId,
            request.AdminUserId,
            reviewerName ?? request.AdminName,
            "PlatformAdmin",
            "affiliation-otp-resent",
            new
            {
                requestId = pracReq.Id,
                facilityId = pracReq.FacilityId,
                clinicStaffMemberId = pracReq.ClinicStaffMemberId,
                sentTo = contact,
                expiresAtUtc = otpExpiresAt,
                resentByEmail = reviewerEmail
            });

        await db.SaveChangesAsync(ct);

        var displayName = pracReq.Practitioner is not null
            ? DirectoryVerificationHelper.FormatDisplayName(pracReq.Practitioner.Title, pracReq.Practitioner.FirstName, pracReq.Practitioner.LastName)
            : DirectoryVerificationHelper.FormatDisplayName(snap?.Title, snap?.FirstName ?? string.Empty, snap?.LastName ?? string.Empty);

        DirectoryVerificationHelper.TryEnqueueAffiliationConfirmationEmail(
            notifications,
            frontendUrlProvider,
            contact,
            string.IsNullOrWhiteSpace(displayName) ? "Clinician" : displayName,
            pracReq.Facility.Name,
            pracReq.ProfessionKind,
            rawToken,
            otpCode,
            pracReq.Id,
            logger);

        return new ResendAffiliationConfirmationResult(
            pracReq.Id,
            contact!,
            otpExpiresAt,
            now);
    }
}

internal static class VerificationReviewerLookup
{
    public static async Task<(string? DisplayName, string? Email)> ResolveAsync(
        IApplicationDbContext db,
        string adminUserId,
        string? fallbackName,
        string? fallbackEmail,
        CancellationToken ct)
    {
        var cleanName = string.IsNullOrWhiteSpace(fallbackName) ? null : fallbackName.Trim();
        var cleanEmail = string.IsNullOrWhiteSpace(fallbackEmail) ? null : fallbackEmail.Trim();

        if (cleanName is not null && cleanEmail is not null)
            return (cleanName, cleanEmail);

        if (!string.IsNullOrWhiteSpace(adminUserId))
        {
            var id = adminUserId.Trim();
            Guid.TryParse(id, out var adminGuid);
            var admin = await db.AdminUsers
                .AsNoTracking()
                .Where(a => !a.IsDeleted && (a.ClerkUserId == id || a.Email == id || (adminGuid != Guid.Empty && a.Id == adminGuid)))
                .Select(a => new { a.FullName, a.Email })
                .FirstOrDefaultAsync(ct);

            if (admin is not null)
            {
                cleanName ??= string.IsNullOrWhiteSpace(admin.FullName) ? null : admin.FullName.Trim();
                cleanEmail ??= string.IsNullOrWhiteSpace(admin.Email) ? null : admin.Email.Trim();
            }
        }

        return (cleanName, cleanEmail);
    }

    internal static bool HasJsonPropertyKey(string? json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json))
            return false;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }
}
