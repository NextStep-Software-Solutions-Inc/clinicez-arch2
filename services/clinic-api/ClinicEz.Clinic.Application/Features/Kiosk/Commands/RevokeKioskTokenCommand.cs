using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Kiosk.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Kiosk.Commands;

public sealed record RevokeKioskTokenCommand(string? Reason = null)
    : IRequest<RevokeKioskTokenResultDto>;

public sealed class RevokeKioskTokenCommandHandler : IRequestHandler<RevokeKioskTokenCommand, RevokeKioskTokenResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IKioskAccessInvalidator _kioskInvalidator;
    private readonly IUnitOfWork _unitOfWork;

    public RevokeKioskTokenCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IKioskAccessInvalidator kioskInvalidator,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _kioskInvalidator = kioskInvalidator;
        _unitOfWork = unitOfWork;
    }

    public async Task<RevokeKioskTokenResultDto> Handle(RevokeKioskTokenCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic facility settings not initialized.");
        }

        var prevVersion = settings.KioskTokenVersion;
        settings.KioskTokenVersion++;
        await _unitOfWork.SaveChangesAsync(ct);

        _kioskInvalidator.Invalidate(settings.ClinicId);

        return new RevokeKioskTokenResultDto(
            settings.ClinicId,
            prevVersion,
            settings.KioskTokenVersion,
            settings.IsKioskIntakeEnabled,
            $"All existing kiosk tokens revoked. Kiosk token version incremented to {settings.KioskTokenVersion}.");
    }
}
