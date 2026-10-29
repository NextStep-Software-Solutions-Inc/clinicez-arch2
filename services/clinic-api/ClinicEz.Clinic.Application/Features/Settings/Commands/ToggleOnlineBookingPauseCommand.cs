using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record ToggleOnlineBookingPauseCommand(bool IsPaused) : IRequest<ClinicBookingPauseResultDto>;

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

    public ToggleOnlineBookingPauseCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
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

        // Enqueue directory update carrying new booking pause status
        var directoryEvent = new FacilityCreatedEvent
        {
            TenantId = settings.TenantId,
            TenantSlug = settings.TenantSlug,
            FacilityType = FacilityType.Clinic,
            ResourceId = settings.ClinicId,
            Name = settings.ClinicName,
            Slug = settings.FacilitySlug,
            OperatingHours = settings.OperatingHours,
            IsPublic = settings.IsDirectoryPublished,
            IsBookingPaused = settings.IsOnlineBookingPaused
        };

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
        var to = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        _interopPublisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            from,
            to,
            settings.ClinicId,
            directoryEvent);

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicBookingPauseResultDto(
            Success: true,
            IsPaused: settings.IsOnlineBookingPaused,
            Message: settings.IsOnlineBookingPaused
                ? "Online appointment booking paused. Existing appointments remain active."
                : "Online appointment booking resumed."
        );
    }
}
