using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Kiosk.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Kiosk.Commands;

public sealed record MintKioskTokenCommand(string? DeviceLabel = null, int? ExpiryDays = null)
    : IRequest<MintKioskTokenResultDto>;

public sealed class MintKioskTokenCommandHandler : IRequestHandler<MintKioskTokenCommand, MintKioskTokenResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IKioskTokenService _tokenService;
    private readonly IKioskAccessInvalidator _kioskInvalidator;
    private readonly IUnitOfWork _unitOfWork;

    public MintKioskTokenCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IKioskTokenService tokenService,
        IKioskAccessInvalidator kioskInvalidator,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _tokenService = tokenService;
        _kioskInvalidator = kioskInvalidator;
        _unitOfWork = unitOfWork;
    }

    public async Task<MintKioskTokenResultDto> Handle(MintKioskTokenCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic facility settings not initialized.");
        }

        if (!settings.IsKioskIntakeEnabled)
        {
            settings.IsKioskIntakeEnabled = true;
            await _unitOfWork.SaveChangesAsync(ct);
            _kioskInvalidator.Invalidate(settings.ClinicId);
        }

        var label = string.IsNullOrWhiteSpace(request.DeviceLabel)
            ? $"{settings.ClinicName} Intake Kiosk"
            : request.DeviceLabel.Trim();

        var (token, expires) = _tokenService.MintToken(
            settings.TenantId,
            settings.ClinicId,
            settings.KioskTokenVersion,
            label,
            request.ExpiryDays);

        return new MintKioskTokenResultDto(
            token,
            expires,
            settings.KioskTokenVersion,
            settings.ClinicId,
            label);
    }
}
