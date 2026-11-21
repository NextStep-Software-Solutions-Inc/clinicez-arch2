using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record ToggleOnlineBookingPauseCommand(
    bool IsPaused,
    bool SkipPendingVerificationSync = false) : IRequest<ClinicBookingPauseResultDto>;

public sealed record ClinicBookingPauseResultDto(
    bool Success,
    bool IsPaused,
    string Message
);

public sealed class ToggleOnlineBookingPauseCommandHandler : IRequestHandler<ToggleOnlineBookingPauseCommand, ClinicBookingPauseResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<ServiceItem>? _servicesRepo;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;

    public ToggleOnlineBookingPauseCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher,
        IClinicDirectorySyncService? directorySyncService = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<ServiceItem>? servicesRepo = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
        _directorySyncService = directorySyncService;
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _scheduleRepo = scheduleRepo;
    }

    public async Task<ClinicBookingPauseResultDto> Handle(ToggleOnlineBookingPauseCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic settings not found.");
        }

        settings.IsOnlineBookingPaused = request.IsPaused;
        settings.UpdatedAt = DateTime.UtcNow;

        if (settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified)
        {
            if (_directorySyncService != null)
            {
                await _directorySyncService.EnqueueDirectoryUpdateAsync(settings, ct);
            }
            else if (_staffRepo != null && _servicesRepo != null)
            {
                var syncService = new ClinicDirectorySyncService(_staffRepo, _servicesRepo, _interopPublisher, _scheduleRepo);
                await syncService.EnqueueDirectoryUpdateAsync(settings, ct);
            }
            else
            {
                var directoryEvent = ClinicDirectorySnapshotBuilder.BuildFacilityDirectoryEvent(settings, [], [], []);
                var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
                var to = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };
                _interopPublisher.Enqueue(
                    InteropTypes.FacilityDirectoryUpdated,
                    from,
                    to,
                    settings.ClinicId,
                    directoryEvent);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        if (!request.SkipPendingVerificationSync
            && settings.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview
            && _directorySyncService != null)
        {
            await _directorySyncService.SyncPendingFacilityVerificationAsync(
                settings,
                throwOnConflict: false,
                _clinicContext.StaffId?.ToString(),
                _clinicContext.StaffName,
                ct);
        }

        return new ClinicBookingPauseResultDto(
            Success: true,
            IsPaused: settings.IsOnlineBookingPaused,
            Message: settings.IsOnlineBookingPaused
                ? "Online appointment booking paused. Existing appointments remain active."
                : "Online appointment booking resumed."
        );
    }
}
