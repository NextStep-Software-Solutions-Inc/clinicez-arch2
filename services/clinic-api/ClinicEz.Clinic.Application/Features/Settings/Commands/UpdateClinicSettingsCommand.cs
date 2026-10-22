using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Security.Turnstile;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record UpdateClinicSettingsCommand(
    string? ClinicName = null,
    string? TaxIdentificationNumber = null,
    string? AccreditationNumber = null,
    string? OperatingHours = null,
    int? DefaultSlotDurationMinutes = null,
    string? QueuePrefix = null,
    string? InvoicePrefix = null,
    decimal? DefaultConsultationFee = null,
    decimal? VatRate = null,
    string? LetterheadHeader = null,
    string? LetterheadSubHeader = null,
    string? LetterheadAddress = null,
    string? LetterheadContact = null,
    string? LetterheadDohLto = null,
    string? LetterheadFooter = null,
    string? LetterheadAccentColorHex = null,
    string? DocumentAccentColorHex = null,
    string? PrimaryColorHex = null,
    string? PrimaryLogoUrl = null,
    string? PaperSize = null,
    string? PreferredChartLayout = null,
    bool? IsJoinEnabled = null,
    string? JoinCode = null,
    DateTime? JoinCodeExpiresAt = null,
    bool ClearJoinCode = false,
    string? PatientSearchDisplayFieldsJson = null,
    string? EodReconciliationTime = null,
    bool? AutoEodEnabled = null,
    bool? TvDisplayMaskPatientNames = null,
    bool? EnableQueuePushNotifications = null,
    int? QueuePushNotificationThreshold = null,
    bool? EnableChipLevelQueueCalling = null,
    int? StaffNotificationRetentionDays = null,
    bool? EnableStatAudioAlert = null,
    bool? EnableStatVibrationAlert = null,
    string? SpecialtyMode = null,
    bool? EnableDentalModule = null,
    decimal? DefaultDoctorSharePercentage = null,
    string? CashierMode = null,
    string? DefaultApproverName = null,
    string? DefaultApproverTitle = null,
    string? DocumentSignatoriesJson = null,
    bool? EnableAppointmentReminders = null,
    bool? AppointmentReminder24hEnabled = null,
    bool? AppointmentReminder2hEnabled = null,
    bool? EnableStaffAppointmentNotifications = null,
    bool? TurnstileEnabled = null,
    string? TurnstileSiteKey = null,
    string? TimeZoneId = null,
    string? DateFormat = null,
    string? TimeFormat = null) : IRequest<ClinicSettingsDto>;

public sealed class UpdateClinicSettingsCommandHandler : IRequestHandler<UpdateClinicSettingsCommand, ClinicSettingsDto>
{
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<ClinicServiceItem>? _serviceRepo;
    private readonly ITurnstileSettingResolver? _turnstileResolver;

    public UpdateClinicSettingsCommandHandler(
        IRepository<ClinicSettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IRepository<ClinicServiceItem>? serviceRepo = null,
        ITurnstileSettingResolver? turnstileResolver = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _serviceRepo = serviceRepo;
        _turnstileResolver = turnstileResolver;
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
                ClinicName = string.IsNullOrWhiteSpace(request.ClinicName) ? "Default Clinic" : request.ClinicName.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "ClinicAdmin"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }

        if (!string.IsNullOrWhiteSpace(request.ClinicName))
            settings.ClinicName = request.ClinicName.Trim();

        if (request.TaxIdentificationNumber != null)
            settings.TaxIdentificationNumber = string.IsNullOrWhiteSpace(request.TaxIdentificationNumber) ? null : request.TaxIdentificationNumber.Trim();

        if (request.AccreditationNumber != null)
            settings.AccreditationNumber = string.IsNullOrWhiteSpace(request.AccreditationNumber) ? null : request.AccreditationNumber.Trim();

        if (request.OperatingHours != null)
            settings.OperatingHours = request.OperatingHours.Trim();

        if (request.DefaultSlotDurationMinutes.HasValue && request.DefaultSlotDurationMinutes.Value > 0)
            settings.DefaultSlotDurationMinutes = request.DefaultSlotDurationMinutes.Value;

        if (!string.IsNullOrWhiteSpace(request.QueuePrefix))
            settings.QueuePrefix = request.QueuePrefix.Trim();

        if (!string.IsNullOrWhiteSpace(request.InvoicePrefix))
            settings.InvoicePrefix = request.InvoicePrefix.Trim();

        if (request.DefaultConsultationFee.HasValue && request.DefaultConsultationFee.Value >= 0)
            settings.DefaultConsultationFee = request.DefaultConsultationFee.Value;

        if (request.VatRate.HasValue && request.VatRate.Value >= 0)
            settings.VatRate = request.VatRate.Value;

