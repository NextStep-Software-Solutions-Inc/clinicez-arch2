using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>practitioner.verification.requested</c> (<c>InteropTypes.PractitionerVerificationRequested</c>).
/// Creates a verification request, detects PRC identity matches/mismatches against canonical practitioners,
/// sets <c>AwaitingOtp</c> with a hashed confirmation token for clean verified PRC matches, and writes an audit entry.
/// </summary>
public sealed class PractitionerVerificationRequestedHandler(
    IApplicationDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<PractitionerVerificationRequestedHandler> logger,
    INotificationService? notifications = null,
    IFrontendUrlProvider? frontendUrlProvider = null,
    IInteropPublisher? interopPublisher = null) : IInteropHandler<PractitionerVerificationRequestedPayload>
{
    public async Task HandleAsync(PractitionerVerificationRequestedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring practitioner.verification.requested from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var facility = await dbContext.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId && !f.IsDeleted, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring practitioner.verification.requested for unknown facility {FacilityId}.", payload.FacilityId);
            return;
        }

        var requestId = payload.RequestId != Guid.Empty ? payload.RequestId : Guid.NewGuid();
        if (payload.RequestId != Guid.Empty)
        {
            var duplicate = await dbContext.PractitionerVerificationRequests
                .AsNoTracking()
                .AnyAsync(r => r.Id == requestId && !r.IsDeleted, ct);
            if (duplicate)
            {
                logger.LogInformation("Ignoring duplicate practitioner.verification.requested {RequestId}.", requestId);
                return;
            }
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var submittedAt = payload.SubmittedAtUtc == default ? now : payload.SubmittedAtUtc;

        var professionKind = DirectoryVerificationHelper.NormalizeProfessionOrFallback(payload.ProfessionKind);
        var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(payload.NormalizedPrcLicenseNo, payload.SubmittedPrcLicenseNo);

        var priorForStaff = await dbContext.PractitionerVerificationRequests
            .Where(r => r.FacilityId == facility.Id
                        && r.ClinicStaffMemberId == payload.ClinicStaffMemberId
                        && !r.IsDeleted)
            .ToListAsync(ct);

        foreach (var oldReq in priorForStaff.Where(r => r.Status is "PendingReview" or "AwaitingOtp"))
        {
            var wasAwaitingOtp = oldReq.Status == "AwaitingOtp";
            oldReq.Status = "Superseded";
            oldReq.OtpTokenHash = null;
            oldReq.OtpExpiresAtUtc = null;
            oldReq.UpdatedAt = now;

            if (wasAwaitingOtp)
            {
                var aff = dbContext.PractitionerAffiliations.Local.FirstOrDefault(
                        a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldReq.ClinicStaffMemberId)
                    ?? await dbContext.PractitionerAffiliations.FirstOrDefaultAsync(
                        a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldReq.ClinicStaffMemberId, ct);
                if (aff is not null && aff.AffiliationStatus == "AwaitingConfirmation")
                {
                    aff.AffiliationStatus = "Withdrawn";
                    aff.WithdrawnAtUtc = now;
                    aff.UpdatedAt = now;
                }
            }
        }

        var nextSubmissionNumber = (priorForStaff.Select(r => (int?)r.SubmissionNumber).Max() ?? 0) + 1;

        var matched = await dbContext.Practitioners
            .FirstOrDefaultAsync(p => !p.IsDeleted
                                      && p.MergedIntoPractitionerId == null
                                      && p.ProfessionKind == professionKind
                                      && p.NormalizedPrcLicenseNo == normalizedPrc, ct);

        var status = "PendingReview";
        string? otpTokenHash = null;
        DateTime? otpExpiresAt = null;
        string? otpCodeHash = null;
        string? rawTokenForEmail = null;
        string? otpCodeForEmail = null;
        Guid? affiliationId = null;
        bool hasNameMismatch = false;
        var matchedName = matched is null
            ? null
            : DirectoryVerificationHelper.FormatDisplayName(matched.Title, matched.FirstName, matched.LastName);

        var rawRequestKind = payload.RequestKind?.Trim();
        var isPrcUpdateKind = string.Equals(rawRequestKind, "PrcUpdate", StringComparison.OrdinalIgnoreCase);
        var normalizedRequestKind = string.IsNullOrWhiteSpace(rawRequestKind)
            ? "Initial"
            : isPrcUpdateKind
                ? "Resubmission"
                : rawRequestKind;
        var hasPriorApprovalAtFacility = priorForStaff.Any(r => r.Status == "Approved");
        var requiresGovernanceReview = isPrcUpdateKind || hasPriorApprovalAtFacility;

        if (matched is not null && matched.VerificationStatus == PractitionerVerificationLevel.Verified)
        {
            if (!PractitionerIdentity.IsCompatibleNameMatch(matched.FirstName, matched.LastName, payload.FirstName, payload.LastName))
            {
                hasNameMismatch = true;
            }
            else if (!requiresGovernanceReview)
            {
                status = "AwaitingOtp";
                rawTokenForEmail = TokenGenerator.GenerateSecureToken(32);
                otpCodeForEmail = DirectoryVerificationHelper.GenerateOtpCode();
                otpTokenHash = DirectoryVerificationHelper.HashSecret(rawTokenForEmail);
                otpCodeHash = DirectoryVerificationHelper.HashSecret(otpCodeForEmail);
                otpExpiresAt = now.AddHours(DirectoryVerificationHelper.AffiliationOtpTtlHours);

                var affiliation = dbContext.PractitionerAffiliations.Local.FirstOrDefault(
                        a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == payload.ClinicStaffMemberId)
                    ?? await dbContext.PractitionerAffiliations
                        .FirstOrDefaultAsync(a => !a.IsDeleted
                                                  && a.FacilityId == facility.Id
                                                  && a.ClinicStaffMemberId == payload.ClinicStaffMemberId, ct);

                var localDisplayName = DirectoryVerificationHelper.FormatDisplayName(payload.Title, payload.FirstName, payload.LastName);
                var availJson = DirectoryVerificationHelper.SerializeAvailabilities(payload.Availabilities);

                if (affiliation is null)
                {
                    affiliation = new PractitionerAffiliation
                    {
                        Id = Guid.NewGuid(),
                        PractitionerId = matched.Id,
                        FacilityId = facility.Id,
                        TenantId = payloadTenantId,
                        ClinicStaffMemberId = payload.ClinicStaffMemberId,
                        Role = professionKind,
                        LocalDisplayName = localDisplayName,
                        LocalSpecialty = payload.Specialty,
                        AvailabilitiesJson = availJson,
                        AffiliationStatus = "AwaitingConfirmation",
                        OptedInAtUtc = submittedAt
                    };
                    dbContext.PractitionerAffiliations.Add(affiliation);
                }
                else if (affiliation.AffiliationStatus != "Active")
                {
                    affiliation.PractitionerId = matched.Id;
                    affiliation.Role = professionKind;
                    affiliation.LocalDisplayName = localDisplayName;
                    affiliation.LocalSpecialty = payload.Specialty;
                    affiliation.AvailabilitiesJson = availJson;
                    affiliation.AffiliationStatus = "AwaitingConfirmation";
                    affiliation.WithdrawnAtUtc = null;
                }

                affiliationId = affiliation.Id;
            }
        }

        var snapshot = new PractitionerRequestSnapshot(
            RequestId: requestId,
            FacilityId: facility.Id,
            FacilityName: string.IsNullOrWhiteSpace(payload.FacilityName) ? facility.Name : payload.FacilityName,
            ClinicStaffMemberId: payload.ClinicStaffMemberId,
            RequestKind: normalizedRequestKind,
            ProfessionKind: professionKind,
            FirstName: payload.FirstName,
            LastName: payload.LastName,
            Title: payload.Title,
            SubmittedPrcLicenseNo: payload.SubmittedPrcLicenseNo,
            NormalizedPrcLicenseNo: normalizedPrc,
            PrcExpiryDate: payload.PrcExpiryDate,
            PrcEvidenceObjectKey: payload.PrcEvidenceObjectKey,
            VerificationContact: payload.VerificationContact,
            Specialty: payload.Specialty,
            PublicBio: payload.PublicBio,
            AvatarUrl: payload.AvatarUrl,
            Availabilities: payload.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>(),
            SubmittedByClinicUserId: payload.SubmittedByClinicUserId,
            SubmittedAtUtc: submittedAt,
            HasNameMismatch: hasNameMismatch,
            MatchedPractitionerId: matched?.Id,
            MatchedPractitionerName: matchedName,
            OtpCodeHash: otpCodeHash,
            SubmittedByDisplayName: payload.SubmittedByDisplayName);

        var pracReq = new PractitionerVerificationRequest
        {
            Id = requestId,
            FacilityVerificationRequestId = null,
            TenantId = payloadTenantId,
            FacilityId = facility.Id,
            ClinicStaffMemberId = payload.ClinicStaffMemberId,
            PractitionerId = matched?.Id,
            AffiliationId = affiliationId,
            SubmissionNumber = nextSubmissionNumber,
            CorrelationId = (context.CorrelationId != Guid.Empty ? context.CorrelationId : requestId).ToString(),
            RequestKind = snapshot.RequestKind,
            ProfessionKind = professionKind,
            SubmittedPrcLicenseNo = payload.SubmittedPrcLicenseNo,
            NormalizedPrcLicenseNo = normalizedPrc,
            PrcExpiryDate = payload.PrcExpiryDate,
            SubmittedSnapshotJson = JsonSerializer.Serialize(snapshot, InteropJson.Options),
            PrcEvidenceObjectKey = payload.PrcEvidenceObjectKey,
            VerificationContact = payload.VerificationContact,
            SubmittedByClinicUserId = payload.SubmittedByClinicUserId,
            SubmittedByDisplayName = payload.SubmittedByDisplayName,
            SubmittedAtUtc = submittedAt,
            OtpTokenHash = otpTokenHash,
            OtpExpiresAtUtc = otpExpiresAt,
            Status = status
        };
        dbContext.PractitionerVerificationRequests.Add(pracReq);

        DirectoryVerificationHelper.StageAuditEntry(
            dbContext,
            payloadTenantId,
            payload.SubmittedByClinicUserId ?? sender.Address,
            !string.IsNullOrWhiteSpace(payload.SubmittedByDisplayName) ? payload.SubmittedByDisplayName.Trim() : "Clinic Admin",
            "ClinicAdmin",
            "practitioner-submitted",
            new
            {
                requestId = pracReq.Id,
                facilityId = facility.Id,
                clinicStaffMemberId = payload.ClinicStaffMemberId,
                professionKind,
                normalizedPrcLicenseNo = normalizedPrc,
                status,
                hasNameMismatch,
                matchedPractitionerId = matched?.Id
            });

        if (status == "AwaitingOtp")
        {
            DirectoryVerificationHelper.StageFacilityPractitionerStatusUpdate(
                interopPublisher,
                facility,
                payloadTenantId,
                payload.ClinicStaffMemberId,
                matched?.Id,
                professionKind,
                normalizedPrc,
                payload.SubmittedPrcLicenseNo,
                payload.PrcExpiryDate,
                PractitionerVerificationLevel.AwaitingConfirmation,
                "AwaitingConfirmation",
                pracReq.Id);
        }

        await dbContext.SaveChangesAsync(ct);

        if (status == "AwaitingOtp" && rawTokenForEmail is not null && otpCodeForEmail is not null)
        {
            var contact = !string.IsNullOrWhiteSpace(payload.VerificationContact)
                ? payload.VerificationContact
                : matched?.VerificationContact;

            DirectoryVerificationHelper.TryEnqueueAffiliationConfirmationEmail(
                notifications,
                frontendUrlProvider,
                contact,
                matchedName ?? DirectoryVerificationHelper.FormatDisplayName(payload.Title, payload.FirstName, payload.LastName),
                facility.Name,
                professionKind,
                rawTokenForEmail,
                otpCodeForEmail,
                pracReq.Id,
                logger);
        }

        logger.LogInformation("Recorded PractitionerVerificationRequest {RequestId} (#{Submission}, Status={Status}, Mismatch={Mismatch}) for facility {FacilityId}.",
            pracReq.Id, pracReq.SubmissionNumber, pracReq.Status, hasNameMismatch, facility.Id);
    }
}
