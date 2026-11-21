using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Licensing;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record GetClinicSettingsQuery : IRequest<ClinicSettingsDto>;

public sealed class GetClinicSettingsQueryHandler : IRequestHandler<GetClinicSettingsQuery, ClinicSettingsDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFacilityLicenseValidator? _licenseValidator;

    public GetClinicSettingsQueryHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IFacilityLicenseValidator? licenseValidator = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _licenseValidator = licenseValidator;
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
                TeleconsultRecordingPolicy = "Disabled",
                TeleconsultRecordingRetentionDays = 90,
                TeleconsultRecordingConsentRequired = true,
                TeleconsultPaymentPolicy = "Prepaid",
                TeleconsultDefaultFee = 400.00m,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System"
            };

            await _settingsRepo.AddAsync(settings, ct);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        var isWorkspaceTeleconsultEntitled = false;
        if (!string.IsNullOrWhiteSpace(settings.LicenseToken))
        {
            var validation = (_licenseValidator ?? new FacilityLicenseValidator()).Validate(settings.LicenseToken, settings.ClinicId, settings.TenantId);
            isWorkspaceTeleconsultEntitled = validation.IsValid &&
                validation.Payload?.EnabledFeatures != null &&
                validation.Payload.EnabledFeatures.Contains(FacilityFeatureKeys.Teleconsultation, StringComparer.OrdinalIgnoreCase);
        }

        return ClinicSettingsDto.FromEntity(settings, isWorkspaceTeleconsultEntitled);
    }
}
