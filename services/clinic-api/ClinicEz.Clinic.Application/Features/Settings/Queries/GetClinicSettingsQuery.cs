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
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;

    public GetClinicSettingsQueryHandler(
        IRepository<ClinicSettings> settingsRepo,
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
            settings = new ClinicSettings
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
            settings.LetterheadFooter,
            settings.LicenseToken,
            settings.PlanTier,
            settings.MaxStaffLimit,
            settings.LicenseExpiresAt,
            settings.PmccNumber,
            settings.SoftwareCertificateId,
            settings.KonsultaEndpoint,
            settings.IsPhilHealthConfigured,
            settings.PrimaryColorHex,
            settings.PrimaryLogoUrl,
            settings.PaperSize,
            settings.PreferredChartLayout,
            settings.IsJoinEnabled,
            settings.JoinCode,
            settings.JoinCodeExpiresAt,
            settings.PatientSearchDisplayFieldsJson,
            settings.EodReconciliationTime,
            settings.AutoEodEnabled,
            settings.TvDisplayMaskPatientNames,
            settings.EnableQueuePushNotifications,
            settings.QueuePushNotificationThreshold,
            settings.EnableChipLevelQueueCalling,
            settings.StaffNotificationRetentionDays,
            settings.EnableStatAudioAlert,
            settings.EnableStatVibrationAlert,
            settings.IsDirectoryPublished,
            settings.IsOnlineBookingPaused,
            settings.SpecialtyMode,
            settings.EnableDentalModule,
            settings.DefaultDoctorSharePercentage,
            settings.CashierMode,
            LetterheadDohLto: settings.LetterheadDohLto,
            EnableAppointmentReminders: settings.EnableAppointmentReminders,
            AppointmentReminder24hEnabled: settings.AppointmentReminder24hEnabled,
            AppointmentReminder2hEnabled: settings.AppointmentReminder2hEnabled,
            EnableStaffAppointmentNotifications: settings.EnableStaffAppointmentNotifications);
    }
}

