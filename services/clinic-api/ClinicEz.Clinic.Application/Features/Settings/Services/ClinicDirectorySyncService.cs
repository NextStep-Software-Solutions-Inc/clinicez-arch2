using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Settings.Services;

public sealed class ClinicDirectorySyncService : IClinicDirectorySyncService
{
    private static readonly TimeSpan SyncRequestTimeout = TimeSpan.FromSeconds(15);

    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ServiceItem> _servicesRepo;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IInteropRequestClient? _interopRequestClient;
    private readonly IUnitOfWork? _unitOfWork;
    private readonly IClinicContext? _clinicContext;
    private readonly ILogger<ClinicDirectorySyncService>? _logger;

    public ClinicDirectorySyncService(
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IInteropPublisher interopPublisher,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IInteropRequestClient? interopRequestClient = null,
        IUnitOfWork? unitOfWork = null,
        IClinicContext? clinicContext = null,
        ILogger<ClinicDirectorySyncService>? logger = null)
    {
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _interopPublisher = interopPublisher;
        _scheduleRepo = scheduleRepo;
        _settingsRepo = settingsRepo;
        _interopRequestClient = interopRequestClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _logger = logger;
    }

    public async Task EnqueueVerificationRequestAsync(
        FacilitySettings settings,
        string requestKind,
        string? submittedByClinicUserId = null,
        string? submittedByDisplayName = null,
        CancellationToken ct = default)
    {
        var staffMembers = await LoadCliniciansAsync(settings.ClinicId, ct);
        var activeServices = await LoadActiveServicesAsync(settings.ClinicId, ct);
        var optedInIds = staffMembers
            .Where(s => s.IsActive && !s.IsDeleted && s.IsDirectoryOptIn && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .Select(s => s.Id)
            .ToHashSet();

        var schedules = await LoadScheduleTemplatesAsync(settings.ClinicId, optedInIds, ct);

        foreach (var clinician in staffMembers.Where(s => optedInIds.Contains(s.Id)
                     && PractitionerIdentity.IsValidPrcFormat(s.PrcLicenseNumber)))
        {
            if (clinician.PublicVerificationStatus is PractitionerVerificationLevel.Unverified or PractitionerVerificationLevel.Rejected)
            {
                clinician.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
                clinician.PublicVerificationReason = null;
            }
        }

        var effectiveUserId = submittedByClinicUserId ?? _clinicContext?.StaffId?.ToString();
        var effectiveDisplayName = await ResolveSubmitterDisplayNameAsync(
            effectiveUserId,
            submittedByDisplayName,
            settings.ClinicId,
            staffMembers,
            ct);

        var payload = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
            settings,
            staffMembers,
            activeServices,
            schedules,
            requestKind,
            effectiveUserId,
            effectiveDisplayName,
            settings.LastVerificationSubmittedAtUtc ?? DateTime.UtcNow);

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
        _interopPublisher.Enqueue(
            InteropTypes.FacilityVerificationRequested,
            from,
            Party.Portal,
            settings.ClinicId,
            payload);
    }

    public async Task EnqueueDirectoryUpdateAsync(
        FacilitySettings settings,
        CancellationToken ct = default)
    {
        var staffMembers = await LoadCliniciansAsync(settings.ClinicId, ct);
        var activeServices = await LoadActiveServicesAsync(settings.ClinicId, ct);
        var optedInIds = staffMembers
            .Where(s => s.IsActive && !s.IsDeleted && s.IsDirectoryOptIn && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .Select(s => s.Id)
            .ToHashSet();

        var schedules = await LoadScheduleTemplatesAsync(settings.ClinicId, optedInIds, ct);

        var directoryEvent = ClinicDirectorySnapshotBuilder.BuildFacilityDirectoryEvent(
            settings,
            staffMembers,
            activeServices,
            schedules);

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
        var to = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        _interopPublisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            from,
            to,
            settings.ClinicId,
            directoryEvent);
    }

    public async Task EnqueuePractitionerVerificationRequestAsync(
        StaffMember staff,
        string requestKind,
        string? submittedByClinicUserId = null,
        DateTime? submittedAtUtc = null,
        string? submittedByDisplayName = null,
        CancellationToken ct = default)
    {
        var settings = _settingsRepo != null
            ? await _settingsRepo.Query()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == staff.ClinicId && !s.IsDeleted, ct)
            : null;

        var effectiveUserId = submittedByClinicUserId ?? _clinicContext?.StaffId?.ToString();
        var effectiveDisplayName = await ResolveSubmitterDisplayNameAsync(
            effectiveUserId,
            submittedByDisplayName,
            staff.ClinicId,
            [staff],
            ct);