        if (request.LetterheadHeader != null)
            settings.LetterheadHeader = string.IsNullOrWhiteSpace(request.LetterheadHeader) ? null : request.LetterheadHeader.Trim();

        if (request.LetterheadSubHeader != null)
            settings.LetterheadSubHeader = string.IsNullOrWhiteSpace(request.LetterheadSubHeader) ? null : request.LetterheadSubHeader.Trim();

        if (request.LetterheadAddress != null)
            settings.LetterheadAddress = string.IsNullOrWhiteSpace(request.LetterheadAddress) ? null : request.LetterheadAddress.Trim();

        if (request.LetterheadContact != null)
            settings.LetterheadContact = string.IsNullOrWhiteSpace(request.LetterheadContact) ? null : request.LetterheadContact.Trim();

        if (request.LetterheadDohLto != null)
            settings.LetterheadDohLto = string.IsNullOrWhiteSpace(request.LetterheadDohLto) ? null : request.LetterheadDohLto.Trim();

        if (request.LetterheadFooter != null)
            settings.LetterheadFooter = string.IsNullOrWhiteSpace(request.LetterheadFooter) ? null : request.LetterheadFooter.Trim();

        var docAccent = request.LetterheadAccentColorHex ?? request.DocumentAccentColorHex;
        if (docAccent != null)
            settings.LetterheadAccentColorHex = string.IsNullOrWhiteSpace(docAccent) ? null : docAccent.Trim();

        if (request.PrimaryColorHex != null)
            settings.PrimaryColorHex = request.PrimaryColorHex.Trim();

        if (request.PrimaryLogoUrl != null)
            settings.PrimaryLogoUrl = request.PrimaryLogoUrl.Trim();

        if (!string.IsNullOrWhiteSpace(request.PaperSize))
            settings.PaperSize = request.PaperSize.Trim();

        if (!string.IsNullOrWhiteSpace(request.PreferredChartLayout))
            settings.PreferredChartLayout = request.PreferredChartLayout.Trim();

        if (request.IsJoinEnabled.HasValue)
            settings.IsJoinEnabled = request.IsJoinEnabled.Value;

        if (request.ClearJoinCode)
        {
            settings.JoinCode = null;
            settings.JoinCodeExpiresAt = null;
        }
        else
        {
            if (request.JoinCode != null)
                settings.JoinCode = string.IsNullOrWhiteSpace(request.JoinCode) ? null : request.JoinCode.Trim().ToUpperInvariant();

            if (request.JoinCodeExpiresAt.HasValue)
                settings.JoinCodeExpiresAt = request.JoinCodeExpiresAt.Value;
        }

        if (request.PatientSearchDisplayFieldsJson != null)
            settings.PatientSearchDisplayFieldsJson = string.IsNullOrWhiteSpace(request.PatientSearchDisplayFieldsJson) ? null : request.PatientSearchDisplayFieldsJson.Trim();

        if (!string.IsNullOrWhiteSpace(request.EodReconciliationTime))
            settings.EodReconciliationTime = request.EodReconciliationTime.Trim();

        if (request.AutoEodEnabled.HasValue)
            settings.AutoEodEnabled = request.AutoEodEnabled.Value;

        if (request.TvDisplayMaskPatientNames.HasValue)
            settings.TvDisplayMaskPatientNames = request.TvDisplayMaskPatientNames.Value;

        if (request.EnableQueuePushNotifications.HasValue)
            settings.EnableQueuePushNotifications = request.EnableQueuePushNotifications.Value;

        if (request.QueuePushNotificationThreshold.HasValue)
            settings.QueuePushNotificationThreshold = Math.Clamp(request.QueuePushNotificationThreshold.Value, 1, 5);

        if (request.EnableChipLevelQueueCalling.HasValue)
            settings.EnableChipLevelQueueCalling = request.EnableChipLevelQueueCalling.Value;

        if (request.StaffNotificationRetentionDays.HasValue)
            settings.StaffNotificationRetentionDays = Math.Max(0, request.StaffNotificationRetentionDays.Value);

        if (request.EnableStatAudioAlert.HasValue)
            settings.EnableStatAudioAlert = request.EnableStatAudioAlert.Value;

        if (request.EnableStatVibrationAlert.HasValue)
            settings.EnableStatVibrationAlert = request.EnableStatVibrationAlert.Value;

