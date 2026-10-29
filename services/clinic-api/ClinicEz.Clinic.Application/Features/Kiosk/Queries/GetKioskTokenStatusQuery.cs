using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Kiosk.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Kiosk.Queries;

public sealed record GetKioskTokenStatusQuery : IRequest<KioskTokenStatusDto>;

public sealed class GetKioskTokenStatusQueryHandler : IRequestHandler<GetKioskTokenStatusQuery, KioskTokenStatusDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;

    public GetKioskTokenStatusQueryHandler(IRepository<FacilitySettings> settingsRepo)
    {
        _settingsRepo = settingsRepo;
    }

    public async Task<KioskTokenStatusDto> Handle(GetKioskTokenStatusQuery request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic facility settings not initialized.");
        }

        return new KioskTokenStatusDto(
            settings.ClinicId,
            settings.IsKioskIntakeEnabled,
            settings.KioskTokenVersion);
    }
}
