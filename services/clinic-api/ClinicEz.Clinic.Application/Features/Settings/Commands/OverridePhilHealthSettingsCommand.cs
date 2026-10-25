using System;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Security.Turnstile;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record OverridePhilHealthSettingsCommand(
    [Required] string AccreditationNumber,
    [Required] string PmccNumber,
    [Required] string SoftwareCertificateId,
    string? Username,
    string? Password,
    string? CipherKey,
    string? KonsultaEndpoint = null) : IRequest<ClinicSettingsDto>;

public sealed class OverridePhilHealthSettingsCommandHandler : IRequestHandler<OverridePhilHealthSettingsCommand, ClinicSettingsDto>
{
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly ITurnstileSettingResolver? _turnstileResolver;

    public OverridePhilHealthSettingsCommandHandler(
        IRepository<ClinicSettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IPhilHealthProxyClient proxyClient,
        ITurnstileSettingResolver? turnstileResolver = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _proxyClient = proxyClient;
        _turnstileResolver = turnstileResolver;
    }

    public async Task<ClinicSettingsDto> Handle(OverridePhilHealthSettingsCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.AccreditationNumber))
            throw new ArgumentException("PhilHealth Accreditation Number is required.", nameof(request.AccreditationNumber));

        if (string.IsNullOrWhiteSpace(request.PmccNumber))
            throw new ArgumentException("PhilHealth PMCC Number is required.", nameof(request.PmccNumber));

        if (string.IsNullOrWhiteSpace(request.SoftwareCertificateId))
            throw new ArgumentException("PhilHealth Software Certificate ID is required.", nameof(request.SoftwareCertificateId));

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = "Clinic Facility",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }

        var endpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
            ? request.KonsultaEndpoint.Trim()
            : (!string.IsNullOrWhiteSpace(settings.KonsultaEndpoint) ? settings.KonsultaEndpoint : "/soap/konsulta");

        var proxyRequest = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: Guid.TryParse(_clinicContext.TenantId, out var tid) ? tid : _clinicContext.ClinicId,
            FacilityName: settings.ClinicName,
            AccreditationNumber: request.AccreditationNumber.Trim(),
            PmccNumber: request.PmccNumber.Trim(),
            SoftwareCertificateId: request.SoftwareCertificateId.Trim(),
            Username: request.Username ?? "",
            Password: request.Password ?? "",
            CipherKey: !string.IsNullOrWhiteSpace(request.CipherKey) ? request.CipherKey : "dev-cipher-key-for-local-development-only-0000",
            KonsultaEndpoint: endpoint);

        var proxyResult = await _proxyClient.ConfigureTenantCredentialsAsync(proxyRequest, ct);
        if (!proxyResult.Succeeded)
        {
            throw new InvalidOperationException(proxyResult.Message ?? "Failed to configure PhilHealth credentials via proxy.");
        }

        settings.IsPhilHealthOverridden = true;
        settings.AccreditationNumber = request.AccreditationNumber.Trim();
        settings.PmccNumber = request.PmccNumber.Trim();
        settings.SoftwareCertificateId = request.SoftwareCertificateId.Trim();
        settings.KonsultaEndpoint = endpoint;
        settings.IsPhilHealthConfigured = true;
        settings.UpdatedAt = DateTime.UtcNow;

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
            IsWorkspaceEligible: settings.IsWorkspaceEligible,
            IsDirectoryPublished: settings.IsDirectoryPublished,
            IsOnlineBookingPaused: settings.IsOnlineBookingPaused,
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
            TimeFormat: settings.TimeFormat,
            IsPhilHealthOverridden: settings.IsPhilHealthOverridden,
            BranchId: settings.BranchId,
            BranchName: settings.BranchName,
            IsBranchPhilHealthAccredited: settings.IsBranchPhilHealthAccredited,
            BranchPhilHealthAccreditationNumber: settings.BranchPhilHealthAccreditationNumber,
            BranchPmccNumber: settings.BranchPmccNumber,
            BranchSoftwareCertificateId: settings.BranchSoftwareCertificateId,
            BranchKonsultaEndpoint: settings.BranchKonsultaEndpoint);
    }
}
