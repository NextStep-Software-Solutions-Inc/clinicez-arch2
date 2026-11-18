using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record GetClinicSettingsQuery : IRequest<ClinicSettingsDto>;

public sealed class GetClinicSettingsQueryHandler : IRequestHandler<GetClinicSettingsQuery, ClinicSettingsDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;

    public GetClinicSettingsQueryHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicSettingsDto> Handle(GetClinicSettingsQuery request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(ct);

        if (settings == null)
        {
            // Auto-provision default settings for this clinic facility
            settings = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = "Clinic Facility",
                OperatingHours = string.Empty,
                DefaultSlotDurationMinutes = 30,
                QueuePrefix = "Q",
                InvoicePrefix = "INV",
                DefaultConsultationFee = 400.00m,
                VatRate = 0.12m,
                LetterheadHeader = null,
                LetterheadSubHeader = null,
                LetterheadAddress = null,
                LetterheadContact = null,
                LetterheadFooter = null,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System"
            };

            await _settingsRepo.AddAsync(settings, ct);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return ClinicSettingsDto.FromEntity(settings);
    }
}
