using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public sealed record VerificationQueueItemDto(
    Guid Id,
    string Kind,
    Guid TenantId,
    string TenantSlug,
    string TenantName,
    Guid FacilityId,
    string FacilityName,
    string? FacilitySlug,
    int SubmissionNumber,
    string RequestKind,
    string Status,
    DateTime SubmittedAtUtc,
    string? SubmittedByDisplayName,
    string? DohLtoNumber,
    string? LtoEvidenceObjectKey,
    Guid? FacilityVerificationRequestId,
    Guid? PractitionerId,
    Guid? ClinicStaffMemberId,
    string? PractitionerName,
    string? ProfessionKind,
    string? PrcLicenseNo,
    string? NormalizedPrcLicenseNo,
    DateOnly? PrcExpiryDate,
    string? PrcEvidenceObjectKey,
    bool HasNameMismatch,
    int BundledPractitionerCount,
    DateTime? ReviewedAtUtc,
    string? ReviewedByAdminUserId,
    string? ReviewerNotes,
    DateOnly? DohLtoExpiryDate = null,
    string? ReviewedByDisplayName = null,
    string? ReviewedByEmail = null,
    DateTime? UpdatedAtUtc = null);

public sealed record VerificationQueueResponse(
    List<VerificationQueueItemDto> Items,
    int TotalCount,
    int PendingCount,
    int PendingFacilityCount,
    int PendingPractitionerCount);

public sealed record PrcMatchCandidateDto(
    Guid PractitionerId,
    string ProfessionKind,
    string NormalizedPrcLicenseNo,
    string DisplayPrcLicenseNo,
    string FirstName,
    string LastName,
    string? Title,
    string PrimarySpecialty,
    PractitionerVerificationLevel VerificationStatus,
    DateOnly? PrcExpiryDate,
    DateTime? VerifiedAtUtc,
    bool IsCompatibleNameMatch,
    int AffiliatedFacilityCount,
    List<string> AffiliatedClinics);

public sealed record ChildPractitionerRequestDetailDto(
    Guid Id,
    Guid ClinicStaffMemberId,
    Guid? PractitionerId,
    Guid? AffiliationId,
    int SubmissionNumber,
    string RequestKind,
    string ProfessionKind,
    string FirstName,
    string LastName,
    string? Title,
    string SubmittedPrcLicenseNo,
    string NormalizedPrcLicenseNo,
    DateOnly? PrcExpiryDate,
    string? PrcEvidenceObjectKey,
    string? VerificationContact,
    string? Specialty,
    string? PublicBio,
    string? AvatarUrl,
    string Status,
    bool HasNameMismatch,
    List<PrcMatchCandidateDto> PrcMatchCandidates,
    IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities);

public sealed record VerificationSubmissionHistoryItemDto(
    Guid Id,
    int SubmissionNumber,
    string RequestKind,
    string Status,
    DateTime SubmittedAtUtc,
    DateTime? ReviewedAtUtc,
    string? ReviewedByAdminUserId,
    string? ReviewerNotes,
    DateTime? WithdrawnAtUtc,
    string? WithdrawalReason,
    string? ReviewedByDisplayName = null,
    string? ReviewedByEmail = null);

public sealed record FieldChangeDto(
    string FieldKey,
    string Label,
    string? PreviousValue,
    string? CurrentValue,
    string ChangeKind);

public sealed record ResubmissionDiffDto(
    Guid PreviousRequestId,
    int PreviousSubmissionNumber,
    string PreviousStatus,
    DateTime PreviousSubmittedAtUtc,
    string? PreviousReason,
    bool LtoProofUpdated,
    bool PrcProofUpdated,
    List<Guid> UpdatedChildPractitionerIds,
    List<Guid> UpdatedChildPrcProofIds,
    List<FieldChangeDto> ChangedFields);

public sealed record VerificationRequestDetailDto(
    Guid Id,
    string Kind,
    string Status,
    string RequestKind,
    int SubmissionNumber,
    string CorrelationId,
    DateTime SubmittedAtUtc,
    string? SubmittedByClinicUserId,
    string? SubmittedByDisplayName,
    DateTime? ReviewedAtUtc,
    string? ReviewedByAdminUserId,
    string? ReviewerNotes,
    DateTime? WithdrawnAtUtc,
    string? WithdrawnByActor,
    string? WithdrawalReason,
    Guid TenantId,
    string TenantSlug,
    string TenantName,
    Guid FacilityId,
    string FacilityName,
    string? FacilitySlug,
    PlatformVerificationStatus FacilityVerificationStatus,
    string? DohLtoNumber,
    string? EvidenceObjectKey,
    string? LtoEvidenceObjectKey,
    string? PrcEvidenceObjectKey,
    string SubmittedSnapshotJson,
    JsonElement? Snapshot,
    bool HasNameMismatch,
    List<ChildPractitionerRequestDetailDto> ChildPractitionerRequests,
    List<PrcMatchCandidateDto> PrcMatchCandidates,
    List<VerificationSubmissionHistoryItemDto> SubmissionHistory,
    DateOnly? DohLtoExpiryDate = null,
    string? ReviewedByDisplayName = null,
    string? ReviewedByEmail = null,
    string? ClinicContactNumber = null,
    string? ClinicContactEmail = null,
    string? PhilHealthAccreditationNumber = null,
    bool IsPhilHealthAccredited = false,
    bool SupportsInPerson = true,
    bool SupportsTeleconsult = false,
    DateTime? UpdatedAtUtc = null,
    ResubmissionDiffDto? ResubmissionDiff = null,
    Guid? CanonicalPractitionerId = null,
    PractitionerVerificationLevel? CanonicalPractitionerStatus = null);

public sealed record GetVerificationQueueQuery(
    string? Kind = null,
    string? Status = null,
    string? Search = null) : IRequest<VerificationQueueResponse>;

public sealed record GetVerificationRequestDetailQuery(Guid RequestId) : IRequest<VerificationRequestDetailDto?>;

