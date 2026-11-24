using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Shared validation, credential change detection, and resubmission dispatch helpers
/// for regulated facility DOH LTO directory verification credentials.
/// </summary>
public static class FacilityDirectoryValidationHelper
{
    private static readonly HashSet<string> AllowedEvidenceExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png"
    };

    public static bool HasRegulatedLtoCredentialsChanged(
        string? previousDohLto,
        string? updatedDohLto,
        DateOnly? previousExpiry,
        DateOnly? updatedExpiry,
        string? previousProofKey,
        string? updatedProofKey)
    {
        var prevLto = Normalize(previousDohLto);
        var nextLto = Normalize(updatedDohLto);
        if (!string.Equals(prevLto, nextLto, StringComparison.Ordinal))
        {
            return true;
        }

        if (previousExpiry != updatedExpiry)
        {
            return true;
        }

        var prevKey = Normalize(previousProofKey);
        var nextKey = Normalize(updatedProofKey);
        return !string.Equals(prevKey, nextKey, StringComparison.Ordinal);
    }

    public static string? ValidateLtoEvidenceObjectKeyForClinic(
        string tenantId,
        Guid clinicId,
        string? existingKey,
        string? candidateKey)
    {
        var normalized = Normalize(candidateKey);
        if (normalized == null)
        {
            return null;
        }

        if (normalized.Length > 512
            || normalized.Contains("..", StringComparison.Ordinal)
            || normalized.Contains('\\')
            || normalized.Contains('\0'))
        {
            throw new ValidationException("Invalid DOH LTO evidence object key for this clinic.");
        }

        if (string.Equals(normalized, Normalize(existingKey), StringComparison.Ordinal))
        {
            return normalized;
        }

        var expectedPrefix = $"tenants/{tenantId}/clinics/{clinicId:D}/verification/";
        var ext = Path.GetExtension(normalized);
        if (!normalized.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase)
            || !AllowedEvidenceExtensions.Contains(ext))
        {
            throw new ValidationException("Invalid DOH LTO evidence object key for this clinic.");
        }

        return normalized;
    }

    public static async Task EnqueueLtoResubmissionAndAuditAsync(
        FacilitySettings settings,
        DateTime submittedAtUtc,
        IClinicContext clinicContext,
        IClinicDirectorySyncService? directorySyncService,
        IInteropPublisher? interopPublisher,
        IRepository<StaffMember>? staffRepository,
        IRepository<ServiceItem>? serviceRepository,
        IRepository<DoctorScheduleTemplate>? scheduleRepository,
        IRepository<AuditEntry>? auditRepository,
        CancellationToken ct)
    {
        settings.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        settings.VerificationRejectionReason = null;
        settings.LastVerificationSubmittedAtUtc = submittedAtUtc;

        var submitterDisplayName = await ResolveSubmitterDisplayNameAsync(
            settings.ClinicId,
            clinicContext,
            staffRepository,
            ct);

        if (directorySyncService != null)
        {
            await directorySyncService.EnqueueVerificationRequestAsync(
                settings,
                "LtoUpdate",
                clinicContext.StaffId?.ToString(),
                submitterDisplayName,
                ct);
        }
        else if (interopPublisher != null)
        {
            var staffMembers = staffRepository != null
                ? await staffRepository.Query()
                    .IgnoreQueryFilters()
                    .Where(s => s.ClinicId == settings.ClinicId
                                && !s.IsDeleted
                                && s.IsActive
                                && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
                    .OrderBy(s => s.LastName)
                    .ThenBy(s => s.FirstName)
                    .ToListAsync(ct)
                : [];

            var activeServices = serviceRepository != null
                ? await serviceRepository.Query()
                    .IgnoreQueryFilters()
                    .Where(s => s.ClinicId == settings.ClinicId && !s.IsDeleted && s.IsActive)
                    .OrderBy(s => s.Name)
                    .ToListAsync(ct)
                : [];

            var optedInIds = staffMembers
                .Where(s => s.IsDirectoryOptIn)
                .Select(s => s.Id)
                .ToHashSet();

            var schedules = scheduleRepository != null && optedInIds.Count > 0
                ? await scheduleRepository.Query()
                    .IgnoreQueryFilters()
                    .Where(t => t.ClinicId == settings.ClinicId
                                && !t.IsDeleted
                                && t.IsActive
                                && optedInIds.Contains(t.DoctorId))
                    .OrderBy(t => t.DayOfWeek)
                    .ThenBy(t => t.StartTime)
                    .ToListAsync(ct)
                : [];

            var payload = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
                settings,
                staffMembers,
                activeServices,
                schedules,
                "LtoUpdate",
                clinicContext.StaffId?.ToString(),
                submitterDisplayName,
                submittedAtUtc);

            var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
            interopPublisher.Enqueue(
                InteropTypes.FacilityVerificationRequested,
                from,
                Party.Portal,
                settings.ClinicId,
                payload);
        }

        if (auditRepository != null)
        {
            await auditRepository.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Operations,
                ClinicAuditSeverities.Urgent,
                "operations.facility_verification.submitted",
                "FacilitySettings",
                settings.ClinicId.ToString(),
                ClinicAuditOutcomes.Success,
                "Submitted facility directory verification resubmission (LtoUpdate).",
                clinicContext.StaffId,
                submitterDisplayName,
                clinicContext.StaffRole,
                new
                {
                    settings.ClinicId,
                    RequestKind = "LtoUpdate",
                    settings.LetterheadDohLto,
                    settings.DohLtoExpiryDate,
                    settings.LtoEvidenceObjectKey
                }),
                ct);
        }
    }

    private static async Task<string?> ResolveSubmitterDisplayNameAsync(
        Guid clinicId,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(clinicContext.StaffName))
        {
            return clinicContext.StaffName.Trim();
        }

        if (clinicContext.StaffId is { } staffId && staffRepository != null)
        {
            var submitter = await staffRepository.Query()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.Id == staffId && s.ClinicId == clinicId && !s.IsDeleted, ct);
            if (submitter != null)
            {
                return ClinicDirectorySnapshotBuilder.FormatDisplayName(submitter.Title, submitter.FirstName, submitter.LastName);
            }
        }

        return null;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
