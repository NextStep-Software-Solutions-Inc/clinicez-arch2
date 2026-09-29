using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record UpdateClinicSettingsCommand(
    string ClinicName,
    string? TaxIdentificationNumber,
    string? AccreditationNumber,
    string OperatingHours,
    int DefaultSlotDurationMinutes,
    string QueuePrefix,
    string InvoicePrefix,
    decimal DefaultConsultationFee,
    decimal VatRate,
    string? LetterheadHeader,
    string? LetterheadSubHeader,
    string? LetterheadAddress,
    string? LetterheadContact,
    string? LetterheadFooter) : IRequest<ClinicSettingsDto>;

public sealed class UpdateClinicSettingsCommandHandler : IRequestHandler<UpdateClinicSettingsCommand, ClinicSettingsDto>
{
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateClinicSettingsCommandHandler(
        IRepository<ClinicSettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicSettingsDto> Handle(UpdateClinicSettingsCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(ct);

        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = request.ClinicName.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "ClinicAdmin"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }

        settings.ClinicName = request.ClinicName.Trim();
        settings.TaxIdentificationNumber = request.TaxIdentificationNumber?.Trim();
        settings.AccreditationNumber = request.AccreditationNumber?.Trim();
        settings.OperatingHours = string.IsNullOrWhiteSpace(request.OperatingHours) ? "Mon-Sat 8:00 AM - 5:00 PM" : request.OperatingHours.Trim();
        settings.DefaultSlotDurationMinutes = request.DefaultSlotDurationMinutes > 0 ? request.DefaultSlotDurationMinutes : 30;
        settings.QueuePrefix = string.IsNullOrWhiteSpace(request.QueuePrefix) ? "Q" : request.QueuePrefix.Trim();
        settings.InvoicePrefix = string.IsNullOrWhiteSpace(request.InvoicePrefix) ? "INV" : request.InvoicePrefix.Trim();
        settings.DefaultConsultationFee = request.DefaultConsultationFee >= 0 ? request.DefaultConsultationFee : 400.00m;
        settings.VatRate = request.VatRate >= 0 ? request.VatRate : 0.12m;
        settings.LetterheadHeader = request.LetterheadHeader?.Trim();
        settings.LetterheadSubHeader = request.LetterheadSubHeader?.Trim();
        settings.LetterheadAddress = request.LetterheadAddress?.Trim();
        settings.LetterheadContact = request.LetterheadContact?.Trim();
        settings.LetterheadFooter = request.LetterheadFooter?.Trim();
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = "ClinicAdmin";

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicSettingsDto(
            settings.Id,
            settings.TenantId,
            settings.ClinicId,
            settings.ClinicName,
            settings.TaxIdentificationNumber,
            settings.AccreditationNumber,
            settings.OperatingHours,
            settings.DefaultSlotDurationMinutes,
            settings.QueuePrefix,
            settings.InvoicePrefix,
            settings.DefaultConsultationFee,
            settings.VatRate,
            settings.LetterheadHeader,
            settings.LetterheadSubHeader,
            settings.LetterheadAddress,
            settings.LetterheadContact,
            settings.LetterheadFooter);
    }
}
