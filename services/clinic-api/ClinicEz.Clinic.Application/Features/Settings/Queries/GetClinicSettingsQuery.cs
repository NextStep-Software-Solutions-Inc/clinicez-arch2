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
            BranchKonsultaEndpoint: settings.BranchKonsultaEndpoint,
            TenantSlug: settings.TenantSlug,
            FacilitySlug: settings.FacilitySlug,
            TvDisplayPin: settings.TvDisplayPin,
            IsKioskIntakeEnabled: settings.IsKioskIntakeEnabled,
            KioskTokenVersion: settings.KioskTokenVersion,
            TvDisplaySoundTheme: settings.TvDisplaySoundTheme ?? "classicChime",
            TvDisplayVoiceEnabled: settings.TvDisplayVoiceEnabled,
            TvDisplayShowPhysicianName: settings.TvDisplayShowPhysicianName,
            TeleconsultRecordingPolicy: settings.TeleconsultRecordingPolicy ?? "Disabled",
            TeleconsultRecordingRetentionDays: settings.TeleconsultRecordingRetentionDays,
            TeleconsultRecordingConsentRequired: settings.TeleconsultRecordingConsentRequired,
            TeleconsultPaymentPolicy: Enum.TryParse<TeleconsultPaymentPolicy>(settings.TeleconsultPaymentPolicy, true, out var pol) ? pol : TeleconsultPaymentPolicy.Prepaid,
            TeleconsultDefaultFee: settings.TeleconsultDefaultFee,
            EnableTeleconsultation: settings.EnableTeleconsultation,
            IsWorkspaceTeleconsultEntitled: isWorkspaceTeleconsultEntitled);
    }
}
