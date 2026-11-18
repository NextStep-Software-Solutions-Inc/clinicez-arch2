using System;
using System.Collections.Generic;
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
    string? ReviewerNotes);

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
    string? WithdrawalReason);

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
    List<VerificationSubmissionHistoryItemDto> SubmissionHistory);

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
                var childHasMismatch = r.PractitionerRequests
                    .Where(c => !c.IsDeleted)
                    .Any(c =>
                    {
                        var snap = DirectoryVerificationHelper.DeserializePractitionerSnapshot(c.SubmittedSnapshotJson);
                        return HasNameMismatch(canonicalPractitioners, c.ProfessionKind, c.NormalizedPrcLicenseNo, snap);
                    });

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
                    SubmittedByDisplayName: r.SubmittedByDisplayName ?? r.SubmittedByClinicUserId,
                    DohLtoNumber: facilitySnap?.DohLtoNumber ?? r.Facility.LicenseToOperate,
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
                    ReviewerNotes: r.ReviewerNotes));
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
                    SubmittedByDisplayName: pr.SubmittedByClinicUserId,
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
                    ReviewerNotes: pr.ReviewerNotes));
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

            var history = await db.FacilityVerificationRequests
                .AsNoTracking()
                .Where(r => r.FacilityId == facilityReq.FacilityId && !r.IsDeleted)
                .OrderByDescending(r => r.SubmissionNumber)
                .ThenByDescending(r => r.SubmittedAtUtc)
                .Select(r => new VerificationSubmissionHistoryItemDto(
                    r.Id,
                    r.SubmissionNumber,
                    r.RequestKind,
                    r.Status,
                    r.SubmittedAtUtc,
                    r.ReviewedAtUtc,
                    r.ReviewedByAdminUserId,
                    r.ReviewerNotes,
                    r.WithdrawnAtUtc,
                    r.WithdrawalReason))
                .ToListAsync(ct);

            var facilitySnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facilityReq.SubmittedSnapshotJson);
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
                SubmittedByDisplayName: facilityReq.SubmittedByDisplayName,
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
                DohLtoNumber: facilitySnap?.DohLtoNumber ?? facilityReq.Facility.LicenseToOperate,
                EvidenceObjectKey: evidenceKey,
                LtoEvidenceObjectKey: evidenceKey,
                PrcEvidenceObjectKey: null,
                SubmittedSnapshotJson: facilityReq.SubmittedSnapshotJson,
                Snapshot: ParseJsonElement(facilityReq.SubmittedSnapshotJson),
                HasNameMismatch: childDetails.Any(c => c.HasNameMismatch),
                ChildPractitionerRequests: childDetails,
                PrcMatchCandidates: childDetails.SelectMany(c => c.PrcMatchCandidates).DistinctBy(c => c.PractitionerId).ToList(),
                SubmissionHistory: history);
        }

        var pracReq = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Include(r => r.Tenant)
            .Include(r => r.Facility)
            .FirstOrDefaultAsync(r => r.Id == request.RequestId && !r.IsDeleted, ct);

        if (pracReq is null)
            return null;

        var candidates = await LoadCandidatesAsync([pracReq.NormalizedPrcLicenseNo], ct);
        var pracDetail = BuildChildDetail(pracReq, candidates);

        var pracHistory = await db.PractitionerVerificationRequests
            .AsNoTracking()
            .Where(r => r.FacilityId == pracReq.FacilityId
                        && r.ClinicStaffMemberId == pracReq.ClinicStaffMemberId
                        && !r.IsDeleted)
            .OrderByDescending(r => r.SubmissionNumber)
            .ThenByDescending(r => r.SubmittedAtUtc)
            .Select(r => new VerificationSubmissionHistoryItemDto(
                r.Id,
                r.SubmissionNumber,
                r.RequestKind,
                r.Status,
                r.SubmittedAtUtc,
                r.ReviewedAtUtc,
                r.ReviewedByAdminUserId,
                r.ReviewerNotes,
                r.WithdrawnAtUtc,
                r.WithdrawalReason))
            .ToListAsync(ct);

        return new VerificationRequestDetailDto(
            Id: pracReq.Id,
            Kind: "Practitioner",
            Status: pracReq.Status,
            RequestKind: pracReq.RequestKind,
            SubmissionNumber: pracReq.SubmissionNumber,
            CorrelationId: pracReq.CorrelationId,
            SubmittedAtUtc: pracReq.SubmittedAtUtc,
            SubmittedByClinicUserId: pracReq.SubmittedByClinicUserId,
            SubmittedByDisplayName: pracReq.SubmittedByClinicUserId,
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
            Snapshot: ParseJsonElement(pracReq.SubmittedSnapshotJson),
            HasNameMismatch: pracDetail.HasNameMismatch,
            ChildPractitionerRequests: [pracDetail],
            PrcMatchCandidates: pracDetail.PrcMatchCandidates,
            SubmissionHistory: pracHistory);
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

    private static JsonElement? ParseJsonElement(string json)
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
