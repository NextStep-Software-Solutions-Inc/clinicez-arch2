using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Services;

public sealed class ClinicDirectorySyncService : IClinicDirectorySyncService
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ServiceItem> _servicesRepo;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IInteropPublisher _interopPublisher;

    public ClinicDirectorySyncService(
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IInteropPublisher interopPublisher,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _interopPublisher = interopPublisher;
        _scheduleRepo = scheduleRepo;
        _settingsRepo = settingsRepo;
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
            .Where(s => s.IsDirectoryOptIn && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
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

        var payload = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
            settings,
            staffMembers,
            activeServices,
            schedules,
            requestKind,
            submittedByClinicUserId,
            submittedByDisplayName,
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
            .Where(s => s.IsDirectoryOptIn && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
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
        CancellationToken ct = default)
    {
        var settings = _settingsRepo != null
            ? await _settingsRepo.Query()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == staff.ClinicId && !s.IsDeleted, ct)
            : null;

        var schedules = await LoadScheduleTemplatesAsync(staff.ClinicId, [staff.Id], ct);
        var payload = ClinicDirectorySnapshotBuilder.BuildPractitionerVerificationPayload(
            settings,
            staff,
            schedules,
            requestKind,
            submittedByClinicUserId,
            submittedAtUtc ?? DateTime.UtcNow);

        var from = Party.ForFacility(staff.TenantId, staff.ClinicId.ToString(), FacilityType.Clinic);
        _interopPublisher.Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            from,
            Party.Portal,
            staff.Id,
            payload);
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
