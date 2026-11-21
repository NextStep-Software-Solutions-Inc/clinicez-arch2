using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public interface IDirectoryVerificationPendingUpdater
{
    Task<VerificationUpdateRespondedPayload> ApplyFacilityUpdateAsync(
        FacilityVerificationUpdateRequestedPayload payload,
        string senderAddress,
        CancellationToken ct = default);

    Task<VerificationUpdateRespondedPayload> ApplyPractitionerUpdateAsync(
        PractitionerVerificationUpdateRequestedPayload payload,
        string senderAddress,
        CancellationToken ct = default);

    Task<bool> SyncPendingFacilityFromPortalAsync(
        Facility facility,
        Tenant tenant,
        string actorUserId,
        string? actorName,
        string actorRole,
        string action,
        bool clearLtoExpiryDate = false,
        bool preservePendingDohLtoExpiryDate = false,
        CancellationToken ct = default);
}

public sealed class DirectoryVerificationPendingUpdater(
    IApplicationDbContext db,
    TimeProvider timeProvider,
    ILogger<DirectoryVerificationPendingUpdater> logger,
    INotificationService? notifications = null,
    IFrontendUrlProvider? frontendUrlProvider = null) : IDirectoryVerificationPendingUpdater
{
    private sealed record PendingOtpEmail(
        string Contact,
        string PractitionerName,
        string ProfessionKind,
        string RawToken,
        string OtpCode,
        Guid CorrelationId);

    public async Task<VerificationUpdateRespondedPayload> ApplyFacilityUpdateAsync(
        FacilityVerificationUpdateRequestedPayload payload,
        string senderAddress,
        CancellationToken ct = default)
    {
        if (!Guid.TryParse(payload.TenantId, out var payloadTenantId))
        {
            return new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = false,
                ErrorCode = "invalid_tenant_id",
                Message = "TenantId is not a valid GUID."
            };
        }

        var facility = await db.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId && !f.IsDeleted, ct);

        if (facility is null)
        {
            return new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = false,
                ErrorCode = "facility_not_found",
                Message = $"Facility '{payload.FacilityId}' was not found."
            };
        }

        var allRequests = await db.FacilityVerificationRequests
            .Include(r => r.PractitionerRequests)
            .Where(r => r.FacilityId == facility.Id && !r.IsDeleted)
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .ToListAsync(ct);

        FacilityVerificationRequest? facReq;
        if (payload.ExpectedRequestId is Guid expectedId && expectedId != Guid.Empty)
        {
            var expected = allRequests.FirstOrDefault(r => r.Id == expectedId);
            if (expected is null)
            {
                var latest = allRequests.FirstOrDefault();
                return ConflictResponse(
                    latest?.Status ?? facility.PlatformVerificationStatus.ToString(),
                    latest?.Id,
                    $"Facility verification request '{expectedId}' was not found or is no longer pending.");
            }

            if (expected.Status != "PendingReview")
            {
                return ConflictResponse(
                    expected.Status,
                    expected.Id,
                    $"Facility verification request has already been {expected.Status}.");
            }

            facReq = expected;
        }
        else
        {
            facReq = allRequests.FirstOrDefault(r => r.Status == "PendingReview");
            if (facReq is null)
            {
                var latest = allRequests.FirstOrDefault();
                return ConflictResponse(
                    latest?.Status ?? facility.PlatformVerificationStatus.ToString(),
                    latest?.Id,
                    latest is null
                        ? "No active pending facility verification request exists."
                        : $"Facility verification request has already been {latest.Status}.");
            }
        }

        if (!string.IsNullOrWhiteSpace(payload.ExpectedStatus)
            && !string.Equals(payload.ExpectedStatus.Trim(), facReq.Status, StringComparison.OrdinalIgnoreCase))
        {
            return ConflictResponse(
                facReq.Status,
                facReq.Id,
                $"Facility verification request status is '{facReq.Status}', expected '{payload.ExpectedStatus}'.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var services = payload.Services ?? Array.Empty<ClinicServiceDto>();
        var bundled = (payload.Practitioners ?? Array.Empty<BundledPractitionerSubmissionDto>())
            .GroupBy(p => p.ClinicStaffMemberId)
            .Select(g =>
            {
                var item = g.First();
                return item with
                {
                    Availabilities = item.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>()
                };
            })
            .ToList();

        var existingSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facReq.SubmittedSnapshotJson);
        var ltoEvidenceKey = !string.IsNullOrWhiteSpace(payload.LtoEvidenceObjectKey)
            ? payload.LtoEvidenceObjectKey.Trim()
            : (facReq.LtoEvidenceObjectKey ?? facility.LtoEvidenceObjectKey);

        var submittedByUserId = !string.IsNullOrWhiteSpace(payload.SubmittedByClinicUserId)
            ? payload.SubmittedByClinicUserId.Trim()
            : facReq.SubmittedByClinicUserId;
        var submittedByDisplayName = !string.IsNullOrWhiteSpace(payload.SubmittedByDisplayName)
            ? payload.SubmittedByDisplayName.Trim()
            : facReq.SubmittedByDisplayName;

        var facilityName = !string.IsNullOrWhiteSpace(payload.FacilityName)
            ? payload.FacilityName.Trim()
            : facility.Name;
        var facilitySlug = !string.IsNullOrWhiteSpace(payload.FacilitySlug)
            ? payload.FacilitySlug.Trim()
            : (existingSnap?.FacilitySlug ?? facility.Slug);

        var (normalizedContactNumber, normalizedContactEmail) = DirectoryVerificationHelper.NormalizeFacilityContacts(
            payload.ContactNumber,
            payload.ContactEmail);

        var updatedSnapshot = new FacilityVerificationRequestedPayload
        {
            RequestId = facReq.Id,
            TenantId = payload.TenantId,
            FacilityId = facility.Id,
            FacilityName = facilityName,
            FacilitySlug = facilitySlug,
            Classification = payload.Classification,
            DohLtoNumber = payload.DohLtoNumber,
            DohLtoExpiryDate = payload.DohLtoExpiryDate,
            LtoEvidenceObjectKey = ltoEvidenceKey,
            Address = payload.Address,
            ContactNumber = normalizedContactNumber,
            ContactEmail = normalizedContactEmail ?? existingSnap?.ContactEmail,
            OperatingHours = payload.OperatingHours,
            IsOnlineBookingPaused = payload.IsOnlineBookingPaused,
            PhilHealthAccreditationNumber = payload.PhilHealthAccreditationNumber,
            IsPhilHealthAccredited = payload.IsPhilHealthAccredited,
            SupportsInPerson = payload.SupportsInPerson,
            SupportsTeleconsult = payload.SupportsTeleconsult,
            RequestKind = facReq.RequestKind,
            SubmittedByClinicUserId = submittedByUserId,
            SubmittedByDisplayName = submittedByDisplayName,
            SubmittedAtUtc = facReq.SubmittedAtUtc,
            Services = services,
            Practitioners = bundled
        };

        facReq.SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(updatedSnapshot);
        facReq.LtoEvidenceObjectKey = ltoEvidenceKey;
        facReq.SubmittedByClinicUserId = submittedByUserId;
        facReq.SubmittedByDisplayName = submittedByDisplayName;
        facReq.UpdatedAt = now;

        if (!string.IsNullOrWhiteSpace(payload.FacilityName))
            facility.Name = payload.FacilityName.Trim();
        if (!string.IsNullOrWhiteSpace(payload.FacilitySlug))
            facility.Slug = payload.FacilitySlug.Trim();
        if (!string.IsNullOrWhiteSpace(ltoEvidenceKey))
            facility.LtoEvidenceObjectKey = ltoEvidenceKey;
        if (!string.IsNullOrWhiteSpace(payload.DohLtoNumber))
            facility.LicenseToOperate = payload.DohLtoNumber.Trim();
        facility.LtoExpiryDate = payload.DohLtoExpiryDate;
        if (!string.IsNullOrWhiteSpace(payload.Classification))
            facility.Classification = payload.Classification.Trim();
        if (!string.IsNullOrWhiteSpace(payload.OperatingHours))
            facility.OperatingHours = payload.OperatingHours.Trim();
        facility.ContactNumber = normalizedContactNumber;
        if (!string.IsNullOrWhiteSpace(normalizedContactEmail))
            facility.ContactEmail = normalizedContactEmail;
        facility.PhilHealthAccreditationNumber = string.IsNullOrWhiteSpace(payload.PhilHealthAccreditationNumber)
            ? null
            : payload.PhilHealthAccreditationNumber.Trim();
        facility.UpdatedAt = now;

        // Reconcile bundled practitioner children
        var bundledByStaffId = bundled.ToDictionary(p => p.ClinicStaffMemberId);
        var existingChildren = facReq.PractitionerRequests
            .Where(c => !c.IsDeleted)
            .OrderByDescending(c => c.SubmissionNumber)
            .ToList();

        var existingByStaffId = new Dictionary<Guid, PractitionerVerificationRequest>();
        foreach (var child in existingChildren)
        {
            if (child.Status is "Withdrawn" or "Superseded")
                continue;
            existingByStaffId.TryAdd(child.ClinicStaffMemberId, child);
        }

        var emailOutbox = new List<PendingOtpEmail>();

        // 1. Withdraw removed active children (never mutate Approved/Rejected children)
        foreach (var child in existingChildren)
        {
            if (bundledByStaffId.ContainsKey(child.ClinicStaffMemberId))
                continue;

            if (child.Status is not ("PendingReview" or "AwaitingOtp"))
                continue;

            child.Status = "Withdrawn";
            child.WithdrawnAtUtc = now;
            child.WithdrawnByActor = submittedByUserId ?? senderAddress;
            child.WithdrawalReason = "Removed from pending facility submission.";
            child.OtpTokenHash = null;
            child.OtpExpiresAtUtc = null;
            child.UpdatedAt = now;

            await WithdrawAwaitingAffiliationAsync(facility.Id, child.ClinicStaffMemberId, child.AffiliationId, now, ct);
        }

        // Preload canonical practitioners for any bundled entries
        var bundledNormalizedPrcs = bundled
            .Select(p => DirectoryVerificationHelper.NormalizePrcOrFallback(p.NormalizedPrcLicenseNo, p.SubmittedPrcLicenseNo))
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var canonicalPractitioners = bundledNormalizedPrcs.Count == 0
            ? new List<Practitioner>()
            : await db.Practitioners
                .Where(p => !p.IsDeleted
                            && p.MergedIntoPractitionerId == null
                            && bundledNormalizedPrcs.Contains(p.NormalizedPrcLicenseNo))
                .ToListAsync(ct);

        var missingStaffIds = bundled
            .Where(p => !existingByStaffId.ContainsKey(p.ClinicStaffMemberId))
            .Select(p => p.ClinicStaffMemberId)
            .Distinct()
            .ToList();

        var priorForMissingStaff = missingStaffIds.Count == 0
            ? new List<PractitionerVerificationRequest>()
            : await db.PractitionerVerificationRequests
                .Where(r => r.FacilityId == facility.Id && !r.IsDeleted && missingStaffIds.Contains(r.ClinicStaffMemberId))
                .ToListAsync(ct);

        // 2. Update existing active children in place, or insert newly added children
        foreach (var item in bundled)
        {
            if (existingByStaffId.TryGetValue(item.ClinicStaffMemberId, out var existingChild))
            {
                if (existingChild.Status is "PendingReview" or "AwaitingOtp")
                {
                    var childEmail = await UpdatePractitionerRequestCoreAsync(
                        existingChild,
                        facility,
                        item.ProfessionKind,
                        item.FirstName,
                        item.LastName,
                        item.Title,
                        item.SubmittedPrcLicenseNo,
                        item.NormalizedPrcLicenseNo,
                        item.PrcExpiryDate,
                        item.PrcEvidenceObjectKey,
                        item.VerificationContact,
                        item.Specialty,
                        item.PublicBio,
                        item.AvatarUrl,
                        item.Availabilities,
                        submittedByUserId,
                        submittedByDisplayName,
                        now,
                        canonicalPractitioners,
                        ct);

                    if (childEmail is not null)
                        emailOutbox.Add(childEmail);
                }

                continue;
            }

            // Supersede any standalone pending rows for this staff member before bundling
            foreach (var oldStandalone in priorForMissingStaff.Where(r =>
                         r.ClinicStaffMemberId == item.ClinicStaffMemberId
                         && r.FacilityVerificationRequestId != facReq.Id
                         && r.Status is "PendingReview" or "AwaitingOtp"))
            {
                var wasAwaitingOtp = oldStandalone.Status == "AwaitingOtp";
                oldStandalone.Status = "Superseded";
                oldStandalone.OtpTokenHash = null;
                oldStandalone.OtpExpiresAtUtc = null;
                oldStandalone.UpdatedAt = now;

                if (wasAwaitingOtp)
                {
                    await WithdrawAwaitingAffiliationAsync(facility.Id, oldStandalone.ClinicStaffMemberId, oldStandalone.AffiliationId, now, ct);
                }
            }

            var staffMaxSub = priorForMissingStaff
                .Where(r => r.ClinicStaffMemberId == item.ClinicStaffMemberId)
                .Select(r => (int?)r.SubmissionNumber)
                .Max() ?? 0;

            var (newChild, newEmail) = await CreateBundledChildRequestAsync(
                facReq,
                facility,
                item,
                staffMaxSub + 1,
                submittedByUserId,
                submittedByDisplayName,
                now,
                canonicalPractitioners,
                ct);

            db.PractitionerVerificationRequests.Add(newChild);
            if (newEmail is not null)
                emailOutbox.Add(newEmail);
        }

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            payloadTenantId,
            submittedByUserId ?? senderAddress,
            submittedByDisplayName ?? "Clinic Admin",
            "ClinicAdmin",
            "facility-pending-updated",
            new
            {
                requestId = facReq.Id,
                facilityId = facility.Id,
                submissionNumber = facReq.SubmissionNumber,
                bundledPractitionerCount = bundled.Count
            });

        foreach (var email in emailOutbox)
        {
            DirectoryVerificationHelper.TryEnqueueAffiliationConfirmationEmail(
                notifications,
                frontendUrlProvider,
                email.Contact,
                email.PractitionerName,
                facility.Name,
                email.ProfessionKind,
                email.RawToken,
                email.OtpCode,
                email.CorrelationId);
        }

        logger.LogInformation(
            "Updated pending FacilityVerificationRequest {RequestId} (#{Submission}) in place for facility {FacilityId}.",
            facReq.Id, facReq.SubmissionNumber, facility.Id);

        return new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            Conflict = false,
            CurrentStatus = facReq.Status,
            RequestId = facReq.Id,
            UpdatedAtUtc = now,
            Message = "Pending facility verification request updated."
        };
    }

    public async Task<VerificationUpdateRespondedPayload> ApplyPractitionerUpdateAsync(
        PractitionerVerificationUpdateRequestedPayload payload,
        string senderAddress,
        CancellationToken ct = default)
    {
        if (!Guid.TryParse(payload.TenantId, out var payloadTenantId))
        {
            return new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = false,
                ErrorCode = "invalid_tenant_id",
                Message = "TenantId is not a valid GUID."
            };
        }

        var facility = await db.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId && !f.IsDeleted, ct);

        if (facility is null)
        {
            return new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = false,
                ErrorCode = "facility_not_found",
                Message = $"Facility '{payload.FacilityId}' was not found."
            };
        }

        var allForStaff = await db.PractitionerVerificationRequests
            .Where(r => r.FacilityId == facility.Id
                        && r.ClinicStaffMemberId == payload.ClinicStaffMemberId
                        && !r.IsDeleted)
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .ToListAsync(ct);

        PractitionerVerificationRequest? pracReq;
        if (payload.ExpectedRequestId is Guid expectedId && expectedId != Guid.Empty)
        {
            var expected = allForStaff.FirstOrDefault(r => r.Id == expectedId);
            if (expected is null)
            {
                var latest = allForStaff.FirstOrDefault();
                return ConflictResponse(
                    latest?.Status ?? "Unverified",
                    latest?.Id,
                    $"Practitioner verification request '{expectedId}' was not found or is no longer pending.");
            }

            if (expected.Status is not ("PendingReview" or "AwaitingOtp"))
            {
                return ConflictResponse(
                    expected.Status,
                    expected.Id,
                    $"Practitioner verification request has already been {expected.Status}.");
            }

            pracReq = expected;
        }
        else
        {
            pracReq = allForStaff.FirstOrDefault(r => r.Status is "PendingReview" or "AwaitingOtp");
            if (pracReq is null)
            {
                var latest = allForStaff.FirstOrDefault();
                return ConflictResponse(
                    latest?.Status ?? "Unverified",
                    latest?.Id,
                    latest is null
                        ? "No active pending practitioner verification request exists."
                        : $"Practitioner verification request has already been {latest.Status}.");
            }
        }

        var expectedStatus = string.IsNullOrWhiteSpace(payload.ExpectedStatus) ? null : payload.ExpectedStatus.Trim();
        var statusCompatible = expectedStatus is null
            || string.Equals(expectedStatus, pracReq.Status, StringComparison.OrdinalIgnoreCase)
            || (string.Equals(expectedStatus, "PendingReview", StringComparison.OrdinalIgnoreCase) && pracReq.Status == "AwaitingOtp");

        if (!statusCompatible)
        {
            return ConflictResponse(
                pracReq.Status,
                pracReq.Id,
                $"Practitioner verification request status is '{pracReq.Status}', expected '{expectedStatus}'.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var availabilities = payload.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>();
        var submittedByUserId = !string.IsNullOrWhiteSpace(payload.SubmittedByClinicUserId)
            ? payload.SubmittedByClinicUserId.Trim()
            : pracReq.SubmittedByClinicUserId;
        var submittedByDisplayName = !string.IsNullOrWhiteSpace(payload.SubmittedByDisplayName)
            ? payload.SubmittedByDisplayName.Trim()
            : pracReq.SubmittedByDisplayName;

        var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(payload.NormalizedPrcLicenseNo, payload.SubmittedPrcLicenseNo);
        var canonicalPractitioners = string.IsNullOrWhiteSpace(normalizedPrc)
            ? new List<Practitioner>()
            : await db.Practitioners
                .Where(p => !p.IsDeleted
                            && p.MergedIntoPractitionerId == null
                            && p.NormalizedPrcLicenseNo == normalizedPrc)
                .ToListAsync(ct);

        var otpEmail = await UpdatePractitionerRequestCoreAsync(
            pracReq,
            facility,
            payload.ProfessionKind,
            payload.FirstName,
            payload.LastName,
            payload.Title,
            payload.SubmittedPrcLicenseNo,
            payload.NormalizedPrcLicenseNo,
            payload.PrcExpiryDate,
            payload.PrcEvidenceObjectKey,
            payload.VerificationContact,
            payload.Specialty,
            payload.PublicBio,
            payload.AvatarUrl,
            availabilities,
            submittedByUserId,
            submittedByDisplayName,
            now,
            canonicalPractitioners,
            ct,
            facilityNameOverride: payload.FacilityName);

        // If bundled inside an active PendingReview facility request, refresh its practitioner entry in SubmittedSnapshotJson
        if (pracReq.FacilityVerificationRequestId is Guid parentId)
        {
            var parentFacReq = await db.FacilityVerificationRequests
                .FirstOrDefaultAsync(r => r.Id == parentId && !r.IsDeleted, ct);

            if (parentFacReq is not null && parentFacReq.Status == "PendingReview")
            {
                var parentSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(parentFacReq.SubmittedSnapshotJson);
                if (parentSnap is not null)
                {
                    var updatedEntry = new BundledPractitionerSubmissionDto
                    {
                        ClinicStaffMemberId = payload.ClinicStaffMemberId,
                        ProfessionKind = pracReq.ProfessionKind,
                        FirstName = payload.FirstName,
                        LastName = payload.LastName,
                        Title = payload.Title,
                        SubmittedPrcLicenseNo = pracReq.SubmittedPrcLicenseNo,
                        NormalizedPrcLicenseNo = pracReq.NormalizedPrcLicenseNo,
                        PrcExpiryDate = pracReq.PrcExpiryDate,
                        PrcEvidenceObjectKey = pracReq.PrcEvidenceObjectKey,
                        VerificationContact = pracReq.VerificationContact,
                        Specialty = payload.Specialty,
                        PublicBio = payload.PublicBio,
                        AvatarUrl = payload.AvatarUrl,
                        Availabilities = availabilities
                    };

                    var existingList = parentSnap.Practitioners ?? Array.Empty<BundledPractitionerSubmissionDto>();
                    var newList = new List<BundledPractitionerSubmissionDto>(existingList.Count + 1);
                    var replaced = false;
                    foreach (var p in existingList)
                    {
                        if (p.ClinicStaffMemberId == payload.ClinicStaffMemberId)
                        {
                            newList.Add(updatedEntry);
                            replaced = true;
                        }
                        else
                        {
                            newList.Add(p);
                        }
                    }

                    if (!replaced)
                        newList.Add(updatedEntry);

                    parentFacReq.SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(
                        parentSnap with { Practitioners = newList });
                    parentFacReq.UpdatedAt = now;
                }
            }
        }

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            payloadTenantId,
            submittedByUserId ?? senderAddress,
            submittedByDisplayName ?? "Clinic Admin",
            "ClinicAdmin",
            "practitioner-pending-updated",
            new
            {
                requestId = pracReq.Id,
                facilityId = facility.Id,
                clinicStaffMemberId = pracReq.ClinicStaffMemberId,
                status = pracReq.Status
            });

        if (otpEmail is not null)
        {
            DirectoryVerificationHelper.TryEnqueueAffiliationConfirmationEmail(
                notifications,
                frontendUrlProvider,
                otpEmail.Contact,
                otpEmail.PractitionerName,
                facility.Name,
                otpEmail.ProfessionKind,
                otpEmail.RawToken,
                otpEmail.OtpCode,
                otpEmail.CorrelationId);
        }

        logger.LogInformation(
            "Updated pending PractitionerVerificationRequest {RequestId} (#{Submission}, Status={Status}) in place for facility {FacilityId}.",
            pracReq.Id, pracReq.SubmissionNumber, pracReq.Status, facility.Id);

        return new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            Conflict = false,
            CurrentStatus = pracReq.Status,
            RequestId = pracReq.Id,
            UpdatedAtUtc = now,
            Message = "Pending practitioner verification request updated."
        };
    }

    public async Task<bool> SyncPendingFacilityFromPortalAsync(
        Facility facility,
        Tenant tenant,
        string actorUserId,
        string? actorName,
        string actorRole,
        string action,
        bool clearLtoExpiryDate = false,
        bool preservePendingDohLtoExpiryDate = false,
        CancellationToken ct = default)
    {
        var facReq = await db.FacilityVerificationRequests
            .Where(r => r.FacilityId == facility.Id && !r.IsDeleted && r.Status == "PendingReview")
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (facReq is null)
            return false;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var existingSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facReq.SubmittedSnapshotJson);
        var ltoEvidenceKey = !string.IsNullOrWhiteSpace(facility.LtoEvidenceObjectKey)
            ? facility.LtoEvidenceObjectKey.Trim()
            : facReq.LtoEvidenceObjectKey;

        var addressParts = new[] { facility.StreetAddress, facility.Barangay, facility.City, facility.Province }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Trim())
            .ToList();
        var address = addressParts.Count > 0 ? string.Join(", ", addressParts) : existingSnap?.Address;

        var philHealthNumber = !string.IsNullOrWhiteSpace(facility.PhilHealthAccreditationNumber)
            ? facility.PhilHealthAccreditationNumber.Trim()
            : existingSnap?.PhilHealthAccreditationNumber;

        DateOnly? resolvedDohLtoExpiryDate;
        if (clearLtoExpiryDate)
        {
            resolvedDohLtoExpiryDate = null;
        }
        else if (preservePendingDohLtoExpiryDate
                 && existingSnap is not null
                 && VerificationReviewerLookup.HasJsonPropertyKey(facReq.SubmittedSnapshotJson, "dohLtoExpiryDate"))
        {
            resolvedDohLtoExpiryDate = existingSnap.DohLtoExpiryDate;
        }
        else
        {
            resolvedDohLtoExpiryDate = facility.LtoExpiryDate ?? existingSnap?.DohLtoExpiryDate;
        }

        var (facContactNumber, facContactEmail) = DirectoryVerificationHelper.NormalizeFacilityContacts(
            facility.ContactNumber,
            facility.ContactEmail);

        var resolvedPortalEmail = facContactEmail
            ?? (facility.ContactEmail is null
                ? existingSnap?.ContactEmail ?? (DirectoryVerificationHelper.IsPureEmailAddress(existingSnap?.ContactNumber) ? existingSnap!.ContactNumber : null)
                : facility.ContactEmail);

        var updatedSnap = existingSnap is not null
            ? existingSnap with
            {
                FacilityName = facility.Name,
                FacilitySlug = facility.Slug,
                Classification = facility.Classification ?? existingSnap.Classification,
                DohLtoNumber = facility.LicenseToOperate ?? existingSnap.DohLtoNumber,
                DohLtoExpiryDate = resolvedDohLtoExpiryDate,
                LtoEvidenceObjectKey = ltoEvidenceKey,
                Address = address,
                ContactNumber = facContactNumber ?? (DirectoryVerificationHelper.IsPureEmailAddress(existingSnap.ContactNumber) ? null : existingSnap.ContactNumber),
                ContactEmail = resolvedPortalEmail,
                OperatingHours = facility.OperatingHours ?? existingSnap.OperatingHours,
                PhilHealthAccreditationNumber = philHealthNumber,
                IsPhilHealthAccredited = existingSnap.IsPhilHealthAccredited || !string.IsNullOrWhiteSpace(philHealthNumber)
            }
            : new FacilityVerificationRequestedPayload
            {
                RequestId = facReq.Id,
                TenantId = tenant.Id.ToString(),
                FacilityId = facility.Id,
                FacilityName = facility.Name,
                FacilitySlug = facility.Slug,
                Classification = facility.Classification,
                DohLtoNumber = facility.LicenseToOperate,
                DohLtoExpiryDate = resolvedDohLtoExpiryDate,
                LtoEvidenceObjectKey = ltoEvidenceKey,
                Address = address,
                ContactNumber = facContactNumber,
                ContactEmail = facContactEmail,
                OperatingHours = facility.OperatingHours,
                PhilHealthAccreditationNumber = philHealthNumber,
                IsPhilHealthAccredited = !string.IsNullOrWhiteSpace(philHealthNumber),
                RequestKind = facReq.RequestKind,
                SubmittedByClinicUserId = facReq.SubmittedByClinicUserId,
                SubmittedByDisplayName = facReq.SubmittedByDisplayName,
                SubmittedAtUtc = facReq.SubmittedAtUtc
            };

        facReq.LtoEvidenceObjectKey = ltoEvidenceKey;
        facReq.SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(updatedSnap);
        facReq.UpdatedAt = now;

        DirectoryVerificationHelper.StageAuditEntry(
            db,
            tenant.Id,
            actorUserId,
            string.IsNullOrWhiteSpace(actorName) ? "Clinic Admin" : actorName.Trim(),
            actorRole,
            action,
            new
            {
                requestId = facReq.Id,
                facilityId = facility.Id,
                submissionNumber = facReq.SubmissionNumber,
                ltoEvidenceObjectKey = ltoEvidenceKey,
                ltoExpiryDate = resolvedDohLtoExpiryDate
            });

        return true;
    }

    private async Task<(PractitionerVerificationRequest Request, PendingOtpEmail? Email)> CreateBundledChildRequestAsync(
        FacilityVerificationRequest facReq,
        Facility facility,
        BundledPractitionerSubmissionDto item,
        int submissionNumber,
        string? submittedByUserId,
        string? submittedByDisplayName,
        DateTime now,
        IReadOnlyList<Practitioner> canonicalPractitioners,
        CancellationToken ct)
    {
        var professionKind = DirectoryVerificationHelper.NormalizeProfessionOrFallback(item.ProfessionKind);
        var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(item.NormalizedPrcLicenseNo, item.SubmittedPrcLicenseNo);

        var matched = canonicalPractitioners.FirstOrDefault(p =>
            string.Equals(p.ProfessionKind, professionKind, StringComparison.OrdinalIgnoreCase)
            && string.Equals(p.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase));

        var pracReqId = Guid.NewGuid();
        var status = "PendingReview";
        string? otpTokenHash = null;
        DateTime? otpExpiresAt = null;
        string? otpCodeHash = null;
        Guid? affiliationId = null;
        bool hasNameMismatch = false;
        PendingOtpEmail? emailToSend = null;
        var matchedName = matched is null
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

                var aff = await UpsertAwaitingConfirmationAffiliationAsync(
                    facility.Id,
                    facReq.TenantId,
                    item.ClinicStaffMemberId,
                    matched.Id,
                    professionKind,
                    DirectoryVerificationHelper.FormatDisplayName(item.Title, item.FirstName, item.LastName),
                    item.Specialty,
                    item.Availabilities,
                    facReq.SubmittedAtUtc,
                    now,
                    ct);
                affiliationId = aff.Id;

                var contact = !string.IsNullOrWhiteSpace(item.VerificationContact)
                    ? item.VerificationContact.Trim()
                    : matched.VerificationContact;
                if (!string.IsNullOrWhiteSpace(contact))
                {
                    emailToSend = new PendingOtpEmail(
                        contact,
                        matchedName ?? DirectoryVerificationHelper.FormatDisplayName(item.Title, item.FirstName, item.LastName),
                        professionKind,
                        rawToken,
                        otpCode,
                        pracReqId);
                }
            }
            else
            {
                hasNameMismatch = true;
            }
        }

        var pracSnap = new PractitionerRequestSnapshot(
            RequestId: pracReqId,
            FacilityId: facility.Id,
            FacilityName: facility.Name,
            ClinicStaffMemberId: item.ClinicStaffMemberId,
            RequestKind: facReq.RequestKind,
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
            SubmittedByClinicUserId: submittedByUserId,
            SubmittedAtUtc: facReq.SubmittedAtUtc,
            HasNameMismatch: hasNameMismatch,
            MatchedPractitionerId: matched?.Id,
            MatchedPractitionerName: matchedName,
            OtpCodeHash: otpCodeHash,
            SubmittedByDisplayName: submittedByDisplayName);

        var pracReq = new PractitionerVerificationRequest
        {
            Id = pracReqId,
            FacilityVerificationRequestId = facReq.Id,
            TenantId = facReq.TenantId,
            FacilityId = facility.Id,
            ClinicStaffMemberId = item.ClinicStaffMemberId,
            PractitionerId = matched?.Id,
            AffiliationId = affiliationId,
            SubmissionNumber = submissionNumber,
            CorrelationId = facReq.CorrelationId,
            RequestKind = facReq.RequestKind,
            ProfessionKind = professionKind,
            SubmittedPrcLicenseNo = item.SubmittedPrcLicenseNo,
            NormalizedPrcLicenseNo = normalizedPrc,
            PrcExpiryDate = item.PrcExpiryDate,
            SubmittedSnapshotJson = JsonSerializer.Serialize(pracSnap, InteropJson.Options),
            PrcEvidenceObjectKey = item.PrcEvidenceObjectKey,
            VerificationContact = item.VerificationContact,
            SubmittedByClinicUserId = submittedByUserId,
            SubmittedByDisplayName = submittedByDisplayName,
            SubmittedAtUtc = facReq.SubmittedAtUtc,
            OtpTokenHash = otpTokenHash,
            OtpExpiresAtUtc = otpExpiresAt,
            Status = status,
            CreatedAt = now,
            UpdatedAt = now
        };

        return (pracReq, emailToSend);
    }

    private async Task<PendingOtpEmail?> UpdatePractitionerRequestCoreAsync(
        PractitionerVerificationRequest pracReq,
        Facility facility,
        string rawProfessionKind,
        string firstName,
        string lastName,
        string? title,
        string submittedPrcLicenseNo,
        string normalizedPrcLicenseNo,
        DateOnly? prcExpiryDate,
        string? prcEvidenceObjectKey,
        string? verificationContact,
        string? specialty,
        string? publicBio,
        string? avatarUrl,
        IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities,
        string? submittedByUserId,
        string? submittedByDisplayName,
        DateTime now,
        IReadOnlyList<Practitioner> canonicalPractitioners,
        CancellationToken ct,
        string? facilityNameOverride = null)
    {
        var professionKind = DirectoryVerificationHelper.NormalizeProfessionOrFallback(rawProfessionKind);
        var normalizedPrc = DirectoryVerificationHelper.NormalizePrcOrFallback(normalizedPrcLicenseNo, submittedPrcLicenseNo);
        var normalizedAvailabilities = availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>();
        var oldSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);

        var trimmedContact = string.IsNullOrWhiteSpace(verificationContact) ? null : verificationContact.Trim();
        var oldContact = string.IsNullOrWhiteSpace(pracReq.VerificationContact) ? null : pracReq.VerificationContact.Trim();

        var prcChanged = !string.Equals(pracReq.ProfessionKind, professionKind, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(pracReq.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase);
        var nameChanged = oldSnap is null
            || !string.Equals(oldSnap.FirstName?.Trim(), firstName.Trim(), StringComparison.Ordinal)
            || !string.Equals(oldSnap.LastName?.Trim(), lastName.Trim(), StringComparison.Ordinal);
        var contactChanged = !string.Equals(oldContact, trimmedContact, StringComparison.OrdinalIgnoreCase);

        var status = pracReq.Status;
        string? otpTokenHash = pracReq.OtpTokenHash;
        DateTime? otpExpiresAt = pracReq.OtpExpiresAtUtc;
        string? otpCodeHash = oldSnap?.OtpCodeHash;
        Guid? matchedPractitionerId = pracReq.PractitionerId;
        Guid? affiliationId = pracReq.AffiliationId;
        bool hasNameMismatch = oldSnap?.HasNameMismatch ?? false;
        string? matchedName = oldSnap?.MatchedPractitionerName;
        PendingOtpEmail? emailToSend = null;

        var localDisplayName = DirectoryVerificationHelper.FormatDisplayName(title, firstName, lastName);

        if (pracReq.Status == "AwaitingOtp" && !prcChanged && !nameChanged && !contactChanged)
        {
            // Preserve active OTP flow on bio/specialty/schedule/proof-only edits
            hasNameMismatch = false;
            if (affiliationId.HasValue)
            {
                var aff = await FindAffiliationAsync(facility.Id, pracReq.ClinicStaffMemberId, affiliationId, ct);
                if (aff is not null && aff.AffiliationStatus != "Active")
                {
                    aff.LocalDisplayName = localDisplayName;
                    aff.LocalSpecialty = specialty;
                    aff.AvailabilitiesJson = DirectoryVerificationHelper.SerializeAvailabilities(normalizedAvailabilities);
                    aff.UpdatedAt = now;
                }
            }
        }
        else if (prcChanged || nameChanged || contactChanged)
        {
            var matched = canonicalPractitioners.FirstOrDefault(p =>
                string.Equals(p.ProfessionKind, professionKind, StringComparison.OrdinalIgnoreCase)
                && string.Equals(p.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase));

            matchedPractitionerId = matched?.Id;
            matchedName = matched is null
                ? null
                : DirectoryVerificationHelper.FormatDisplayName(matched.Title, matched.FirstName, matched.LastName);

            if (matched is not null && matched.VerificationStatus == PractitionerVerificationLevel.Verified)
            {
                if (PractitionerIdentity.IsCompatibleNameMatch(matched.FirstName, matched.LastName, firstName, lastName))
                {
                    status = "AwaitingOtp";
                    hasNameMismatch = false;

                    var aff = await UpsertAwaitingConfirmationAffiliationAsync(
                        facility.Id,
                        pracReq.TenantId,
                        pracReq.ClinicStaffMemberId,
                        matched.Id,
                        professionKind,
                        localDisplayName,
                        specialty,
                        normalizedAvailabilities,
                        pracReq.SubmittedAtUtc,
                        now,
                        ct);
                    affiliationId = aff.Id;

                    var mustIssueOtp = pracReq.Status != "AwaitingOtp"
                        || prcChanged
                        || contactChanged
                        || string.IsNullOrWhiteSpace(pracReq.OtpTokenHash);

                    if (mustIssueOtp)
                    {
                        var rawToken = TokenGenerator.GenerateSecureToken(32);
                        var otpCode = DirectoryVerificationHelper.GenerateOtpCode();
                        otpTokenHash = DirectoryVerificationHelper.HashSecret(rawToken);
                        otpCodeHash = DirectoryVerificationHelper.HashSecret(otpCode);
                        otpExpiresAt = now.AddHours(DirectoryVerificationHelper.AffiliationOtpTtlHours);

                        var contact = trimmedContact ?? matched.VerificationContact;
                        if (!string.IsNullOrWhiteSpace(contact))
                        {
                            emailToSend = new PendingOtpEmail(
                                contact,
                                matchedName ?? localDisplayName,
                                professionKind,
                                rawToken,
                                otpCode,
                                pracReq.Id);
                        }
                    }
                }
                else
                {
                    status = "PendingReview";
                    hasNameMismatch = true;
                    otpTokenHash = null;
                    otpExpiresAt = null;
                    otpCodeHash = null;
                    await WithdrawAwaitingAffiliationAsync(facility.Id, pracReq.ClinicStaffMemberId, affiliationId, now, ct);
                    affiliationId = null;
                }
            }
            else
            {
                status = "PendingReview";
                hasNameMismatch = false;
                otpTokenHash = null;
                otpExpiresAt = null;
                otpCodeHash = null;
                await WithdrawAwaitingAffiliationAsync(facility.Id, pracReq.ClinicStaffMemberId, affiliationId, now, ct);
                affiliationId = null;
            }
        }

        var evidenceKey = !string.IsNullOrWhiteSpace(prcEvidenceObjectKey)
            ? prcEvidenceObjectKey.Trim()
            : pracReq.PrcEvidenceObjectKey;

        var finalSubmittedByUserId = submittedByUserId ?? pracReq.SubmittedByClinicUserId;
        var finalSubmittedByDisplayName = submittedByDisplayName ?? pracReq.SubmittedByDisplayName ?? oldSnap?.SubmittedByDisplayName;
        var facilityName = !string.IsNullOrWhiteSpace(facilityNameOverride)
            ? facilityNameOverride.Trim()
            : facility.Name;

        var updatedSnap = new PractitionerRequestSnapshot(
            RequestId: pracReq.Id,
            FacilityId: facility.Id,
            FacilityName: facilityName,
            ClinicStaffMemberId: pracReq.ClinicStaffMemberId,
            RequestKind: pracReq.RequestKind,
            ProfessionKind: professionKind,
            FirstName: firstName,
            LastName: lastName,
            Title: title,
            SubmittedPrcLicenseNo: submittedPrcLicenseNo.Trim(),
            NormalizedPrcLicenseNo: normalizedPrc,
            PrcExpiryDate: prcExpiryDate,
            PrcEvidenceObjectKey: evidenceKey,
            VerificationContact: trimmedContact,
            Specialty: specialty,
            PublicBio: publicBio,
            AvatarUrl: avatarUrl,
            Availabilities: normalizedAvailabilities,
            SubmittedByClinicUserId: finalSubmittedByUserId,
            SubmittedAtUtc: pracReq.SubmittedAtUtc,
            HasNameMismatch: hasNameMismatch,
            MatchedPractitionerId: matchedPractitionerId,
            MatchedPractitionerName: matchedName,
            OtpCodeHash: otpCodeHash,
            SubmittedByDisplayName: finalSubmittedByDisplayName);

        pracReq.ProfessionKind = professionKind;
        pracReq.SubmittedPrcLicenseNo = submittedPrcLicenseNo.Trim();
        pracReq.NormalizedPrcLicenseNo = normalizedPrc;
        pracReq.PrcExpiryDate = prcExpiryDate;
        pracReq.PrcEvidenceObjectKey = evidenceKey;
        pracReq.VerificationContact = trimmedContact;
        pracReq.SubmittedByClinicUserId = finalSubmittedByUserId;
        pracReq.SubmittedByDisplayName = finalSubmittedByDisplayName;
        pracReq.PractitionerId = matchedPractitionerId;
        pracReq.AffiliationId = affiliationId;
        pracReq.OtpTokenHash = otpTokenHash;
        pracReq.OtpExpiresAtUtc = otpExpiresAt;
        pracReq.Status = status;
        pracReq.SubmittedSnapshotJson = JsonSerializer.Serialize(updatedSnap, InteropJson.Options);
        pracReq.UpdatedAt = now;

        return emailToSend;
    }

    private async Task<PractitionerAffiliation?> FindAffiliationAsync(
        Guid facilityId,
        Guid clinicStaffMemberId,
        Guid? affiliationId,
        CancellationToken ct)
    {
        if (affiliationId.HasValue)
        {
            var byId = db.PractitionerAffiliations.Local.FirstOrDefault(a => a.Id == affiliationId.Value && !a.IsDeleted)
                ?? await db.PractitionerAffiliations.FirstOrDefaultAsync(a => a.Id == affiliationId.Value && !a.IsDeleted, ct);
            if (byId is not null)
                return byId;
        }

        return db.PractitionerAffiliations.Local.FirstOrDefault(a =>
                   !a.IsDeleted && a.FacilityId == facilityId && a.ClinicStaffMemberId == clinicStaffMemberId)
               ?? await db.PractitionerAffiliations.FirstOrDefaultAsync(
                   a => !a.IsDeleted && a.FacilityId == facilityId && a.ClinicStaffMemberId == clinicStaffMemberId, ct);
    }

    private async Task<PractitionerAffiliation> UpsertAwaitingConfirmationAffiliationAsync(
        Guid facilityId,
        Guid tenantId,
        Guid clinicStaffMemberId,
        Guid practitionerId,
        string professionKind,
        string localDisplayName,
        string? specialty,
        IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities,
        DateTime optedInAtUtc,
        DateTime now,
        CancellationToken ct)
    {
        var affiliation = await FindAffiliationAsync(facilityId, clinicStaffMemberId, null, ct);
        var availJson = DirectoryVerificationHelper.SerializeAvailabilities(availabilities);

        if (affiliation is null)
        {
            affiliation = new PractitionerAffiliation
            {
                Id = Guid.NewGuid(),
                PractitionerId = practitionerId,
                FacilityId = facilityId,
                TenantId = tenantId,
                ClinicStaffMemberId = clinicStaffMemberId,
                Role = professionKind,
                LocalDisplayName = localDisplayName,
                LocalSpecialty = specialty,
                AvailabilitiesJson = availJson,
                AffiliationStatus = "AwaitingConfirmation",
                OptedInAtUtc = optedInAtUtc,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.PractitionerAffiliations.Add(affiliation);
        }
        else if (affiliation.AffiliationStatus != "Active")
        {
            affiliation.PractitionerId = practitionerId;
            affiliation.Role = professionKind;
            affiliation.LocalDisplayName = localDisplayName;
            affiliation.LocalSpecialty = specialty;
            affiliation.AvailabilitiesJson = availJson;
            affiliation.AffiliationStatus = "AwaitingConfirmation";
            affiliation.WithdrawnAtUtc = null;
            affiliation.UpdatedAt = now;
        }

        return affiliation;
    }

    private async Task WithdrawAwaitingAffiliationAsync(
        Guid facilityId,
        Guid clinicStaffMemberId,
        Guid? affiliationId,
        DateTime now,
        CancellationToken ct)
    {
        var aff = await FindAffiliationAsync(facilityId, clinicStaffMemberId, affiliationId, ct);
        if (aff is not null && aff.AffiliationStatus == "AwaitingConfirmation")
        {
            aff.AffiliationStatus = "Withdrawn";
            aff.WithdrawnAtUtc = now;
            aff.UpdatedAt = now;
        }
    }

    private static VerificationUpdateRespondedPayload ConflictResponse(
        string? currentStatus,
        Guid? requestId,
        string message) => new()
    {
        Succeeded = false,
        Conflict = true,
        ErrorCode = "verification_request_not_pending",
        CurrentStatus = currentStatus,
        RequestId = requestId,
        Message = message
    };
}
