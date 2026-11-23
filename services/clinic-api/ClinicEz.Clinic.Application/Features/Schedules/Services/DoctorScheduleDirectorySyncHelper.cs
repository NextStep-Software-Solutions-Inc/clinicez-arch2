using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Services;

internal static class DoctorScheduleDirectorySyncHelper
{
    public static async Task SyncAfterScheduleMutationAsync(
        Guid doctorId,
        bool skipPendingVerificationSync,
        StaffMember? clinician,
        IRepository<StaffMember>? staffRepo,
        IRepository<FacilitySettings>? settingsRepo,
        IClinicDirectorySyncService? directorySyncService,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        CancellationToken ct)
    {
        if (directorySyncService == null)
        {
            return;
        }

        if (clinician == null && staffRepo != null)
        {
            clinician = await staffRepo.Query()
                .FirstOrDefaultAsync(
                    s => s.ClinicId == clinicContext.ClinicId && s.Id == doctorId && !s.IsDeleted,
                    ct);
        }

        if (clinician is not { IsActive: true, IsDirectoryOptIn: true }
            || !ClinicianDirectoryValidationHelper.IsClinicianRole(clinician.Role))
        {
            return;
        }

        var isPendingPractitioner =
            clinician.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification;

        if (!skipPendingVerificationSync && isPendingPractitioner)
        {
            await directorySyncService.SyncPendingPractitionerVerificationAsync(
                clinician.Id,
                throwOnConflict: false,
                clinicContext.StaffId?.ToString(),
                clinicContext.StaffName,
                ct);
        }

        if (settingsRepo == null)
        {
            return;
        }

        var settings = await settingsRepo.Query()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicContext.ClinicId && !s.IsDeleted, ct);

        if (settings == null)
        {
            return;
        }

        if (!skipPendingVerificationSync
            && !isPendingPractitioner
            && settings.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
        {
            await directorySyncService.SyncPendingFacilityVerificationAsync(
                settings,
                throwOnConflict: false,
                clinicContext.StaffId?.ToString(),
                clinicContext.StaffName,
                ct);
        }
        else if (settings is { PlatformVerificationStatus: PlatformVerificationStatus.Verified, IsDirectoryPublished: true })
        {
            await directorySyncService.EnqueueDirectoryUpdateAsync(settings, ct);
            await unitOfWork.SaveChangesAsync(ct);
        }
    }
}
