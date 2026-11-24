using System;
using System.Collections.Generic;
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
/// Handles <c>facility.verification.requested</c> (<c>InteropTypes.FacilityVerificationRequested</c>).
/// Supersedes prior pending requests for the facility, records the new verification request and bundled practitioner requests,
/// transitions the facility to <see cref="PlatformVerificationStatus.PendingReview"/>, and writes an audit entry.
/// </summary>
public sealed class FacilityVerificationRequestedHandler(
    IApplicationDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<FacilityVerificationRequestedHandler> logger,
    INotificationService? notifications = null,
    IFrontendUrlProvider? frontendUrlProvider = null) : IInteropHandler<FacilityVerificationRequestedPayload>
{
    public async Task HandleAsync(FacilityVerificationRequestedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring facility.verification.requested from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var facility = await dbContext.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId && !f.IsDeleted, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring facility.verification.requested for unknown facility {FacilityId} in tenant {TenantId}.",
                payload.FacilityId, payloadTenantId);
            return;
        }

        var requestId = payload.RequestId != Guid.Empty ? payload.RequestId : Guid.NewGuid();
        if (payload.RequestId != Guid.Empty)
        {
            var duplicate = await dbContext.FacilityVerificationRequests
                .AsNoTracking()
                .AnyAsync(r => r.Id == requestId && !r.IsDeleted, ct);
            if (duplicate)
            {
                logger.LogInformation("Ignoring duplicate facility.verification.requested {RequestId} for facility {FacilityId}.",
                    requestId, facility.Id);
                return;
            }
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var submittedAt = payload.SubmittedAtUtc == default ? now : payload.SubmittedAtUtc;

        var priorPending = await dbContext.FacilityVerificationRequests
            .Where(r => r.FacilityId == facility.Id && !r.IsDeleted && r.Status == "PendingReview")
            .ToListAsync(ct);

        var priorPendingIds = priorPending.Select(r => r.Id).ToList();
        foreach (var oldReq in priorPending)
        {
            oldReq.Status = "Superseded";
            oldReq.SupersededByRequestId = requestId;
            oldReq.UpdatedAt = now;
        }

        if (priorPendingIds.Count > 0)
        {
            var priorChildren = await dbContext.PractitionerVerificationRequests
                .Where(p => p.FacilityVerificationRequestId != null
                            && priorPendingIds.Contains(p.FacilityVerificationRequestId.Value)
                            && !p.IsDeleted
                            && (p.Status == "PendingReview" || p.Status == "AwaitingOtp"))
                .ToListAsync(ct);

            foreach (var oldChild in priorChildren)
            {
                var wasAwaitingOtp = oldChild.Status == "AwaitingOtp";
                oldChild.Status = "Superseded";
                oldChild.OtpTokenHash = null;
                oldChild.OtpExpiresAtUtc = null;
                oldChild.UpdatedAt = now;

                if (wasAwaitingOtp)
                {
                    var aff = dbContext.PractitionerAffiliations.Local.FirstOrDefault(
                            a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldChild.ClinicStaffMemberId)
                        ?? await dbContext.PractitionerAffiliations.FirstOrDefaultAsync(
                            a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldChild.ClinicStaffMemberId, ct);
                    if (aff is not null && aff.AffiliationStatus == "AwaitingConfirmation")
                    {
                        aff.AffiliationStatus = "Withdrawn";
                        aff.WithdrawnAtUtc = now;
                        aff.UpdatedAt = now;
                    }
                }
            }
        }

        var maxSubmission = await dbContext.FacilityVerificationRequests
            .Where(r => r.FacilityId == facility.Id && !r.IsDeleted)
            .MaxAsync(r => (int?)r.SubmissionNumber, ct) ?? 0;

        var ltoEvidenceKey = !string.IsNullOrWhiteSpace(payload.LtoEvidenceObjectKey)
            ? payload.LtoEvidenceObjectKey.Trim()
            : facility.LtoEvidenceObjectKey;

        var (normalizedContactNumber, normalizedContactEmail) = DirectoryVerificationHelper.NormalizeFacilityContacts(
            payload.ContactNumber,
            payload.ContactEmail);

        var legacyPhoneEmail = DirectoryVerificationHelper.IsPureEmailAddress(facility.ContactNumber)
            ? facility.ContactNumber!.Trim()
            : null;

        var snapshotContactEmail = normalizedContactEmail
            ?? (string.IsNullOrWhiteSpace(facility.ContactEmail) ? legacyPhoneEmail : facility.ContactEmail.Trim());

        var snapshotPayload = payload with
        {
            ContactNumber = normalizedContactNumber,
            ContactEmail = snapshotContactEmail
        };

        var rawRequestKind = payload.RequestKind?.Trim();
        var isLtoUpdateKind = string.Equals(rawRequestKind, "LtoUpdate", StringComparison.OrdinalIgnoreCase);
        var normalizedRequestKind = string.IsNullOrWhiteSpace(rawRequestKind)
            ? "Initial"
            : isLtoUpdateKind
                ? "Resubmission"
                : rawRequestKind;

        var facilityReq = new FacilityVerificationRequest
        {
            Id = requestId,
            TenantId = payloadTenantId,
            FacilityId = facility.Id,
            SubmissionNumber = maxSubmission + 1,
            CorrelationId = (context.CorrelationId != Guid.Empty ? context.CorrelationId : requestId).ToString(),
            RequestKind = normalizedRequestKind,
            SubmittedByClinicUserId = payload.SubmittedByClinicUserId,
            SubmittedByDisplayName = payload.SubmittedByDisplayName,
            SubmittedAtUtc = submittedAt,
            SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(snapshotPayload),
            LtoEvidenceObjectKey = ltoEvidenceKey,
            Status = "PendingReview"
        };
        dbContext.FacilityVerificationRequests.Add(facilityReq);

        facility.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        facility.RejectionReason = null;
        facility.LatestVerificationRequestId = requestId;
        if (!string.IsNullOrWhiteSpace(ltoEvidenceKey))
            facility.LtoEvidenceObjectKey = ltoEvidenceKey;
        if (!string.IsNullOrWhiteSpace(payload.DohLtoNumber))
            facility.LicenseToOperate = payload.DohLtoNumber.Trim();
        if (payload.DohLtoExpiryDate.HasValue)
            facility.LtoExpiryDate = payload.DohLtoExpiryDate;
        if (!string.IsNullOrWhiteSpace(payload.Classification))
            facility.Classification = payload.Classification.Trim();
        if (!string.IsNullOrWhiteSpace(payload.OperatingHours))
            facility.OperatingHours = payload.OperatingHours.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedContactNumber))
            facility.ContactNumber = normalizedContactNumber;
        else if (maxSubmission > 0 || legacyPhoneEmail is not null)
            facility.ContactNumber = null;
        if (!string.IsNullOrWhiteSpace(normalizedContactEmail))
            facility.ContactEmail = normalizedContactEmail;
        else if (string.IsNullOrWhiteSpace(facility.ContactEmail) && legacyPhoneEmail is not null)
            facility.ContactEmail = legacyPhoneEmail;
        if (!string.IsNullOrWhiteSpace(payload.PhilHealthAccreditationNumber))
            facility.PhilHealthAccreditationNumber = payload.PhilHealthAccreditationNumber.Trim();
        else if (!payload.IsPhilHealthAccredited || maxSubmission > 0)
            facility.PhilHealthAccreditationNumber = null;
        facility.UpdatedAt = now;

        // Preload existing canonical practitioners for bundled submissions
        var bundled = payload.Practitioners ?? Array.Empty<BundledPractitionerSubmissionDto>();
        var bundledNormalizedPrcs = bundled
            .Select(p => DirectoryVerificationHelper.NormalizePrcOrFallback(p.NormalizedPrcLicenseNo, p.SubmittedPrcLicenseNo))
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct()
            .ToList();

        var existingCanonical = bundledNormalizedPrcs.Count == 0
            ? new List<Practitioner>()
            : await dbContext.Practitioners
                .Where(p => !p.IsDeleted
                            && p.MergedIntoPractitionerId == null
                            && bundledNormalizedPrcs.Contains(p.NormalizedPrcLicenseNo))
                .ToListAsync(ct);

        var staffIds = bundled.Select(p => p.ClinicStaffMemberId).Distinct().ToList();
        var priorStaffRequests = staffIds.Count == 0
            ? new List<PractitionerVerificationRequest>()
            : await dbContext.PractitionerVerificationRequests
                .Where(r => r.FacilityId == facility.Id && !r.IsDeleted && staffIds.Contains(r.ClinicStaffMemberId))
                .ToListAsync(ct);

        var activeAffiliations = isLtoUpdateKind && staffIds.Count > 0
            ? await dbContext.PractitionerAffiliations
                .AsNoTracking()
                .Where(a => !a.IsDeleted
                            && a.FacilityId == facility.Id
                            && a.AffiliationStatus == "Active"
                            && staffIds.Contains(a.ClinicStaffMemberId))
                .ToListAsync(ct)
            : new List<PractitionerAffiliation>();

        var emailOutbox = new List<(string Contact, string Name, string Profession, string RawToken, string OtpCode, Guid CorrelationId)>();

        foreach (var item in bundled)
        {
            var professionKind = DirectoryVerificationHelper.NormalizeProfessionOrFallback(item.ProfessionKind);
            var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(item.NormalizedPrcLicenseNo, item.SubmittedPrcLicenseNo);

            var matched = existingCanonical.FirstOrDefault(p =>
                string.Equals(p.ProfessionKind, professionKind, StringComparison.OrdinalIgnoreCase)
                && string.Equals(p.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase));

            if (isLtoUpdateKind
                && matched is not null
                && matched.VerificationStatus == PractitionerVerificationLevel.Verified
                && PractitionerIdentity.IsCompatibleNameMatch(matched.FirstName, matched.LastName, item.FirstName, item.LastName)
                && activeAffiliations.Any(a => a.ClinicStaffMemberId == item.ClinicStaffMemberId && a.PractitionerId == matched.Id))
            {
                var priorApproved = priorStaffRequests
                    .Where(r => r.ClinicStaffMemberId == item.ClinicStaffMemberId && r.Status == "Approved")
                    .OrderByDescending(r => r.SubmissionNumber)
                    .ThenByDescending(r => r.SubmittedAtUtc)
                    .FirstOrDefault();

                var hasOpenRequest = priorStaffRequests.Any(r =>
                    r.ClinicStaffMemberId == item.ClinicStaffMemberId
                    && r.Status is "PendingReview" or "AwaitingOtp");

                var unchangedApprovedCredentials = !hasOpenRequest && (priorApproved is null || (
                    string.Equals(priorApproved.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase)
                    && priorApproved.PrcExpiryDate == item.PrcExpiryDate
                    && string.Equals(
                        string.IsNullOrWhiteSpace(priorApproved.PrcEvidenceObjectKey) ? null : priorApproved.PrcEvidenceObjectKey.Trim(),
                        string.IsNullOrWhiteSpace(item.PrcEvidenceObjectKey) ? null : item.PrcEvidenceObjectKey.Trim(),
                        StringComparison.Ordinal)));

                if (unchangedApprovedCredentials)
                {
                    continue;
                }
            }

            foreach (var oldStaffReq in priorStaffRequests.Where(r =>
                         r.ClinicStaffMemberId == item.ClinicStaffMemberId
                         && r.Status is "PendingReview" or "AwaitingOtp"))
            {
                var wasAwaitingOtp = oldStaffReq.Status == "AwaitingOtp";
                oldStaffReq.Status = "Superseded";
                oldStaffReq.OtpTokenHash = null;
                oldStaffReq.OtpExpiresAtUtc = null;
                oldStaffReq.UpdatedAt = now;

                if (wasAwaitingOtp)
                {
                    var aff = dbContext.PractitionerAffiliations.Local.FirstOrDefault(
                            a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldStaffReq.ClinicStaffMemberId)
                        ?? await dbContext.PractitionerAffiliations.FirstOrDefaultAsync(
                            a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == oldStaffReq.ClinicStaffMemberId, ct);
                    if (aff is not null && aff.AffiliationStatus == "AwaitingConfirmation")
                    {
                        aff.AffiliationStatus = "Withdrawn";
                        aff.WithdrawnAtUtc = now;
                        aff.UpdatedAt = now;
                    }
                }
            }

            var staffMaxSub = priorStaffRequests
                .Where(r => r.ClinicStaffMemberId == item.ClinicStaffMemberId)
                .Select(r => (int?)r.SubmissionNumber)
                .Max() ?? 0;

            var pracReqId = Guid.NewGuid();
            var status = "PendingReview";
            string? otpTokenHash = null;
            DateTime? otpExpiresAt = null;
            string? otpCodeHash = null;
            Guid? matchedPractitionerId = matched?.Id;
            Guid? affiliationId = null;
            bool hasNameMismatch = false;
            string? matchedName = matched is null
                ? null
                : DirectoryVerificationHelper.FormatDisplayName(matched.Title, matched.FirstName, matched.LastName);

            if (matched is not null && matched.VerificationStatus == PractitionerVerificationLevel.Verified)
            {
                if (PractitionerIdentity.IsCompatibleNameMatch(matched.FirstName, matched.LastName, item.FirstName, item.LastName))
                {
                    status = "AwaitingOtp";
                    var rawToken = TokenGenerator.GenerateSecureToken(32);
                    var otpCode = DirectoryVerificationHelper.GenerateOtpCode();
                    otpTokenHash = DirectoryVerificationHelper.HashSecret(rawToken);
                    otpCodeHash = DirectoryVerificationHelper.HashSecret(otpCode);
                    otpExpiresAt = now.AddHours(DirectoryVerificationHelper.AffiliationOtpTtlHours);

                    var existingAff = dbContext.PractitionerAffiliations.Local.FirstOrDefault(
                            a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == item.ClinicStaffMemberId)
                        ?? await dbContext.PractitionerAffiliations
                            .FirstOrDefaultAsync(a => !a.IsDeleted && a.FacilityId == facility.Id && a.ClinicStaffMemberId == item.ClinicStaffMemberId, ct);

                    if (existingAff is null)
                    {
                        existingAff = new PractitionerAffiliation
                        {
                            Id = Guid.NewGuid(),
                            PractitionerId = matched.Id,
                            FacilityId = facility.Id,
                            TenantId = payloadTenantId,
                            ClinicStaffMemberId = item.ClinicStaffMemberId,
                            Role = professionKind,
                            LocalDisplayName = DirectoryVerificationHelper.FormatDisplayName(item.Title, item.FirstName, item.LastName),
                            LocalSpecialty = item.Specialty,
                            AvailabilitiesJson = DirectoryVerificationHelper.SerializeAvailabilities(item.Availabilities),
                            AffiliationStatus = "AwaitingConfirmation",
                            OptedInAtUtc = submittedAt
                        };
                        dbContext.PractitionerAffiliations.Add(existingAff);
                    }
                    else if (existingAff.AffiliationStatus != "Active")
                    {
                        existingAff.PractitionerId = matched.Id;
                        existingAff.AffiliationStatus = "AwaitingConfirmation";
                        existingAff.WithdrawnAtUtc = null;
                        existingAff.LocalDisplayName = DirectoryVerificationHelper.FormatDisplayName(item.Title, item.FirstName, item.LastName);
                        existingAff.LocalSpecialty = item.Specialty;
                        existingAff.AvailabilitiesJson = DirectoryVerificationHelper.SerializeAvailabilities(item.Availabilities);
                    }

                    affiliationId = existingAff.Id;
                    var contact = !string.IsNullOrWhiteSpace(item.VerificationContact)
                        ? item.VerificationContact
                        : matched.VerificationContact;
                    if (!string.IsNullOrWhiteSpace(contact))
                    {
                        emailOutbox.Add((
                            contact,
                            DirectoryVerificationHelper.FormatDisplayName(matched.Title, matched.FirstName, matched.LastName),
                            professionKind,
                            rawToken,
                            otpCode,
                            pracReqId));
                    }
                }
                else
                {
                    hasNameMismatch = true;
                }
            }

            var pracSnapshot = new PractitionerRequestSnapshot(
                RequestId: pracReqId,
                FacilityId: facility.Id,
                FacilityName: payload.FacilityName,
                ClinicStaffMemberId: item.ClinicStaffMemberId,
                RequestKind: facilityReq.RequestKind,
                ProfessionKind: professionKind,
                FirstName: item.FirstName,
                LastName: item.LastName,
                Title: item.Title,
                SubmittedPrcLicenseNo: item.SubmittedPrcLicenseNo,
                NormalizedPrcLicenseNo: normalizedPrc,
                PrcExpiryDate: item.PrcExpiryDate,
                PrcEvidenceObjectKey: item.PrcEvidenceObjectKey,
                VerificationContact: item.VerificationContact,
                Specialty: item.Specialty,
                PublicBio: item.PublicBio,
                AvatarUrl: item.AvatarUrl,
                Availabilities: item.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>(),
                SubmittedByClinicUserId: payload.SubmittedByClinicUserId,
                SubmittedAtUtc: submittedAt,
                HasNameMismatch: hasNameMismatch,
                MatchedPractitionerId: matchedPractitionerId,
                MatchedPractitionerName: matchedName,
                OtpCodeHash: otpCodeHash,
                SubmittedByDisplayName: payload.SubmittedByDisplayName);

            var pracReq = new PractitionerVerificationRequest
            {
                Id = pracReqId,
                FacilityVerificationRequestId = facilityReq.Id,
                TenantId = payloadTenantId,
                FacilityId = facility.Id,
                ClinicStaffMemberId = item.ClinicStaffMemberId,
                PractitionerId = matchedPractitionerId,
                AffiliationId = affiliationId,
                SubmissionNumber = staffMaxSub + 1,
                CorrelationId = facilityReq.CorrelationId,
                RequestKind = facilityReq.RequestKind,
                ProfessionKind = professionKind,
                SubmittedPrcLicenseNo = item.SubmittedPrcLicenseNo,
                NormalizedPrcLicenseNo = normalizedPrc,
                PrcExpiryDate = item.PrcExpiryDate,
                SubmittedSnapshotJson = JsonSerializer.Serialize(pracSnapshot, InteropJson.Options),
                PrcEvidenceObjectKey = item.PrcEvidenceObjectKey,
                VerificationContact = item.VerificationContact,
                SubmittedByClinicUserId = payload.SubmittedByClinicUserId,
                SubmittedByDisplayName = payload.SubmittedByDisplayName,
                SubmittedAtUtc = submittedAt,
                OtpTokenHash = otpTokenHash,
                OtpExpiresAtUtc = otpExpiresAt,
                Status = status
            };
            dbContext.PractitionerVerificationRequests.Add(pracReq);
        }

        DirectoryVerificationHelper.StageAuditEntry(
            dbContext,
            payloadTenantId,
            payload.SubmittedByClinicUserId ?? sender.Address,
            payload.SubmittedByDisplayName ?? "Clinic Admin",
            "ClinicAdmin",
            "facility-submitted",
            new
            {
                requestId = facilityReq.Id,
                facilityId = facility.Id,
                submissionNumber = facilityReq.SubmissionNumber,
                requestKind = facilityReq.RequestKind,
                bundledPractitionerCount = bundled.Count,
                supersededRequestIds = priorPendingIds
            });

        await dbContext.SaveChangesAsync(ct);

        foreach (var email in emailOutbox)
        {
            DirectoryVerificationHelper.TryEnqueueAffiliationConfirmationEmail(
                notifications,
                frontendUrlProvider,
                email.Contact,
                email.Name,
                facility.Name,
                email.Profession,
                email.RawToken,
                email.OtpCode,
                email.CorrelationId);
        }

        logger.LogInformation("Recorded FacilityVerificationRequest {RequestId} (#{Submission}) for facility {FacilityId} with {Count} practitioners.",
            facilityReq.Id, facilityReq.SubmissionNumber, facility.Id, bundled.Count);
    }
}
