using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    DateTime RevokedAtUtc);

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

public sealed record ApproveVerificationRequestCommand(
    Guid RequestId,
    string AdminUserId,
    string AdminName,
    string? Notes = null,
    IReadOnlyList<Guid>? PractitionerRequestIds = null,
    bool ApproveBundledPractitioners = true) : IRequest<ApproveVerificationResult>;

public sealed record RejectVerificationRequestCommand(
    Guid RequestId,
    string AdminUserId,
    string AdminName,
    string Reason,
    string? Notes = null) : IRequest<RejectVerificationResult>;

public sealed record SuspendPractitionerCommand(
    Guid PractitionerId,
    string AdminUserId,
    string AdminName,
    string? Reason = null) : IRequest<SuspendPractitionerResult>;

public sealed record GetAffiliationConfirmationQuery(string Token) : IRequest<AffiliationConfirmationInfoDto?>;

public sealed record ConfirmPractitionerAffiliationCommand(
    string Token,
    string? OtpCode = null) : IRequest<AffiliationConfirmationResultDto>;

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

            facilityReq.Status = "Approved";
            facilityReq.ReviewedByAdminUserId = request.AdminUserId;
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
                if (!string.IsNullOrWhiteSpace(snapshot.Classification))
                    facility.Classification = snapshot.Classification.Trim();
                if (!string.IsNullOrWhiteSpace(snapshot.OperatingHours))
                    facility.OperatingHours = snapshot.OperatingHours.Trim();
                if (!string.IsNullOrWhiteSpace(snapshot.ContactNumber))
                    facility.ContactNumber = snapshot.ContactNumber.Trim();
                if (!string.IsNullOrWhiteSpace(snapshot.ContactEmail))
                    facility.ContactEmail = snapshot.ContactEmail.Trim();
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

                    var childSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(childReq.SubmittedSnapshotJson);
                    var (practitioner, affiliation) = await DirectoryVerificationHelper.UpsertVerifiedPractitionerAndAffiliationAsync(
                        db, childReq, childSnap, request.AdminUserId, now, confirmedViaOtp: false, ct);

                    childReq.Status = "Approved";
                    childReq.ReviewedByAdminUserId = request.AdminUserId;
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

        var pracSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        var (upsertedPrac, upsertedAff) = await DirectoryVerificationHelper.UpsertVerifiedPractitionerAndAffiliationAsync(
            db, pracReq, pracSnap, request.AdminUserId, now, confirmedViaOtp: false, ct);

        pracReq.Status = "Approved";
        pracReq.ReviewedByAdminUserId = request.AdminUserId;
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

            facilityReq.Status = "Rejected";
            facilityReq.ReviewedByAdminUserId = request.AdminUserId;
            facilityReq.ReviewedAtUtc = now;
            facilityReq.ReviewerNotes = string.IsNullOrWhiteSpace(request.Notes) ? reason : request.Notes.Trim();

            foreach (var child in facilityReq.PractitionerRequests.Where(c => !c.IsDeleted && c.Status is "PendingReview" or "AwaitingOtp"))
            {
                child.Status = "Rejected";
                child.ReviewedByAdminUserId = request.AdminUserId;
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

        pracReq.Status = "Rejected";
        pracReq.ReviewedByAdminUserId = request.AdminUserId;
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
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var reason = string.IsNullOrWhiteSpace(request.Reason)
            ? "Verification suspended by platform administrator."
            : request.Reason.Trim();

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

        practitioner.VerificationStatus = PractitionerVerificationLevel.Suspended;
        practitioner.UpdatedAt = now;

        var activeAffiliations = practitioner.Affiliations
            .Where(a => !a.IsDeleted && a.AffiliationStatus != "Withdrawn")
            .ToList();

        foreach (var affiliation in activeAffiliations)
        {
            affiliation.AffiliationStatus = "Suspended";
            affiliation.UpdatedAt = now;
        }

        DirectoryVerificationHelper.StagePractitionerRevokedForAll(
            interopPublisher,
            practitioner,
            activeAffiliations.Select(a => (a, (Facility?)a.Facility)),
            PractitionerVerificationLevel.Suspended,
            reason,
            now,
            practitioner.Id);

        foreach (var tenantId in activeAffiliations.Select(a => a.TenantId).Distinct())
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
                    reason
                });
        }

        await db.SaveChangesAsync(ct);

        return new SuspendPractitionerResult(
            practitioner.Id,
            practitioner.VerificationStatus,
            activeAffiliations.Count,
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
            RequiresOtpCode: false);
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