        var schedules = await LoadScheduleTemplatesAsync(staff.ClinicId, [staff.Id], ct);
        var payload = ClinicDirectorySnapshotBuilder.BuildPractitionerVerificationPayload(
            settings,
            staff,
            schedules,
            requestKind,
            effectiveUserId,
            submittedAtUtc ?? DateTime.UtcNow,
            effectiveDisplayName);

        var from = Party.ForFacility(staff.TenantId, staff.ClinicId.ToString(), FacilityType.Clinic);
        _interopPublisher.Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            from,
            Party.Portal,
            staff.Id,
            payload);
    }

    public async Task SyncPendingFacilityVerificationAsync(
        FacilitySettings settings,
        bool throwOnConflict,
        string? updatedByClinicUserId = null,
        string? updatedByDisplayName = null,
        CancellationToken ct = default)
    {
        if (settings.PlatformVerificationStatus != PlatformVerificationStatus.PendingReview)
        {
            if (throwOnConflict)
            {
                throw new VerificationConflictException(
                    $"Facility directory verification is currently '{settings.PlatformVerificationStatus}' and can no longer be updated in place.",
                    currentStatus: settings.PlatformVerificationStatus.ToString());
            }

            return;
        }

        var staffMembers = await LoadStaffForPendingSyncAsync(settings.ClinicId, ct);
        var activeServices = await LoadActiveServicesAsync(settings.ClinicId, ct);
        var optedInIds = staffMembers
            .Where(s => s.IsActive && !s.IsDeleted && s.IsDirectoryOptIn && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .Select(s => s.Id)
            .ToHashSet();

        var schedules = await LoadScheduleTemplatesAsync(settings.ClinicId, optedInIds, ct);

        var effectiveUserId = updatedByClinicUserId ?? _clinicContext?.StaffId?.ToString();
        var effectiveDisplayName = await ResolveSubmitterDisplayNameAsync(
            effectiveUserId,
            updatedByDisplayName,
            settings.ClinicId,
            staffMembers,
            ct);

        var payload = ClinicDirectorySnapshotBuilder.BuildFacilityUpdatePayload(
            settings,
            staffMembers,
            activeServices,
            schedules,
            effectiveUserId,
            effectiveDisplayName,
            DateTime.UtcNow);

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);

        if (_interopRequestClient == null)
        {
            if (throwOnConflict)
            {
                throw new ServiceUnavailableException("Portal verification sync service is currently unavailable.");
            }

            _interopPublisher.Enqueue(
                InteropTypes.FacilityVerificationUpdateRequested,
                from,
                Party.Portal,
                settings.ClinicId,
                payload);
            ReconcileBundledClinicianStatuses(staffMembers, payload.Practitioners);
            await SaveChangesIfAvailableAsync(ct);
            return;
        }

        VerificationUpdateRespondedPayload reply;
        try
        {
            reply = await _interopRequestClient.RequestAsync<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
                InteropTypes.FacilityVerificationUpdateRequested,
                InteropTypes.FacilityVerificationUpdateResponded,
                from,
                Party.Portal,
                payload,
                timeout: SyncRequestTimeout,
                ct: ct);
        }
        catch (InteropRequestTimeoutException ex)
        {
            if (throwOnConflict)
            {
                throw new ServiceUnavailableException("Timed out waiting for Portal to confirm the pending facility verification update.", ex);
            }

            _logger?.LogWarning(ex, "Pending facility verification sync timed out for clinic {ClinicId}; falling back to transactional outbox.", settings.ClinicId);
            _interopPublisher.Enqueue(
                InteropTypes.FacilityVerificationUpdateRequested,
                from,
                Party.Portal,
                settings.ClinicId,
                payload);
            ReconcileBundledClinicianStatuses(staffMembers, payload.Practitioners);
            await SaveChangesIfAvailableAsync(ct);
            return;
        }

        if (reply.Conflict || string.Equals(reply.ErrorCode, VerificationConflictException.ErrorCode, StringComparison.OrdinalIgnoreCase))
        {
            var message = string.IsNullOrWhiteSpace(reply.Message)
                ? "The facility verification submission is no longer pending review."
                : reply.Message;
            if (throwOnConflict)
            {
                throw new VerificationConflictException(message, reply.CurrentStatus, reply.RequestId);
            }

            _logger?.LogWarning("Skipped in-place pending facility verification sync for clinic {ClinicId}: conflict ({CurrentStatus}).", settings.ClinicId, reply.CurrentStatus);
            return;
        }

        if (!reply.Succeeded)
        {
            var message = string.IsNullOrWhiteSpace(reply.Message)
                ? "Failed to update the pending facility verification submission."
                : reply.Message;
            if (throwOnConflict)
            {
                throw new InvalidOperationException(message);
            }

            _logger?.LogWarning("Pending facility verification sync returned failure for clinic {ClinicId}: {Message}", settings.ClinicId, message);
            return;
        }

        if (ReconcileBundledClinicianStatuses(staffMembers, payload.Practitioners))
        {
            await SaveChangesIfAvailableAsync(ct);
        }
    }

    private static bool ReconcileBundledClinicianStatuses(
        IReadOnlyList<StaffMember> staffMembers,
        IReadOnlyList<BundledPractitionerSubmissionDto> bundledPractitioners)
    {
        var bundledIds = bundledPractitioners
            .Select(p => p.ClinicStaffMemberId)
            .ToHashSet();

        var changed = false;
        foreach (var clinician in staffMembers)
        {
            if (bundledIds.Contains(clinician.Id))
            {
                if (clinician.PublicVerificationStatus is PractitionerVerificationLevel.Unverified or PractitionerVerificationLevel.Rejected)
                {
                    clinician.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
                    clinician.PublicVerificationReason = null;
                    changed = true;
                }
            }
            else if (clinician.PublicVerificationStatus is PractitionerVerificationLevel.PendingVerification or PractitionerVerificationLevel.AwaitingConfirmation)
            {
                clinician.PublicVerificationStatus = PractitionerVerificationLevel.Unverified;
                clinician.PublicVerificationReason = null;
                changed = true;
            }
        }

        return changed;
    }

    public async Task SyncPendingPractitionerVerificationAsync(
        Guid staffId,
        bool throwOnConflict,
        string? updatedByClinicUserId = null,
        string? updatedByDisplayName = null,
        CancellationToken ct = default)
    {
        var staff = await _staffRepo.Query()
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == staffId
                && !s.IsDeleted
                && (_clinicContext == null || _clinicContext.ClinicId == Guid.Empty || s.ClinicId == _clinicContext.ClinicId), ct);

        if (staff == null)
        {
            if (throwOnConflict)
            {
                throw new NotFoundException($"Staff member '{staffId}' was not found in this clinic.");
            }

            return;
        }

        if (!staff.IsActive || !staff.IsDirectoryOptIn || staff.PublicVerificationStatus != PractitionerVerificationLevel.PendingVerification)
        {
            if (throwOnConflict)
            {
                throw new VerificationConflictException(
                    $"Practitioner verification is currently '{staff.PublicVerificationStatus}' and can no longer be updated in place.",
                    currentStatus: staff.PublicVerificationStatus.ToString());
            }

            return;
        }

        if (!ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role) || !PractitionerIdentity.IsValidPrcFormat(staff.PrcLicenseNumber))
        {
            if (throwOnConflict)
            {
                ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
                    staff.Role,
                    staff.IsDirectoryOptIn,
                    staff.PrcLicenseNumber,
                    staff.PrcExpiryDate,
                    staff.PrcEvidenceObjectKey,
                    staff.VerificationContact);
            }

            return;
        }

        if (throwOnConflict)
        {
            ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
                staff.Role,
                staff.IsDirectoryOptIn,
                staff.PrcLicenseNumber,
                staff.PrcExpiryDate,
                staff.PrcEvidenceObjectKey,
                staff.VerificationContact);
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == staff.ClinicId && !s.IsDeleted, ct)
            : null;

        var schedules = await LoadScheduleTemplatesAsync(staff.ClinicId, [staff.Id], ct);
        var effectiveUserId = updatedByClinicUserId ?? _clinicContext?.StaffId?.ToString();
        var effectiveDisplayName = await ResolveSubmitterDisplayNameAsync(
            effectiveUserId,
            updatedByDisplayName,
            staff.ClinicId,
            [staff],
            ct);

        var payload = ClinicDirectorySnapshotBuilder.BuildPractitionerUpdatePayload(
            settings,
            staff,
            schedules,
            effectiveUserId,
            effectiveDisplayName,
            DateTime.UtcNow);

        var from = Party.ForFacility(staff.TenantId, staff.ClinicId.ToString(), FacilityType.Clinic);

        if (_interopRequestClient == null)
        {
            if (throwOnConflict)
            {
                throw new ServiceUnavailableException("Portal verification sync service is currently unavailable.");
            }

            _interopPublisher.Enqueue(
                InteropTypes.PractitionerVerificationUpdateRequested,
                from,
                Party.Portal,
                staff.Id,
                payload);
            await SaveChangesIfAvailableAsync(ct);
            return;
        }

        VerificationUpdateRespondedPayload reply;
        try
        {
            reply = await _interopRequestClient.RequestAsync<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
                InteropTypes.PractitionerVerificationUpdateRequested,
                InteropTypes.PractitionerVerificationUpdateResponded,
                from,
                Party.Portal,
                payload,
                timeout: SyncRequestTimeout,
                ct: ct);
        }
        catch (InteropRequestTimeoutException ex)
        {
            if (throwOnConflict)
            {
                throw new ServiceUnavailableException("Timed out waiting for Portal to confirm the pending practitioner verification update.", ex);
            }

            _logger?.LogWarning(ex, "Pending practitioner verification sync timed out for staff {StaffId}; falling back to transactional outbox.", staff.Id);
            _interopPublisher.Enqueue(
                InteropTypes.PractitionerVerificationUpdateRequested,
                from,
                Party.Portal,
                staff.Id,
                payload);
            await SaveChangesIfAvailableAsync(ct);
            return;
        }

        if (reply.Conflict || string.Equals(reply.ErrorCode, VerificationConflictException.ErrorCode, StringComparison.OrdinalIgnoreCase))
        {
            var message = string.IsNullOrWhiteSpace(reply.Message)
                ? "The practitioner verification submission is no longer pending."
                : reply.Message;
            if (throwOnConflict)
            {
                throw new VerificationConflictException(message, reply.CurrentStatus, reply.RequestId);
            }

            _logger?.LogWarning("Skipped in-place pending practitioner verification sync for staff {StaffId}: conflict ({CurrentStatus}).", staff.Id, reply.CurrentStatus);
            return;
        }

        if (!reply.Succeeded)
        {
            var message = string.IsNullOrWhiteSpace(reply.Message)
                ? "Failed to update the pending practitioner verification submission."
                : reply.Message;
            if (throwOnConflict)
            {
                throw new InvalidOperationException(message);
            }

            _logger?.LogWarning("Pending practitioner verification sync returned failure for staff {StaffId}: {Message}", staff.Id, message);
        }
    }

    private async Task SaveChangesIfAvailableAsync(CancellationToken ct)
    {
        if (_unitOfWork != null)
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
    }

    private async Task<string?> ResolveSubmitterDisplayNameAsync(
        string? submittedByClinicUserId,
        string? submittedByDisplayName,
        Guid clinicId,
        IReadOnlyList<StaffMember>? prefetchedStaff,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(submittedByDisplayName))
            return submittedByDisplayName.Trim();

        if (!string.IsNullOrWhiteSpace(_clinicContext?.StaffName))
            return _clinicContext.StaffName.Trim();

        if (Guid.TryParse(submittedByClinicUserId, out var staffId))
        {
            var match = prefetchedStaff?.FirstOrDefault(s => s.Id == staffId);
            if (match == null)
            {
                match = await _staffRepo.Query()
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => s.Id == staffId && s.ClinicId == clinicId && !s.IsDeleted, ct);
            }

            if (match != null)
                return ClinicDirectorySnapshotBuilder.FormatDisplayName(match.Title, match.FirstName, match.LastName);
        }

        return null;
    }

    private async Task<List<StaffMember>> LoadCliniciansAsync(Guid clinicId, CancellationToken ct) =>
        await _staffRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == clinicId
                        && !s.IsDeleted
                        && s.IsActive
                        && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToListAsync(ct);

    private async Task<List<StaffMember>> LoadStaffForPendingSyncAsync(Guid clinicId, CancellationToken ct) =>
        await _staffRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == clinicId
                        && ((!s.IsDeleted && s.IsActive && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
                            || s.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification
                            || s.PublicVerificationStatus == PractitionerVerificationLevel.AwaitingConfirmation))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToListAsync(ct);

    private async Task<List<ServiceItem>> LoadActiveServicesAsync(Guid clinicId, CancellationToken ct) =>
        await _servicesRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == clinicId && !s.IsDeleted && s.IsActive)
            .OrderBy(s => s.Name)
            .ToListAsync(ct);

    private async Task<List<DoctorScheduleTemplate>> LoadScheduleTemplatesAsync(
        Guid clinicId,
        HashSet<Guid> staffIds,
        CancellationToken ct)
    {
        if (_scheduleRepo == null || staffIds.Count == 0)
            return [];

        return await _scheduleRepo.Query()
            .IgnoreQueryFilters()
            .Where(t => t.ClinicId == clinicId
                        && !t.IsDeleted
                        && t.IsActive
                        && staffIds.Contains(t.DoctorId))
            .OrderBy(t => t.DayOfWeek)
            .ThenBy(t => t.StartTime)
            .ToListAsync(ct);
    }
}