public sealed class GetVerificationQueueQueryHandler(IApplicationDbContext db)
    : IRequestHandler<GetVerificationQueueQuery, VerificationQueueResponse>
{
    public async Task<VerificationQueueResponse> Handle(GetVerificationQueueQuery request, CancellationToken ct)
    {
        var kindFilter = request.Kind?.Trim().ToLowerInvariant();
        var includeFacility = string.IsNullOrWhiteSpace(kindFilter) || kindFilter is "all" or "facility" or "clinic";
        var includePractitioner = string.IsNullOrWhiteSpace(kindFilter) || kindFilter is "all" or "practitioner" or "provider";

        var statusFilter = request.Status?.Trim();
        var searchTerm = request.Search?.Trim().ToLowerInvariant();

        var facilityRequests = await db.FacilityVerificationRequests
            .AsNoTracking()
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .Include(r => r.PractitionerRequests)
            .Where(r => !r.IsDeleted)
            .OrderByDescending(r => r.SubmittedAtUtc)
            .ToListAsync(ct);

        var practitionerRequests = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .Where(r => !r.IsDeleted)
            .OrderByDescending(r => r.SubmittedAtUtc)
            .ToListAsync(ct);

        // Preload canonical practitioners for PRC mismatch detection without N+1 queries
        var allNormalizedPrcs = practitionerRequests
            .Select(r => r.NormalizedPrcLicenseNo)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct()
            .ToList();

        var canonicalPractitioners = allNormalizedPrcs.Count == 0
            ? new List<Practitioner>()
            : await db.Practitioners
                .AsNoTracking()
                .Where(p => !p.IsDeleted
                            && p.MergedIntoPractitionerId == null
                            && allNormalizedPrcs.Contains(p.NormalizedPrcLicenseNo))
                .ToListAsync(ct);

        // Batch-load reviewer admin accounts
        var reviewerIds = facilityRequests
            .Select(r => r.ReviewedByAdminUserId)
            .Concat(practitionerRequests.Select(r => r.ReviewedByAdminUserId))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var adminDirectory = await VerificationIdentityResolver.LoadAdminDirectoryAsync(db, reviewerIds, ct);

        // Batch-load submitter lookup tables for tenants that have requests lacking stored human-readable names
        var tenantIdsNeedingSubmitterLookup = facilityRequests
            .Where(r => VerificationIdentityResolver.IsRawUserId(r.SubmittedByDisplayName)
                        && !string.IsNullOrWhiteSpace(r.SubmittedByClinicUserId))
            .Select(r => r.TenantId)
            .Concat(practitionerRequests
                .Where(pr => VerificationIdentityResolver.IsRawUserId(pr.SubmittedByDisplayName)
                             && !string.IsNullOrWhiteSpace(pr.SubmittedByClinicUserId))
                .Select(pr => pr.TenantId))
            .Distinct()
            .ToList();

        var submitterDirectory = await VerificationIdentityResolver.LoadSubmitterDirectoryAsync(
            db, tenantIdsNeedingSubmitterLookup, ct);

        var pendingFacilityCount = facilityRequests.Count(r => r.Status == "PendingReview");
        var pendingPractitionerCount = practitionerRequests.Count(r =>
            (r.Status == "PendingReview" || r.Status == "AwaitingOtp")
            && (r.FacilityVerificationRequestId == null || !facilityRequests.Any(fr => fr.Id == r.FacilityVerificationRequestId && fr.Status == "PendingReview")));

        var items = new List<VerificationQueueItemDto>();

        if (includeFacility)
        {
            foreach (var r in facilityRequests)
            {
                var facilitySnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(r.SubmittedSnapshotJson);
                var snapshotEl = GetVerificationRequestDetailQueryHandler.ParseJsonElement(r.SubmittedSnapshotJson);
                var childHasMismatch = r.PractitionerRequests
                    .Where(c => !c.IsDeleted)
                    .Any(c =>
                    {
                        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(c.SubmittedSnapshotJson);
                        return HasNameMismatch(canonicalPractitioners, c.ProfessionKind, c.NormalizedPrcLicenseNo, snap);
                    });

                var submittedBy = VerificationIdentityResolver.ResolveSubmitterDisplayName(
                    submitterDirectory,
                    r.TenantId,
                    r.Tenant,
                    r.SubmittedByClinicUserId,
                    r.SubmittedByDisplayName,
                    facilitySnap?.SubmittedByDisplayName);

                var (reviewedByName, reviewedByEmail) = VerificationIdentityResolver.ResolveReviewer(
                    adminDirectory,
                    r.ReviewedByAdminUserId,
                    r.ReviewedByDisplayName,
                    r.ReviewedByEmail);

                items.Add(new VerificationQueueItemDto(
                    Id: r.Id,
                    Kind: "Facility",
                    TenantId: r.TenantId,
                    TenantSlug: r.Tenant.TenantSlug,
                    TenantName: r.Tenant.Name,
                    FacilityId: r.FacilityId,
                    FacilityName: r.Facility.Name,
                    FacilitySlug: r.Facility.Slug,
                    SubmissionNumber: r.SubmissionNumber,
                    RequestKind: r.RequestKind,
                    Status: r.Status,
                    SubmittedAtUtc: r.SubmittedAtUtc,
                    SubmittedByDisplayName: submittedBy,
                    DohLtoNumber: GetVerificationRequestDetailQueryHandler.ResolveDohLtoNumber(snapshotEl, facilitySnap, r.Facility.LicenseToOperate),
                    LtoEvidenceObjectKey: r.LtoEvidenceObjectKey ?? r.Facility.LtoEvidenceObjectKey,
                    FacilityVerificationRequestId: null,
                    PractitionerId: null,
                    ClinicStaffMemberId: null,
                    PractitionerName: null,
                    ProfessionKind: null,
                    PrcLicenseNo: null,
                    NormalizedPrcLicenseNo: null,
                    PrcExpiryDate: null,
                    PrcEvidenceObjectKey: null,
                    HasNameMismatch: childHasMismatch,
                    BundledPractitionerCount: r.PractitionerRequests.Count(c => !c.IsDeleted),
                    ReviewedAtUtc: r.ReviewedAtUtc,
                    ReviewedByAdminUserId: r.ReviewedByAdminUserId,
                    ReviewerNotes: r.ReviewerNotes,
                    DohLtoExpiryDate: GetVerificationRequestDetailQueryHandler.ResolveDohLtoExpiryDate(snapshotEl, facilitySnap, r.Facility.LtoExpiryDate),
                    ReviewedByDisplayName: reviewedByName,
                    ReviewedByEmail: reviewedByEmail,
                    UpdatedAtUtc: r.UpdatedAt));
            }
        }

        if (includePractitioner)
        {
            // When listing all kinds, show standalone practitioner requests (or child requests whose parent facility request is already resolved).
            // When explicitly filtering kind=practitioner, include all practitioner requests.
            var explicitPractitionerFilter = kindFilter is "practitioner" or "provider";
            var pendingParentIds = facilityRequests
                .Where(fr => fr.Status == "PendingReview")
                .Select(fr => fr.Id)
                .ToHashSet();

            foreach (var pr in practitionerRequests)
            {
                if (!explicitPractitionerFilter
                    && pr.FacilityVerificationRequestId.HasValue
                    && pendingParentIds.Contains(pr.FacilityVerificationRequestId.Value))
                {
                    continue;
                }

                var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pr.SubmittedSnapshotJson);
                var fullName = snap is not null
                    ? DirectoryVerificationHelper.FormatDisplayName(snap.Title, snap.FirstName, snap.LastName)
                    : pr.SubmittedPrcLicenseNo;

                var mismatch = HasNameMismatch(canonicalPractitioners, pr.ProfessionKind, pr.NormalizedPrcLicenseNo, snap);

                var submittedBy = VerificationIdentityResolver.ResolveSubmitterDisplayName(
                    submitterDirectory,
                    pr.TenantId,
                    pr.Tenant,
                    pr.SubmittedByClinicUserId,
                    pr.SubmittedByDisplayName,
                    snap?.SubmittedByDisplayName,
                    pr.ClinicStaffMemberId,
                    snap);

                var (reviewedByName, reviewedByEmail) = VerificationIdentityResolver.ResolveReviewer(
                    adminDirectory,
                    pr.ReviewedByAdminUserId,
                    pr.ReviewedByDisplayName,
                    pr.ReviewedByEmail);

                items.Add(new VerificationQueueItemDto(
                    Id: pr.Id,
                    Kind: "Practitioner",
                    TenantId: pr.TenantId,
                    TenantSlug: pr.Tenant.TenantSlug,
                    TenantName: pr.Tenant.Name,
                    FacilityId: pr.FacilityId,
                    FacilityName: pr.Facility.Name,
                    FacilitySlug: pr.Facility.Slug,
                    SubmissionNumber: pr.SubmissionNumber,
                    RequestKind: pr.RequestKind,
                    Status: pr.Status,
                    SubmittedAtUtc: pr.SubmittedAtUtc,
                    SubmittedByDisplayName: submittedBy,
                    DohLtoNumber: null,
                    LtoEvidenceObjectKey: null,
                    FacilityVerificationRequestId: pr.FacilityVerificationRequestId,
                    PractitionerId: pr.PractitionerId,
                    ClinicStaffMemberId: pr.ClinicStaffMemberId,
                    PractitionerName: fullName,
                    ProfessionKind: pr.ProfessionKind,
                    PrcLicenseNo: pr.SubmittedPrcLicenseNo,
                    NormalizedPrcLicenseNo: pr.NormalizedPrcLicenseNo,
                    PrcExpiryDate: pr.PrcExpiryDate,
                    PrcEvidenceObjectKey: pr.PrcEvidenceObjectKey,
                    HasNameMismatch: mismatch,
                    BundledPractitionerCount: 0,
                    ReviewedAtUtc: pr.ReviewedAtUtc,
                    ReviewedByAdminUserId: pr.ReviewedByAdminUserId,
                    ReviewerNotes: pr.ReviewerNotes,
                    DohLtoExpiryDate: null,
                    ReviewedByDisplayName: reviewedByName,
                    ReviewedByEmail: reviewedByEmail,
                    UpdatedAtUtc: pr.UpdatedAt));
            }
        }

        IEnumerable<VerificationQueueItemDto> filtered = items;
        if (!string.IsNullOrWhiteSpace(statusFilter) && !string.Equals(statusFilter, "all", StringComparison.OrdinalIgnoreCase))
        {
            filtered = filtered.Where(i => string.Equals(i.Status, statusFilter, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            filtered = filtered.Where(i =>
                i.FacilityName.ToLowerInvariant().Contains(searchTerm)
                || i.TenantName.ToLowerInvariant().Contains(searchTerm)
                || i.TenantSlug.ToLowerInvariant().Contains(searchTerm)
                || (i.DohLtoNumber != null && i.DohLtoNumber.ToLowerInvariant().Contains(searchTerm))
                || (i.PractitionerName != null && i.PractitionerName.ToLowerInvariant().Contains(searchTerm))
                || (i.PrcLicenseNo != null && i.PrcLicenseNo.ToLowerInvariant().Contains(searchTerm))
                || (i.NormalizedPrcLicenseNo != null && i.NormalizedPrcLicenseNo.ToLowerInvariant().Contains(searchTerm)));
        }

        var resultItems = filtered
            .OrderByDescending(i => i.Status == "PendingReview" || i.Status == "AwaitingOtp")
            .ThenByDescending(i => i.SubmittedAtUtc)
            .ToList();

        return new VerificationQueueResponse(
            Items: resultItems,
            TotalCount: resultItems.Count,
            PendingCount: pendingFacilityCount + pendingPractitionerCount,
            PendingFacilityCount: pendingFacilityCount,
            PendingPractitionerCount: pendingPractitionerCount);
    }

    internal static bool HasNameMismatch(
        IReadOnlyList<Practitioner> candidates,
        string professionKind,
        string normalizedPrc,
        PractitionerRequestSnapshot? snap)
    {
        if (snap?.HasNameMismatch == true)
            return true;

        if (snap is null)
            return false;

        var matchingPrc = candidates
            .Where(c => string.Equals(c.ProfessionKind, professionKind, StringComparison.OrdinalIgnoreCase)
                        && string.Equals(c.NormalizedPrcLicenseNo, normalizedPrc, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matchingPrc.Any(c => !PractitionerIdentity.IsCompatibleNameMatch(
            c.FirstName, c.LastName, snap.FirstName, snap.LastName));
    }
}

public sealed class GetVerificationRequestDetailQueryHandler(IApplicationDbContext db)
    : IRequestHandler<GetVerificationRequestDetailQuery, VerificationRequestDetailDto?>
{
    public async Task<VerificationRequestDetailDto?> Handle(GetVerificationRequestDetailQuery request, CancellationToken ct)
    {
        var facilityReq = await db.FacilityVerificationRequests
            .AsNoTracking()
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
                .ThenInclude(f => f.Branch)
            .Include(r => r.PractitionerRequests)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct);

        if (facilityReq is not null)
        {
            var children = facilityReq.PractitionerRequests
                .Where(c => !c.IsDeleted)
                .OrderBy(c => c.SubmittedAtUtc)
                .ToList();

            var childPrcs = children
                .Select(c => c.NormalizedPrcLicenseNo)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct()
                .ToList();

            var candidatePractitioners = await LoadCandidatesAsync(childPrcs, ct);
            var childDetails = children.Select(c => BuildChildDetail(c, candidatePractitioners)).ToList();

            var allSubmissions = await db.FacilityVerificationRequests
                .AsNoTracking()
                .Include(r => r.PractitionerRequests)
                .Where(r => r.FacilityId == facilityReq.FacilityId && !r.IsDeleted)
                .OrderByDescending(r => r.SubmissionNumber)
                .ThenByDescending(r => r.SubmittedAtUtc)
                .ToListAsync(ct);

            var reviewerIds = allSubmissions
                .Select(r => r.ReviewedByAdminUserId)
                .Append(facilityReq.ReviewedByAdminUserId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var adminDirectory = await VerificationIdentityResolver.LoadAdminDirectoryAsync(db, reviewerIds, ct);

            var facilitySnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facilityReq.SubmittedSnapshotJson);
            var snapshotEl = ParseJsonElement(facilityReq.SubmittedSnapshotJson);

            var submitterDirectory = VerificationIdentityResolver.IsRawUserId(facilityReq.SubmittedByDisplayName)
                                     && VerificationIdentityResolver.IsRawUserId(facilitySnap?.SubmittedByDisplayName)
                                     && !string.IsNullOrWhiteSpace(facilityReq.SubmittedByClinicUserId)
                ? await VerificationIdentityResolver.LoadSubmitterDirectoryAsync(db, [facilityReq.TenantId], ct)
                : VerificationIdentityResolver.SubmitterDirectory.Empty;

            var submittedBy = VerificationIdentityResolver.ResolveSubmitterDisplayName(
                submitterDirectory,
                facilityReq.TenantId,
                facilityReq.Tenant,
                facilityReq.SubmittedByClinicUserId,
                facilityReq.SubmittedByDisplayName,
                facilitySnap?.SubmittedByDisplayName);

            var (reviewedByName, reviewedByEmail) = VerificationIdentityResolver.ResolveReviewer(
                adminDirectory,
                facilityReq.ReviewedByAdminUserId,
                facilityReq.ReviewedByDisplayName,
                facilityReq.ReviewedByEmail);

            var history = allSubmissions.Select(r =>
            {
                var (histName, histEmail) = VerificationIdentityResolver.ResolveReviewer(
                    adminDirectory,
                    r.ReviewedByAdminUserId,
                    r.ReviewedByDisplayName,
                    r.ReviewedByEmail);

                return new VerificationSubmissionHistoryItemDto(
                    r.Id,
                    r.SubmissionNumber,
                    r.RequestKind,
                    r.Status,
                    r.SubmittedAtUtc,
                    r.ReviewedAtUtc,
                    r.ReviewedByAdminUserId,
                    r.ReviewerNotes,
                    r.WithdrawnAtUtc,
                    r.WithdrawalReason,
                    histName,
                    histEmail);
            }).ToList();

            var teleconsultBilling = await db.WorkspaceTeleconsultBillings
                .AsNoTracking()
                .FirstOrDefaultAsync(b => b.TenantId == facilityReq.TenantId && !b.IsDeleted, ct);

            var branch = facilityReq.Facility.Branch;
            var dohLtoNumber = ResolveDohLtoNumber(snapshotEl, facilitySnap, facilityReq.Facility.LicenseToOperate);
            var dohLtoExpiryDate = ResolveDohLtoExpiryDate(snapshotEl, facilitySnap, facilityReq.Facility.LtoExpiryDate);
            var clinicContactNumber = FirstValidPhoneNumber(
                facilitySnap?.ContactNumber,
                facilityReq.Facility.ContactNumber,
                branch?.ContactNumber,
                facilityReq.Tenant.PhoneNumber);
            var clinicContactEmail = FirstNonEmpty(
                facilitySnap?.ContactEmail,
                facilityReq.Facility.ContactEmail,
                FirstEmailFallbackFromPhoneFields(
                    facilitySnap?.ContactNumber,
                    facilityReq.Facility.ContactNumber,
                    branch?.ContactNumber,
                    facilityReq.Tenant.PhoneNumber),
                branch?.ContactEmail,
                facilityReq.Tenant.Email);
            var (philHealthNumber, isPhilHealthAccredited) = ResolveFacilityPhilHealth(
                snapshotEl,
                facilitySnap,
                facilityReq.Facility,
                branch);
            var supportsInPerson = TryGetJsonBoolean(snapshotEl, "supportsInPerson", out var explicitInPerson)
                ? explicitInPerson
                : (facilitySnap is not null && HasJsonProperty(snapshotEl, "supportsInPerson")
                    ? facilitySnap.SupportsInPerson
                    : true);
            var supportsTeleconsult = TryGetJsonBoolean(snapshotEl, "supportsTeleconsult", out var explicitTeleconsult)
                ? explicitTeleconsult
                : (facilitySnap is not null && HasJsonProperty(snapshotEl, "supportsTeleconsult")
                    ? facilitySnap.SupportsTeleconsult
                    : (teleconsultBilling?.IsEnabled == true));

            var previousSubmission = allSubmissions
                .Where(r => r.Id != facilityReq.Id
                            && (r.SubmissionNumber < facilityReq.SubmissionNumber
                                || (r.SubmissionNumber == facilityReq.SubmissionNumber && r.SubmittedAtUtc < facilityReq.SubmittedAtUtc)))
                .OrderByDescending(r => r.SubmissionNumber)
                .ThenByDescending(r => r.SubmittedAtUtc)
                .FirstOrDefault();

            var resubmissionDiff = previousSubmission is null
                ? null
                : ComputeFacilityDiff(previousSubmission, facilityReq, children, snapshotEl);

            var evidenceKey = facilityReq.LtoEvidenceObjectKey ?? facilityReq.Facility.LtoEvidenceObjectKey;

            return new VerificationRequestDetailDto(
                Id: facilityReq.Id,
                Kind: "Facility",
                Status: facilityReq.Status,
                RequestKind: facilityReq.RequestKind,
                SubmissionNumber: facilityReq.SubmissionNumber,
                CorrelationId: facilityReq.CorrelationId,
                SubmittedAtUtc: facilityReq.SubmittedAtUtc,
                SubmittedByClinicUserId: facilityReq.SubmittedByClinicUserId,
                SubmittedByDisplayName: submittedBy,
                ReviewedAtUtc: facilityReq.ReviewedAtUtc,
                ReviewedByAdminUserId: facilityReq.ReviewedByAdminUserId,
                ReviewerNotes: facilityReq.ReviewerNotes,
                WithdrawnAtUtc: facilityReq.WithdrawnAtUtc,
                WithdrawnByActor: facilityReq.WithdrawnByActor,
                WithdrawalReason: facilityReq.WithdrawalReason,
                TenantId: facilityReq.TenantId,
                TenantSlug: facilityReq.Tenant.TenantSlug,
                TenantName: facilityReq.Tenant.Name,
                FacilityId: facilityReq.FacilityId,
                FacilityName: facilityReq.Facility.Name,
                FacilitySlug: facilityReq.Facility.Slug,
                FacilityVerificationStatus: facilityReq.Facility.PlatformVerificationStatus,
                DohLtoNumber: dohLtoNumber,
                EvidenceObjectKey: evidenceKey,
                LtoEvidenceObjectKey: evidenceKey,
                PrcEvidenceObjectKey: null,
                SubmittedSnapshotJson: facilityReq.SubmittedSnapshotJson,
                Snapshot: snapshotEl,
                HasNameMismatch: childDetails.Any(c => c.HasNameMismatch),
                ChildPractitionerRequests: childDetails,
                PrcMatchCandidates: childDetails.SelectMany(c => c.PrcMatchCandidates).DistinctBy(c => c.PractitionerId).ToList(),
                SubmissionHistory: history,
                DohLtoExpiryDate: dohLtoExpiryDate,
                ReviewedByDisplayName: reviewedByName,
                ReviewedByEmail: reviewedByEmail,
                ClinicContactNumber: clinicContactNumber,
                ClinicContactEmail: clinicContactEmail,
                PhilHealthAccreditationNumber: philHealthNumber,
                IsPhilHealthAccredited: isPhilHealthAccredited,
                SupportsInPerson: supportsInPerson,
                SupportsTeleconsult: supportsTeleconsult,
                UpdatedAtUtc: facilityReq.UpdatedAt,
                ResubmissionDiff: resubmissionDiff);
        }

        var pracReq = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
                .ThenInclude(f => f.Branch)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct);

        if (pracReq is null)
            return null;

        var candidates = await LoadCandidatesAsync([pracReq.NormalizedPrcLicenseNo], ct);
        var pracDetail = BuildChildDetail(pracReq, candidates);

        var allPracSubmissions = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Where(r => r.FacilityId == pracReq.FacilityId
                        && r.ClinicStaffMemberId == pracReq.ClinicStaffMemberId
                        && !r.IsDeleted)
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .ToListAsync(ct);

        var pracReviewerIds = allPracSubmissions
            .Select(r => r.ReviewedByAdminUserId)
            .Append(pracReq.ReviewedByAdminUserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var pracAdminDirectory = await VerificationIdentityResolver.LoadAdminDirectoryAsync(db, pracReviewerIds, ct);

        var pracSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pracReq.SubmittedSnapshotJson);
        var pracSnapshotEl = ParseJsonElement(pracReq.SubmittedSnapshotJson);

        var pracSubmitterDirectory = VerificationIdentityResolver.IsRawUserId(pracReq.SubmittedByDisplayName)
                                     && VerificationIdentityResolver.IsRawUserId(pracSnap?.SubmittedByDisplayName)
                                     && !string.IsNullOrWhiteSpace(pracReq.SubmittedByClinicUserId)
            ? await VerificationIdentityResolver.LoadSubmitterDirectoryAsync(db, [pracReq.TenantId], ct)
            : VerificationIdentityResolver.SubmitterDirectory.Empty;

        var pracSubmittedBy = VerificationIdentityResolver.ResolveSubmitterDisplayName(
            pracSubmitterDirectory,
            pracReq.TenantId,
            pracReq.Tenant,
            pracReq.SubmittedByClinicUserId,
            pracReq.SubmittedByDisplayName,
            pracSnap?.SubmittedByDisplayName,
            pracReq.ClinicStaffMemberId,
            pracSnap);

        var (pracReviewedByName, pracReviewedByEmail) = VerificationIdentityResolver.ResolveReviewer(
            pracAdminDirectory,
            pracReq.ReviewedByAdminUserId,
            pracReq.ReviewedByDisplayName,
            pracReq.ReviewedByEmail);

        var pracHistory = allPracSubmissions.Select(r =>
        {
            var (histName, histEmail) = VerificationIdentityResolver.ResolveReviewer(
                pracAdminDirectory,
                r.ReviewedByAdminUserId,
                r.ReviewedByDisplayName,
                r.ReviewedByEmail);

            return new VerificationSubmissionHistoryItemDto(
                r.Id,
                r.SubmissionNumber,
                r.RequestKind,
                r.Status,
                r.SubmittedAtUtc,
                r.ReviewedAtUtc,
                r.ReviewedByAdminUserId,
                r.ReviewerNotes,
                r.WithdrawnAtUtc,
                r.WithdrawalReason,
                histName,
                histEmail);
        }).ToList();

        var pracTeleconsultBilling = await db.WorkspaceTeleconsultBillings
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.TenantId == pracReq.TenantId && !b.IsDeleted, ct);

        var pracBranch = pracReq.Facility.Branch;
        var latestFacReq = await db.FacilityVerificationRequests
            .AsNoTracking()
            .Where(r => r.FacilityId == pracReq.FacilityId && !r.IsDeleted)
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .FirstOrDefaultAsync(ct);
        var latestFacSnap = latestFacReq is null
            ? null
            : DirectoryVerificationHelper.DeserializeFacilitySnapshot(latestFacReq.SubmittedSnapshotJson);
        var latestFacSnapEl = latestFacReq is null
            ? null
            : ParseJsonElement(latestFacReq.SubmittedSnapshotJson);

        var (pracPhilHealthNumber, pracIsPhilHealthAccredited) = ResolveFacilityPhilHealth(
            latestFacSnapEl,
            latestFacSnap,
            pracReq.Facility,
            pracBranch);

        var prevPracSubmission = allPracSubmissions
            .Where(r => r.Id != pracReq.Id
                        && (r.SubmissionNumber < pracReq.SubmissionNumber
                            || (r.SubmissionNumber == pracReq.SubmissionNumber && r.SubmittedAtUtc < pracReq.SubmittedAtUtc)))
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .FirstOrDefault();

        var pracResubmissionDiff = prevPracSubmission is null
            ? null
            : ComputePractitionerDiff(prevPracSubmission, pracReq);

        Practitioner? canonicalPractitioner = null;
        if (pracReq.PractitionerId.HasValue)
        {
            canonicalPractitioner = await db.Practitioners
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == pracReq.PractitionerId.Value && !p.IsDeleted, ct);
            if (canonicalPractitioner?.MergedIntoPractitionerId is { } mergedId)
            {
                canonicalPractitioner = await db.Practitioners
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == mergedId && !p.IsDeleted, ct)
                    ?? canonicalPractitioner;
            }
        }
        canonicalPractitioner ??= candidates.FirstOrDefault(p =>
            string.Equals(p.ProfessionKind, pracReq.ProfessionKind, StringComparison.OrdinalIgnoreCase)
            && string.Equals(p.NormalizedPrcLicenseNo, pracReq.NormalizedPrcLicenseNo, StringComparison.OrdinalIgnoreCase));

        return new VerificationRequestDetailDto(
            Id: pracReq.Id,
            Kind: "Practitioner",
            Status: pracReq.Status,
            RequestKind: pracReq.RequestKind,
            SubmissionNumber: pracReq.SubmissionNumber,
            CorrelationId: pracReq.CorrelationId,
            SubmittedAtUtc: pracReq.SubmittedAtUtc,
            SubmittedByClinicUserId: pracReq.SubmittedByClinicUserId,
            SubmittedByDisplayName: pracSubmittedBy,
            ReviewedAtUtc: pracReq.ReviewedAtUtc,
            ReviewedByAdminUserId: pracReq.ReviewedByAdminUserId,
            ReviewerNotes: pracReq.ReviewerNotes,
            WithdrawnAtUtc: pracReq.WithdrawnAtUtc,
            WithdrawnByActor: pracReq.WithdrawnByActor,
            WithdrawalReason: pracReq.WithdrawalReason,
            TenantId: pracReq.TenantId,
            TenantSlug: pracReq.Tenant.TenantSlug,
            TenantName: pracReq.Tenant.Name,
            FacilityId: pracReq.FacilityId,
            FacilityName: pracReq.Facility.Name,
            FacilitySlug: pracReq.Facility.Slug,
            FacilityVerificationStatus: pracReq.Facility.PlatformVerificationStatus,
            DohLtoNumber: pracReq.Facility.LicenseToOperate,
            EvidenceObjectKey: pracReq.PrcEvidenceObjectKey,
            LtoEvidenceObjectKey: pracReq.Facility.LtoEvidenceObjectKey,
            PrcEvidenceObjectKey: pracReq.PrcEvidenceObjectKey,
            SubmittedSnapshotJson: pracReq.SubmittedSnapshotJson,
            Snapshot: pracSnapshotEl,
            HasNameMismatch: pracDetail.HasNameMismatch,
            ChildPractitionerRequests: [pracDetail],
            PrcMatchCandidates: pracDetail.PrcMatchCandidates,
            SubmissionHistory: pracHistory,
            DohLtoExpiryDate: pracReq.Facility.LtoExpiryDate,
            ReviewedByDisplayName: pracReviewedByName,
            ReviewedByEmail: pracReviewedByEmail,
            ClinicContactNumber: FirstValidPhoneNumber(pracReq.Facility.ContactNumber, pracBranch?.ContactNumber, pracReq.Tenant.PhoneNumber),
            ClinicContactEmail: FirstNonEmpty(
                pracReq.Facility.ContactEmail,
                FirstEmailFallbackFromPhoneFields(pracReq.Facility.ContactNumber, pracBranch?.ContactNumber, pracReq.Tenant.PhoneNumber),
                pracBranch?.ContactEmail,
                pracReq.Tenant.Email),
            PhilHealthAccreditationNumber: pracPhilHealthNumber,
            IsPhilHealthAccredited: pracIsPhilHealthAccredited,
            SupportsInPerson: true,
            SupportsTeleconsult: pracTeleconsultBilling?.IsEnabled == true,
            UpdatedAtUtc: pracReq.UpdatedAt,
            ResubmissionDiff: pracResubmissionDiff,
            CanonicalPractitionerId: canonicalPractitioner?.Id,
            CanonicalPractitionerStatus: canonicalPractitioner?.VerificationStatus);
    }

    private async Task<List<Practitioner>> LoadCandidatesAsync(IReadOnlyCollection<string> normalizedPrcs, CancellationToken ct)
    {
        if (normalizedPrcs.Count == 0)
            return new List<Practitioner>();

        return await db.Practitioners
            .AsNoTracking()
            .Include(p => p.Affiliations)
                .ThenInclude(a => a.Facility)
            .Where(p => !p.IsDeleted
                        && p.MergedIntoPractitionerId == null
                        && normalizedPrcs.Contains(p.NormalizedPrcLicenseNo))
            .ToListAsync(ct);
    }

    private static ChildPractitionerRequestDetailDto BuildChildDetail(
        PractitionerVerificationRequest pr,
        IReadOnlyList<Practitioner> allCandidates)
    {
        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(pr.SubmittedSnapshotJson);
        var firstName = snap?.FirstName ?? string.Empty;
        var lastName = snap?.LastName ?? string.Empty;

        var matches = allCandidates
            .Where(p => string.Equals(p.NormalizedPrcLicenseNo, pr.NormalizedPrcLicenseNo, StringComparison.OrdinalIgnoreCase)
                        && string.Equals(p.ProfessionKind, pr.ProfessionKind, StringComparison.OrdinalIgnoreCase))
            .Select(p =>
            {
                var compatible = PractitionerIdentity.IsCompatibleNameMatch(p.FirstName, p.LastName, firstName, lastName);
                var activeAffiliations = p.Affiliations.Where(a => !a.IsDeleted && a.AffiliationStatus == "Active").ToList();
                return new PrcMatchCandidateDto(
                    PractitionerId: p.Id,
                    ProfessionKind: p.ProfessionKind,
                    NormalizedPrcLicenseNo: p.NormalizedPrcLicenseNo,
                    DisplayPrcLicenseNo: p.DisplayPrcLicenseNo,
                    FirstName: p.FirstName,
                    LastName: p.LastName,
                    Title: p.Title,
                    PrimarySpecialty: p.PrimarySpecialty,
                    VerificationStatus: p.VerificationStatus,
                    PrcExpiryDate: p.PrcExpiryDate,
                    VerifiedAtUtc: p.VerifiedAtUtc,
                    IsCompatibleNameMatch: compatible,
                    AffiliatedFacilityCount: activeAffiliations.Count,
                    AffiliatedClinics: activeAffiliations.Select(a => a.Facility?.Name ?? a.FacilityId.ToString()).ToList());
            })
            .ToList();

        var hasMismatch = (snap?.HasNameMismatch == true) || matches.Any(m => !m.IsCompatibleNameMatch);

        return new ChildPractitionerRequestDetailDto(
            Id: pr.Id,
            ClinicStaffMemberId: pr.ClinicStaffMemberId,
            PractitionerId: pr.PractitionerId,
            AffiliationId: pr.AffiliationId,
            SubmissionNumber: pr.SubmissionNumber,
            RequestKind: pr.RequestKind,
            ProfessionKind: pr.ProfessionKind,
            FirstName: firstName,
            LastName: lastName,
            Title: snap?.Title,
            SubmittedPrcLicenseNo: pr.SubmittedPrcLicenseNo,
            NormalizedPrcLicenseNo: pr.NormalizedPrcLicenseNo,
            PrcExpiryDate: pr.PrcExpiryDate,
            PrcEvidenceObjectKey: pr.PrcEvidenceObjectKey,
            VerificationContact: pr.VerificationContact,
            Specialty: snap?.Specialty,
            PublicBio: snap?.PublicBio,
            AvatarUrl: snap?.AvatarUrl,
            Status: pr.Status,
            HasNameMismatch: hasMismatch,
            PrcMatchCandidates: matches,
            Availabilities: snap?.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>());
    }

    private static ResubmissionDiffDto ComputeFacilityDiff(
        FacilityVerificationRequest prev,
        FacilityVerificationRequest curr,
        IReadOnlyList<PractitionerVerificationRequest> currChildren,
        JsonElement? currSnapEl)
    {
        var prevSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(prev.SubmittedSnapshotJson);
        var currSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(curr.SubmittedSnapshotJson);
        var prevSnapEl = ParseJsonElement(prev.SubmittedSnapshotJson);

        var changes = new List<FieldChangeDto>();

        AddChange(changes, "facilityName", "Clinic Name", prevSnap?.FacilityName, currSnap?.FacilityName);
        AddChange(changes, "facilitySlug", "Facility Slug", prevSnap?.FacilitySlug, currSnap?.FacilitySlug);
        AddChange(changes, "classification", "Classification", prevSnap?.Classification, currSnap?.Classification);
        AddChange(changes, "dohLtoNumber", "DOH LTO #", prevSnap?.DohLtoNumber, currSnap?.DohLtoNumber);
        AddChange(changes, "dohLtoExpiryDate", "DOH LTO Expiry Date",
            FormatDate(prevSnap?.DohLtoExpiryDate), FormatDate(currSnap?.DohLtoExpiryDate));
        AddChange(changes, "address", "Facility Address", prevSnap?.Address, currSnap?.Address);
        AddChange(changes, "contactNumber", "Clinic Phone", prevSnap?.ContactNumber, currSnap?.ContactNumber);
        AddChange(changes, "contactEmail", "Clinic Email", prevSnap?.ContactEmail, currSnap?.ContactEmail);
        AddChange(changes, "operatingHours", "Operating Hours", prevSnap?.OperatingHours, currSnap?.OperatingHours);

        if (prevSnap is not null && currSnap is not null && prevSnap.IsOnlineBookingPaused != currSnap.IsOnlineBookingPaused)
        {
            AddChange(changes, "isOnlineBookingPaused", "Online Booking",
                prevSnap.IsOnlineBookingPaused ? "Paused" : "Accepting Bookings",
                currSnap.IsOnlineBookingPaused ? "Paused" : "Accepting Bookings");
        }

        AddChange(changes, "philHealthAccreditationNumber", "PhilHealth / YAKAP #",
            prevSnap?.PhilHealthAccreditationNumber, currSnap?.PhilHealthAccreditationNumber);

        if (prevSnap is not null && currSnap is not null)
        {
            if (HasJsonProperty(prevSnapEl, "isPhilHealthAccredited") || currSnap.IsPhilHealthAccredited)
            {
                AddChange(changes, "isPhilHealthAccredited", "PhilHealth Accredited",
                    prevSnap.IsPhilHealthAccredited ? "Yes" : "No",
                    currSnap.IsPhilHealthAccredited ? "Yes" : "No");
            }

            if (HasJsonProperty(prevSnapEl, "supportsInPerson") || !currSnap.SupportsInPerson)
            {
                AddChange(changes, "supportsInPerson", "In-Person Consultations",
                    prevSnap.SupportsInPerson ? "Yes" : "No",
                    currSnap.SupportsInPerson ? "Yes" : "No");
            }

            if (HasJsonProperty(prevSnapEl, "supportsTeleconsult") || currSnap.SupportsTeleconsult)
            {
                AddChange(changes, "supportsTeleconsult", "Teleconsultation",
                    prevSnap.SupportsTeleconsult ? "Yes" : "No",
                    currSnap.SupportsTeleconsult ? "Yes" : "No");
            }
        }

        // Declared Services diff
        var prevServices = prevSnap?.Services ?? Array.Empty<ClinicServiceDto>();
        var currServices = currSnap?.Services ?? Array.Empty<ClinicServiceDto>();
        CompareServices(prevServices, currServices, changes);

        // LTO proof diff
        var prevLtoKey = Normalize(prev.LtoEvidenceObjectKey ?? prevSnap?.LtoEvidenceObjectKey);
        var currLtoKey = Normalize(curr.LtoEvidenceObjectKey ?? currSnap?.LtoEvidenceObjectKey);
        var ltoProofUpdated = !string.Equals(prevLtoKey, currLtoKey, StringComparison.Ordinal);

        // Bundled practitioner diff
        var activeCurrChildren = SelectDiffChildren(curr.Status, currChildren);
        var prevChildren = SelectDiffChildren(prev.Status, prev.PractitionerRequests);
        var updatedChildIds = new List<Guid>();
        var updatedChildProofIds = new List<Guid>();

        foreach (var currChild in activeCurrChildren)
        {
            var prevChild = prevChildren.FirstOrDefault(p => p.ClinicStaffMemberId == currChild.ClinicStaffMemberId)
                ?? prevChildren.FirstOrDefault(p =>
                    !string.IsNullOrWhiteSpace(currChild.NormalizedPrcLicenseNo)
                    && string.Equals(p.NormalizedPrcLicenseNo, currChild.NormalizedPrcLicenseNo, StringComparison.OrdinalIgnoreCase));

            var currChildSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(currChild.SubmittedSnapshotJson);
            var currChildName = currChildSnap is not null
                ? DirectoryVerificationHelper.FormatDisplayName(currChildSnap.Title, currChildSnap.FirstName, currChildSnap.LastName)
                : currChild.SubmittedPrcLicenseNo;

            if (prevChild is null)
            {
                updatedChildIds.Add(currChild.Id);
                if (!string.IsNullOrWhiteSpace(currChild.PrcEvidenceObjectKey))
                    updatedChildProofIds.Add(currChild.Id);

                changes.Add(new FieldChangeDto(
                    $"practitioner:{currChild.ClinicStaffMemberId}",
                    "Bundled Clinician",
                    null,
                    currChildName,
                    "Added"));
                continue;
            }

            var prevChildSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(prevChild.SubmittedSnapshotJson);
            var prevProof = Normalize(prevChild.PrcEvidenceObjectKey ?? prevChildSnap?.PrcEvidenceObjectKey);
            var currProof = Normalize(currChild.PrcEvidenceObjectKey ?? currChildSnap?.PrcEvidenceObjectKey);
            var proofChanged = !string.Equals(prevProof, currProof, StringComparison.Ordinal);

            if (proofChanged)
                updatedChildProofIds.Add(currChild.Id);

            var profileChanged = proofChanged || HasPractitionerChanged(prevChild, prevChildSnap, currChild, currChildSnap);
            if (profileChanged)
                updatedChildIds.Add(currChild.Id);
        }

        foreach (var prevChild in prevChildren)
        {
            var stillPresent = activeCurrChildren.Any(c =>
                c.ClinicStaffMemberId == prevChild.ClinicStaffMemberId
                || (!string.IsNullOrWhiteSpace(prevChild.NormalizedPrcLicenseNo)
                    && string.Equals(c.NormalizedPrcLicenseNo, prevChild.NormalizedPrcLicenseNo, StringComparison.OrdinalIgnoreCase)));

            var stillInCurrentSnapshot = currSnap?.Practitioners?.Any(p =>
                p.ClinicStaffMemberId == prevChild.ClinicStaffMemberId
                || (!string.IsNullOrWhiteSpace(prevChild.NormalizedPrcLicenseNo)
                    && string.Equals(
                        DirectoryVerificationHelper.NormalizePrcOrFallback(p.NormalizedPrcLicenseNo, p.SubmittedPrcLicenseNo),
                        prevChild.NormalizedPrcLicenseNo,
                        StringComparison.OrdinalIgnoreCase))) == true;

            if (!stillPresent && !stillInCurrentSnapshot)
            {
                var prevChildSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(prevChild.SubmittedSnapshotJson);
                var prevChildName = prevChildSnap is not null
                    ? DirectoryVerificationHelper.FormatDisplayName(prevChildSnap.Title, prevChildSnap.FirstName, prevChildSnap.LastName)
                    : prevChild.SubmittedPrcLicenseNo;

                changes.Add(new FieldChangeDto(
                    $"practitioner:{prevChild.ClinicStaffMemberId}",
                    "Bundled Clinician",
                    prevChildName,
                    null,
                    "Removed"));
            }
        }

        return new ResubmissionDiffDto(
            PreviousRequestId: prev.Id,
            PreviousSubmissionNumber: prev.SubmissionNumber,
            PreviousStatus: prev.Status,
            PreviousSubmittedAtUtc: prev.SubmittedAtUtc,
            PreviousReason: FirstNonEmpty(prev.WithdrawalReason, prev.ReviewerNotes),
            LtoProofUpdated: ltoProofUpdated,
            PrcProofUpdated: updatedChildProofIds.Count > 0,
            UpdatedChildPractitionerIds: updatedChildIds,
            UpdatedChildPrcProofIds: updatedChildProofIds,
            ChangedFields: changes);
    }

    private static ResubmissionDiffDto ComputePractitionerDiff(
        PractitionerVerificationRequest prev,
        PractitionerVerificationRequest curr)
    {
        var prevSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(prev.SubmittedSnapshotJson);
        var currSnap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(curr.SubmittedSnapshotJson);

        var changes = new List<FieldChangeDto>();

        AddChange(changes, "professionKind", "Profession", prev.ProfessionKind, curr.ProfessionKind);

        var prevName = prevSnap is null
            ? null
            : DirectoryVerificationHelper.FormatDisplayName(prevSnap.Title, prevSnap.FirstName, prevSnap.LastName);
        var currName = currSnap is null
            ? null
            : DirectoryVerificationHelper.FormatDisplayName(currSnap.Title, currSnap.FirstName, currSnap.LastName);
        AddChange(changes, "name", "Practitioner Name", prevName, currName);

        AddChange(changes, "submittedPrcLicenseNo", "PRC License #", prev.SubmittedPrcLicenseNo, curr.SubmittedPrcLicenseNo);
        AddChange(changes, "prcExpiryDate", "PRC Expiry Date", FormatDate(prev.PrcExpiryDate), FormatDate(curr.PrcExpiryDate));
        AddChange(changes, "verificationContact", "Verification Contact", prev.VerificationContact, curr.VerificationContact);
        AddChange(changes, "specialty", "Specialty", prevSnap?.Specialty, currSnap?.Specialty);
        AddChange(changes, "publicBio", "Public Bio", prevSnap?.PublicBio, currSnap?.PublicBio);
        AddChange(changes, "avatarUrl", "Avatar", prevSnap?.AvatarUrl, currSnap?.AvatarUrl);
        AddChange(changes, "availabilities", "Schedule Summary",
            FormatAvailabilities(prevSnap?.Availabilities), FormatAvailabilities(currSnap?.Availabilities));

        var prevProof = Normalize(prev.PrcEvidenceObjectKey ?? prevSnap?.PrcEvidenceObjectKey);
        var currProof = Normalize(curr.PrcEvidenceObjectKey ?? currSnap?.PrcEvidenceObjectKey);
        var prcProofUpdated = !string.Equals(prevProof, currProof, StringComparison.Ordinal);

        return new ResubmissionDiffDto(
            PreviousRequestId: prev.Id,
            PreviousSubmissionNumber: prev.SubmissionNumber,
            PreviousStatus: prev.Status,
            PreviousSubmittedAtUtc: prev.SubmittedAtUtc,
            PreviousReason: FirstNonEmpty(prev.WithdrawalReason, prev.ReviewerNotes),
            LtoProofUpdated: false,
            PrcProofUpdated: prcProofUpdated,
            UpdatedChildPractitionerIds: [],
            UpdatedChildPrcProofIds: [],
            ChangedFields: changes);
    }

    private static bool HasPractitionerChanged(
        PractitionerVerificationRequest prev,
        PractitionerRequestSnapshot? prevSnap,
        PractitionerVerificationRequest curr,
        PractitionerRequestSnapshot? currSnap)
    {
        if (!string.Equals(Normalize(prev.ProfessionKind), Normalize(curr.ProfessionKind), StringComparison.OrdinalIgnoreCase))
            return true;
        if (!string.Equals(Normalize(prev.SubmittedPrcLicenseNo), Normalize(curr.SubmittedPrcLicenseNo), StringComparison.OrdinalIgnoreCase))
            return true;
        if (prev.PrcExpiryDate != curr.PrcExpiryDate)
            return true;
        if (!string.Equals(Normalize(prev.VerificationContact), Normalize(curr.VerificationContact), StringComparison.OrdinalIgnoreCase))
            return true;

        var prevName = prevSnap is null
            ? null
            : DirectoryVerificationHelper.FormatDisplayName(prevSnap.Title, prevSnap.FirstName, prevSnap.LastName);
        var currName = currSnap is null
            ? null
            : DirectoryVerificationHelper.FormatDisplayName(currSnap.Title, currSnap.FirstName, currSnap.LastName);
        if (!string.Equals(Normalize(prevName), Normalize(currName), StringComparison.Ordinal))
            return true;
        if (!string.Equals(Normalize(prevSnap?.Specialty), Normalize(currSnap?.Specialty), StringComparison.Ordinal))
            return true;
        if (!string.Equals(Normalize(prevSnap?.PublicBio), Normalize(currSnap?.PublicBio), StringComparison.Ordinal))
            return true;
        if (!string.Equals(Normalize(prevSnap?.AvatarUrl), Normalize(currSnap?.AvatarUrl), StringComparison.Ordinal))
            return true;
        if (!string.Equals(FormatAvailabilities(prevSnap?.Availabilities), FormatAvailabilities(currSnap?.Availabilities), StringComparison.Ordinal))
            return true;

        return false;
    }

    private static void CompareServices(
        IReadOnlyList<ClinicServiceDto> prevServices,
        IReadOnlyList<ClinicServiceDto> currServices,
        List<FieldChangeDto> changes)
    {
        static string ServiceKey(ClinicServiceDto s) =>
            s.ServiceId != Guid.Empty
                ? s.ServiceId.ToString("D")
                : $"{s.Name?.Trim()}|{s.Category?.Trim()}";

        var prevMap = prevServices
            .GroupBy(ServiceKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var currMap = currServices
            .GroupBy(ServiceKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var added = 0;
        var removed = 0;
        var modified = 0;

        foreach (var kv in currMap)
        {
            if (!prevMap.TryGetValue(kv.Key, out var prevSvc))
            {
                added++;
            }
            else if (!string.Equals(Normalize(prevSvc.Name), Normalize(kv.Value.Name), StringComparison.Ordinal)
                     || !string.Equals(Normalize(prevSvc.Category), Normalize(kv.Value.Category), StringComparison.Ordinal)
                     || prevSvc.StandardPrice != kv.Value.StandardPrice
                     || prevSvc.IsActive != kv.Value.IsActive)
            {
                modified++;
            }
        }

        foreach (var key in prevMap.Keys)
        {
            if (!currMap.ContainsKey(key))
                removed++;
        }

        if (added == 0 && removed == 0 && modified == 0)
            return;

        var changeKind = prevServices.Count == 0 && currServices.Count > 0
            ? "Added"
            : prevServices.Count > 0 && currServices.Count == 0
                ? "Removed"
                : "Modified";

        var parts = new List<string>();
        if (added > 0) parts.Add($"+{added} added");
        if (modified > 0) parts.Add($"{modified} updated");
        if (removed > 0) parts.Add($"-{removed} removed");

        var currentSummary = parts.Count > 0
            ? $"{currServices.Count} service(s) ({string.Join(", ", parts)})"
            : $"{currServices.Count} service(s)";

        changes.Add(new FieldChangeDto(
            "services",
            "Declared Clinic Services",
            $"{prevServices.Count} service(s)",
            currentSummary,
            changeKind));
    }

    private static void AddChange(
        List<FieldChangeDto> changes,
        string fieldKey,
        string label,
        string? prevValue,
        string? currValue)
    {
        var prev = Normalize(prevValue);
        var curr = Normalize(currValue);
        if (string.Equals(prev, curr, StringComparison.Ordinal))
            return;

        var changeKind = prev is null
            ? "Added"
            : curr is null
                ? "Removed"
                : "Modified";

        changes.Add(new FieldChangeDto(fieldKey, label, prev, curr, changeKind));
    }

    private static string? FormatDate(DateOnly? date) =>
        date.HasValue ? date.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

    private static string? FormatAvailabilities(IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities)
    {
        if (availabilities is null || availabilities.Count == 0)
            return null;

        var items = availabilities
            .OrderBy(a => a.DayOfWeek)
            .ThenBy(a => a.StartTime, StringComparer.Ordinal)
            .ThenBy(a => a.EndTime, StringComparer.Ordinal)
            .ThenBy(a => a.SlotDurationMinutes)
            .Select(a => $"{ShortDay(a.DayOfWeek)} {a.StartTime}-{a.EndTime} ({a.SlotDurationMinutes}m)");

        return string.Join("; ", items);
    }

    private static string ShortDay(DayOfWeek day) => day switch
    {
        DayOfWeek.Sunday => "Sun",
        DayOfWeek.Monday => "Mon",
        DayOfWeek.Tuesday => "Tue",
        DayOfWeek.Wednesday => "Wed",
        DayOfWeek.Thursday => "Thu",
        DayOfWeek.Friday => "Fri",
        DayOfWeek.Saturday => "Sat",
        _ => day.ToString()
    };

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

    private static string? FirstValidPhoneNumber(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v) && !DirectoryVerificationHelper.IsPureEmailAddress(v))?.Trim();

    private static string? FirstEmailFallbackFromPhoneFields(params string?[] values) =>
        values.FirstOrDefault(DirectoryVerificationHelper.IsPureEmailAddress)?.Trim();

    private static List<PractitionerVerificationRequest> SelectDiffChildren(
        string parentStatus,
        IEnumerable<PractitionerVerificationRequest> children)
    {
        return parentStatus switch
        {
            "Withdrawn" => children
                .Where(c => !c.IsDeleted
                            && c.Status != "Superseded"
                            && !(c.Status == "Withdrawn"
                                 && string.Equals(c.WithdrawalReason, "Removed from pending facility submission.", StringComparison.Ordinal)))
                .ToList(),
            "Superseded" => children
                .Where(c => !c.IsDeleted && c.Status != "Withdrawn")
                .ToList(),
            _ => children
                .Where(c => !c.IsDeleted && c.Status is not ("Withdrawn" or "Superseded"))
                .ToList()
        };
    }

    private static (string? PhilHealthNumber, bool IsPhilHealthAccredited) ResolveFacilityPhilHealth(
        JsonElement? snapshotEl,
        FacilityVerificationRequestedPayload? facilitySnap,
        Facility facility,
        Branch? branch)
    {
        var hasExplicitPhilHealthFlag = TryGetJsonBoolean(snapshotEl, "isPhilHealthAccredited", out var explicitPhilHealth);
        var hasPhilHealthNumberKey = TryGetJsonPropertyCaseInsensitive(snapshotEl, "philHealthAccreditationNumber", out var philHealthNumberProp);
        var suppressPhilHealthFallback = (hasExplicitPhilHealthFlag && !explicitPhilHealth)
            || (hasPhilHealthNumberKey
                && (philHealthNumberProp.ValueKind == JsonValueKind.Null
                    || (philHealthNumberProp.ValueKind == JsonValueKind.String
                        && string.IsNullOrWhiteSpace(philHealthNumberProp.GetString()))));

        var philHealthNumber = suppressPhilHealthFallback
            ? Normalize(facilitySnap?.PhilHealthAccreditationNumber)
            : FirstNonEmpty(
                facilitySnap?.PhilHealthAccreditationNumber,
                facility.PhilHealthAccreditationNumber,
                branch?.PhilHealthAccreditationNumber);
        var isPhilHealthAccredited = hasExplicitPhilHealthFlag
            ? explicitPhilHealth
            : (facilitySnap is not null && HasJsonProperty(snapshotEl, "isPhilHealthAccredited")
                ? facilitySnap.IsPhilHealthAccredited
                : (!suppressPhilHealthFallback && (branch?.IsPhilHealthAccredited == true || !string.IsNullOrWhiteSpace(philHealthNumber))));

        return (philHealthNumber, isPhilHealthAccredited);
    }

    private static bool TryGetJsonBoolean(JsonElement? element, string propertyName, out bool value)
    {
        if (TryGetJsonPropertyCaseInsensitive(element, propertyName, out var prop))
        {
            if (prop.ValueKind == JsonValueKind.True)
            {
                value = true;
                return true;
            }

            if (prop.ValueKind == JsonValueKind.False)
            {
                value = false;
                return true;
            }
        }

        value = false;
        return false;
    }

    private static bool HasJsonProperty(JsonElement? element, string propertyName) =>
        TryGetJsonPropertyCaseInsensitive(element, propertyName, out var prop)
        && prop.ValueKind != JsonValueKind.Null;

    internal static string? ResolveDohLtoNumber(
        JsonElement? snapshotEl,
        FacilityVerificationRequestedPayload? facilitySnap,
        string? facilityFallback)
    {
        if (!string.IsNullOrWhiteSpace(facilitySnap?.DohLtoNumber))
            return facilitySnap.DohLtoNumber.Trim();

        if (TryGetJsonPropertyCaseInsensitive(snapshotEl, "dohLtoNumber", out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Null)
                return null;

            if (prop.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(prop.GetString()))
                return null;
        }

        return FirstNonEmpty(facilityFallback);
    }

    internal static DateOnly? ResolveDohLtoExpiryDate(
        JsonElement? snapshotEl,
        FacilityVerificationRequestedPayload? facilitySnap,
        DateOnly? facilityFallback)
    {
        if (facilitySnap?.DohLtoExpiryDate is { } explicitDate)
            return explicitDate;

        if (TryGetJsonPropertyCaseInsensitive(snapshotEl, "dohLtoExpiryDate", out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Null)
                return null;

            if (facilitySnap is not null)
                return facilitySnap.DohLtoExpiryDate;
        }

        return facilityFallback;
    }

    private static bool TryGetJsonPropertyCaseInsensitive(
        JsonElement? element,
        string propertyName,
        out JsonElement value)
    {
        if (element.HasValue && element.Value.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in element.Value.EnumerateObject())
            {
                if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                {
                    value = prop.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    internal static JsonElement? ParseJsonElement(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }
}

internal static class VerificationIdentityResolver
{
    public sealed record AdminLookupEntry(Guid Id, string? ClerkUserId, string Email, string FullName);

    public sealed record MemberLookupEntry(Guid Id, Guid TenantId, string? UserId, string Email, string FullName);

    public sealed record AuditLookupEntry(Guid TenantId, string ActorUserId, string ActorName, DateTime CreatedAt);

    public sealed class AdminDirectory
    {
        public static readonly AdminDirectory Empty = new([]);
        private readonly Dictionary<string, AdminLookupEntry> _byKey = new(StringComparer.OrdinalIgnoreCase);

        public AdminDirectory(IEnumerable<AdminLookupEntry> admins)
        {
            foreach (var admin in admins)
            {
                _byKey.TryAdd(admin.Id.ToString(), admin);
                if (!string.IsNullOrWhiteSpace(admin.ClerkUserId))
                    _byKey.TryAdd(admin.ClerkUserId.Trim(), admin);
                if (!string.IsNullOrWhiteSpace(admin.Email))
                    _byKey.TryAdd(admin.Email.Trim(), admin);
            }
        }

        public AdminLookupEntry? Find(string adminUserId) =>
            _byKey.TryGetValue(adminUserId.Trim(), out var match) ? match : null;
    }

    public sealed class SubmitterDirectory
    {
        public static readonly SubmitterDirectory Empty = new([], []);

        private readonly Dictionary<Guid, List<MemberLookupEntry>> _membersByTenant;
        private readonly Dictionary<(Guid TenantId, string ActorUserId), string> _auditNames;

        public SubmitterDirectory(
            IEnumerable<MemberLookupEntry> members,
            IEnumerable<AuditLookupEntry> auditEntries)
        {
            _membersByTenant = members
                .GroupBy(m => m.TenantId)
                .ToDictionary(g => g.Key, g => g.ToList());

            _auditNames = new Dictionary<(Guid, string), string>();
            foreach (var entry in auditEntries.OrderByDescending(a => a.CreatedAt))
            {
                if (IsRawUserId(entry.ActorName)
                    || string.Equals(entry.ActorName.Trim(), "Clinic Admin", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(entry.ActorName.Trim(), "System", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                _auditNames.TryAdd((entry.TenantId, entry.ActorUserId.Trim()), entry.ActorName.Trim());
            }
        }

        public MemberLookupEntry? FindMember(Guid tenantId, string clinicUserId)
        {
            if (!_membersByTenant.TryGetValue(tenantId, out var list))
                return null;

            var id = clinicUserId.Trim();
            Guid.TryParse(id, out var idGuid);

            return list.FirstOrDefault(m =>
                (!string.IsNullOrWhiteSpace(m.UserId) && string.Equals(m.UserId.Trim(), id, StringComparison.OrdinalIgnoreCase))
                || (idGuid != Guid.Empty && m.Id == idGuid)
                || (!string.IsNullOrWhiteSpace(m.Email) && string.Equals(m.Email.Trim(), id, StringComparison.OrdinalIgnoreCase)));
        }

        public string? FindAuditActorName(Guid tenantId, string clinicUserId) =>
            _auditNames.TryGetValue((tenantId, clinicUserId.Trim()), out var name) ? name : null;
    }

    public static bool IsRawUserId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var trimmed = value.Trim();
        if (Guid.TryParse(trimmed, out _))
            return true;

        if (trimmed.StartsWith("user_", StringComparison.OrdinalIgnoreCase) && !trimmed.Contains(' '))
            return true;

        return false;
    }

    public static async Task<AdminDirectory> LoadAdminDirectoryAsync(
        IApplicationDbContext db,
        IReadOnlyCollection<string> reviewerIds,
        CancellationToken ct)
    {
        var queryIds = reviewerIds
            .Where(id => !string.IsNullOrWhiteSpace(id)
                         && !string.Equals(id, "practitioner-otp", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (queryIds.Count == 0)
            return AdminDirectory.Empty;

        var adminGuids = new List<Guid>();
        foreach (var id in queryIds)
        {
            if (Guid.TryParse(id, out var g))
                adminGuids.Add(g);
        }

        var lowerIds = queryIds
            .Select(id => id.Trim().ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var admins = await db.AdminUsers
            .AsNoTracking()
            .Where(a => !a.IsDeleted && (
                (a.ClerkUserId != null && queryIds.Contains(a.ClerkUserId))
                || lowerIds.Contains(a.Email.ToLower())
                || adminGuids.Contains(a.Id)))
            .Select(a => new AdminLookupEntry(a.Id, a.ClerkUserId, a.Email, a.FullName))
            .ToListAsync(ct);

        return new AdminDirectory(admins);
    }

    public static async Task<SubmitterDirectory> LoadSubmitterDirectoryAsync(
        IApplicationDbContext db,
        IReadOnlyCollection<Guid> tenantIds,
        CancellationToken ct)
    {
        if (tenantIds.Count == 0)
            return SubmitterDirectory.Empty;

        var members = await db.WorkspaceMembers
            .AsNoTracking()
            .Where(m => !m.IsDeleted && tenantIds.Contains(m.TenantId))
            .Select(m => new MemberLookupEntry(m.Id, m.TenantId, m.UserId, m.Email, m.FullName))
            .ToListAsync(ct);

        var audits = await db.WorkspaceAuditEntries
            .AsNoTracking()
            .Where(a => !a.IsDeleted && tenantIds.Contains(a.TenantId))
            .Select(a => new AuditLookupEntry(a.TenantId, a.ActorUserId, a.ActorName, a.CreatedAt))
            .ToListAsync(ct);

        return new SubmitterDirectory(members, audits);
    }

    public static (string? DisplayName, string? Email) ResolveReviewer(
        AdminDirectory adminDirectory,
        string? reviewedByAdminUserId,
        string? storedDisplayName,
        string? storedEmail)
    {
        var cleanStoredEmail = string.IsNullOrWhiteSpace(storedEmail) ? null : storedEmail.Trim();

        if (string.Equals(reviewedByAdminUserId?.Trim(), "practitioner-otp", StringComparison.OrdinalIgnoreCase))
        {
            var otpDisplay = !IsRawUserId(storedDisplayName)
                ? storedDisplayName!.Trim()
                : "Practitioner (OTP Confirmation)";
            return (otpDisplay, cleanStoredEmail);
        }

        var adminMatch = !string.IsNullOrWhiteSpace(reviewedByAdminUserId)
            ? adminDirectory.Find(reviewedByAdminUserId)
            : null;

        var resolvedEmail = cleanStoredEmail ?? (string.IsNullOrWhiteSpace(adminMatch?.Email) ? null : adminMatch.Email.Trim());

        if (!IsRawUserId(storedDisplayName))
            return (storedDisplayName!.Trim(), resolvedEmail);

        if (adminMatch is not null)
        {
            var adminName = !IsRawUserId(adminMatch.FullName)
                ? adminMatch.FullName.Trim()
                : (!string.IsNullOrWhiteSpace(adminMatch.Email) ? adminMatch.Email.Trim() : null);
            return (adminName, resolvedEmail);
        }

        if (!IsRawUserId(reviewedByAdminUserId))
            return (reviewedByAdminUserId!.Trim(), resolvedEmail);

        return (null, resolvedEmail);
    }

    public static string? ResolveSubmitterDisplayName(
        SubmitterDirectory submitterDirectory,
        Guid tenantId,
        Tenant tenant,
        string? submittedByClinicUserId,
        string? storedEntityDisplayName,
        string? storedSnapshotDisplayName,
        Guid? clinicStaffMemberId = null,
        PractitionerRequestSnapshot? practitionerSnapshot = null)
    {
        if (!IsRawUserId(storedEntityDisplayName))
            return storedEntityDisplayName!.Trim();

        if (!IsRawUserId(storedSnapshotDisplayName))
            return storedSnapshotDisplayName!.Trim();

        if (!string.IsNullOrWhiteSpace(submittedByClinicUserId))
        {
            var userId = submittedByClinicUserId.Trim();

            var member = submitterDirectory.FindMember(tenantId, userId);
            if (member is not null)
            {
                if (!IsRawUserId(member.FullName))
                    return member.FullName.Trim();
                if (!string.IsNullOrWhiteSpace(member.Email))
                    return member.Email.Trim();
            }

            if (string.Equals(tenant.OwnerId?.Trim(), userId, StringComparison.OrdinalIgnoreCase))
            {
                var ownerName = string.Join(" ", new[] { tenant.FirstName, tenant.LastName }
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Select(s => s!.Trim()));
                if (!IsRawUserId(ownerName))
                    return ownerName;
                if (!string.IsNullOrWhiteSpace(tenant.Email))
                    return tenant.Email.Trim();
            }

            var auditActorName = submitterDirectory.FindAuditActorName(tenantId, userId);
            if (!IsRawUserId(auditActorName))
                return auditActorName;

            if (clinicStaffMemberId.HasValue
                && practitionerSnapshot is not null
                && Guid.TryParse(userId, out var submitterGuid)
                && submitterGuid == clinicStaffMemberId.Value)
            {
                var selfName = DirectoryVerificationHelper.FormatDisplayName(
                    practitionerSnapshot.Title,
                    practitionerSnapshot.FirstName,
                    practitionerSnapshot.LastName);
                if (!IsRawUserId(selfName))
                    return selfName;
            }

            if (!IsRawUserId(userId))
                return userId;
        }

        return null;
    }
}