        if (!string.IsNullOrWhiteSpace(request.SpecialtyMode))
        {
            var mode = request.SpecialtyMode.Trim();
            settings.SpecialtyMode = mode;
            if (string.Equals(mode, "Dental", StringComparison.OrdinalIgnoreCase))
            {
                settings.EnableDentalModule = true;
            }

            if (_serviceRepo != null &&
                (string.Equals(mode, "Dental", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(mode, "MultiSpecialty", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(mode, "Multi-Specialty", StringComparison.OrdinalIgnoreCase)))
            {
                await EnsureDentalPresetsSeededAsync(ct);
            }
        }

        if (request.EnableDentalModule.HasValue)
            settings.EnableDentalModule = request.EnableDentalModule.Value;

        if (request.DefaultDoctorSharePercentage.HasValue && request.DefaultDoctorSharePercentage.Value >= 0)
            settings.DefaultDoctorSharePercentage = request.DefaultDoctorSharePercentage.Value;

        if (!string.IsNullOrWhiteSpace(request.CashierMode))
        {
            var normalizedMode = request.CashierMode.Trim();
            settings.CashierMode = string.Equals(normalizedMode, "CashierCounter", StringComparison.OrdinalIgnoreCase)
                ? "CashierCounter"
                : "ClinicDesk";
        }

        if (request.DefaultApproverName != null)
            settings.DefaultApproverName = string.IsNullOrWhiteSpace(request.DefaultApproverName) ? null : request.DefaultApproverName.Trim();

        if (request.DefaultApproverTitle != null)
            settings.DefaultApproverTitle = string.IsNullOrWhiteSpace(request.DefaultApproverTitle) ? null : request.DefaultApproverTitle.Trim();

        if (request.DocumentSignatoriesJson != null)
            settings.DocumentSignatoriesJson = string.IsNullOrWhiteSpace(request.DocumentSignatoriesJson) ? null : request.DocumentSignatoriesJson.Trim();

        if (request.EnableAppointmentReminders.HasValue)
            settings.EnableAppointmentReminders = request.EnableAppointmentReminders.Value;

        if (request.AppointmentReminder24hEnabled.HasValue)
            settings.AppointmentReminder24hEnabled = request.AppointmentReminder24hEnabled.Value;

        if (request.AppointmentReminder2hEnabled.HasValue)
            settings.AppointmentReminder2hEnabled = request.AppointmentReminder2hEnabled.Value;

        if (request.EnableStaffAppointmentNotifications.HasValue)
            settings.EnableStaffAppointmentNotifications = request.EnableStaffAppointmentNotifications.Value;

        if (request.TurnstileEnabled.HasValue)
            settings.TurnstileEnabled = request.TurnstileEnabled.Value;

        if (request.TurnstileSiteKey != null)
            settings.TurnstileSiteKey = string.IsNullOrWhiteSpace(request.TurnstileSiteKey) ? null : request.TurnstileSiteKey.Trim();

        if (request.TimeZoneId != null)
        {
            var trimmed = request.TimeZoneId.Trim();
            settings.TimeZoneId = string.IsNullOrEmpty(trimmed) || trimmed.Equals("inherit", StringComparison.OrdinalIgnoreCase)
                ? null
                : trimmed;
        }

        if (request.DateFormat != null)
        {
            var trimmed = request.DateFormat.Trim();
            settings.DateFormat = string.IsNullOrEmpty(trimmed) || trimmed.Equals("inherit", StringComparison.OrdinalIgnoreCase)
                ? null
                : trimmed;
        }

        if (request.TimeFormat != null)
        {
            var trimmed = request.TimeFormat.Trim();
            settings.TimeFormat = string.IsNullOrEmpty(trimmed) || trimmed.Equals("inherit", StringComparison.OrdinalIgnoreCase)
                ? null
                : trimmed;
        }


        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = "ClinicAdmin";

        await _unitOfWork.SaveChangesAsync(ct);

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

    private async Task EnsureDentalPresetsSeededAsync(CancellationToken ct)
    {
        if (_serviceRepo == null) return;

        var allServices = await _serviceRepo.Query()
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == _clinicContext.ClinicId)
            .ToListAsync(ct);

        var existingMap = allServices
            .Where(s => !string.IsNullOrWhiteSpace(s.Code))
            .GroupBy(s => s.Code.Trim().ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var def in DentalCatalogDefaults.Defaults)
        {
            var codeUpper = def.Code.Trim().ToUpperInvariant();
            if (existingMap.TryGetValue(codeUpper, out var existing))
            {
                if (existing.IsDeleted)
                {
                    existing.IsDeleted = false;
                    existing.DeletedAt = null;
                    existing.DeletedBy = null;
                    existing.IsActive = true;
                }
            }
            else
            {
                var newItem = new ClinicServiceItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Code = def.Code,
                    Name = def.Name,
                    Category = def.Category,
                    StandardPrice = def.StandardPrice,
                    Description = def.Description,
                    IsActive = true
                };

                await _serviceRepo.AddAsync(newItem, ct);
                existingMap[codeUpper] = newItem;
            }
        }
    }
}
