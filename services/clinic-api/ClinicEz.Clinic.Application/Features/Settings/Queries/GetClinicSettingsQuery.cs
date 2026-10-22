using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Security.Turnstile;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record GetClinicSettingsQuery : IRequest<ClinicSettingsDto>;

public sealed class GetClinicSettingsQueryHandler : IRequestHandler<GetClinicSettingsQuery, ClinicSettingsDto>
{
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITurnstileSettingResolver? _turnstileResolver;

    public GetClinicSettingsQueryHandler(
        IRepository<ClinicSettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        ITurnstileSettingResolver? turnstileResolver = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _turnstileResolver = turnstileResolver;
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

        var (isOverridden, overrideVal) = _turnstileResolver?.GetEnvironmentOverride() ?? (false, null);
        var effectiveTurnstile = _turnstileResolver?.IsEnabled(settings.TurnstileEnabled) ?? settings.TurnstileEnabled;
        var effectiveSiteKey = _turnstileResolver?.GetSiteKey(settings.TurnstileSiteKey) ?? settings.TurnstileSiteKey;

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
            LetterheadAccentColorHex: settings.LetterheadAccentColorHex,
            DefaultApproverName: settings.DefaultApproverName,
            DefaultApproverTitle: settings.DefaultApproverTitle,
            DocumentSignatoriesJson: settings.DocumentSignatoriesJson,
            EnableAppointmentReminders: settings.EnableAppointmentReminders,
            AppointmentReminder24hEnabled: settings.AppointmentReminder24hEnabled,
            AppointmentReminder2hEnabled: settings.AppointmentReminder2hEnabled,
            EnableStaffAppointmentNotifications: settings.EnableStaffAppointmentNotifications,
            TurnstileEnabled: effectiveTurnstile,
            TurnstileSiteKey: effectiveSiteKey,
            IsTurnstileOverriddenByEnv: isOverridden,
            TurnstileEnvOverrideValue: overrideVal,
            TimeZoneId: settings.TimeZoneId,
            DateFormat: settings.DateFormat,
            TimeFormat: settings.TimeFormat);
    }
}
