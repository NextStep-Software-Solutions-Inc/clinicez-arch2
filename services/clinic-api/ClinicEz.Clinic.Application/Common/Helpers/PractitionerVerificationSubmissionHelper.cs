using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Shared helper to enqueue <c>practitioner.verification.requested</c> and append a WORM audit entry.
/// </summary>
public static class PractitionerVerificationSubmissionHelper
{
    public static async Task EnqueueVerificationAndAuditAsync(
        StaffMember staff,
        string requestKind,
        DateTime submittedAtUtc,
        IClinicContext clinicContext,
        IClinicDirectorySyncService? directorySyncService,
        IInteropPublisher? interopPublisher,
        IRepository<FacilitySettings>? settingsRepository,
        IRepository<DoctorScheduleTemplate>? scheduleRepository,
        IRepository<AuditEntry>? auditRepository,
        CancellationToken ct)
    {
        if (directorySyncService != null)
        {
            await directorySyncService.EnqueuePractitionerVerificationRequestAsync(
                staff,
                requestKind,
                clinicContext.StaffId?.ToString(),
                submittedAtUtc,
                ct);
        }
        else if (interopPublisher != null)
        {
            var settings = settingsRepository != null
                ? await settingsRepository.Query()
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(s => s.ClinicId == staff.ClinicId && !s.IsDeleted, ct)
                : null;

            List<DoctorScheduleTemplate> schedules = [];
            if (scheduleRepository != null)
            {
                schedules = await scheduleRepository.Query()
                    .IgnoreQueryFilters()
                    .Where(t => t.ClinicId == staff.ClinicId && !t.IsDeleted && t.IsActive && t.DoctorId == staff.Id)
                    .OrderBy(t => t.DayOfWeek)
                    .ThenBy(t => t.StartTime)
                    .ToListAsync(ct);
            }

            var payload = ClinicDirectorySnapshotBuilder.BuildPractitionerVerificationPayload(
                settings,
                staff,
                schedules,
                requestKind,
                clinicContext.StaffId?.ToString(),
                submittedAtUtc);

            var from = Party.ForFacility(staff.TenantId, staff.ClinicId.ToString(), FacilityType.Clinic);
            interopPublisher.Enqueue(
                InteropTypes.PractitionerVerificationRequested,
                from,
                Party.Portal,
                staff.Id,
                payload);
        }

        if (auditRepository != null)
        {
            await auditRepository.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                staff.TenantId,
                staff.ClinicId,
                ClinicAuditCategories.Security,
                ClinicAuditSeverities.Urgent,
                "security.practitioner_verification.submitted",
                "StaffMember",
                staff.Id.ToString(),
                ClinicAuditOutcomes.Success,
                $"Submitted practitioner verification request ({requestKind}) for {staff.FirstName} {staff.LastName}.",
                clinicContext.StaffId,
                clinicContext.StaffName,
                clinicContext.StaffRole,
                new
                {
                    StaffId = staff.Id,
                    RequestKind = requestKind,
                    NormalizedPrc = PractitionerIdentity.NormalizePrc(staff.PrcLicenseNumber),
                    staff.PrcExpiryDate,
                    staff.PrcEvidenceObjectKey
                }),
                ct);
        }
    }
}
