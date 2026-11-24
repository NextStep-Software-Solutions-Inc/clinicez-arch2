using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Licensing;
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
    bool ClearJoinCodeExpiresAt = false,
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
    string? TimeZoneId = null,
    string? DateFormat = null,
    string? TimeFormat = null,
    string? TvDisplayPin = null,
    bool ClearTvDisplayPin = false,
    bool? IsKioskIntakeEnabled = null,
    string? TvDisplaySoundTheme = null,
    bool? TvDisplayVoiceEnabled = null,
    bool? TvDisplayShowPhysicianName = null,
    string? TeleconsultRecordingPolicy = null,
    int? TeleconsultRecordingRetentionDays = null,
    bool? TeleconsultRecordingConsentRequired = null,
    TeleconsultPaymentPolicy? TeleconsultPaymentPolicy = null,
    decimal? TeleconsultDefaultFee = null,
    bool? EnableTeleconsultation = null,
    DateOnly? DohLtoExpiryDate = null,
    bool ClearDohLtoExpiryDate = false,
    bool SkipPendingVerificationSync = false,
    bool? AllowNurseMidwifeYakapFpeFacilitator = null,
    Guid? DefaultHealthScreeningServiceItemId = null,
    string? DefaultHealthScreeningServiceCode = null,
    bool ClearDefaultHealthScreeningServiceItemId = false,
    bool? EnableStaffMorningDigest = null,
    bool? EnableStaffPreSlotReminders = null,
    bool? EnableStaffOverdueAlerts = null,
    int? IdleLockMinutes = null,
    int? MaxLockedSessionHours = null,
    bool? AllowStaffPinUnlock = null,
    string? LtoEvidenceObjectKey = null) : IRequest<ClinicSettingsDto>;

public sealed class UpdateClinicSettingsCommandHandler : IRequestHandler<UpdateClinicSettingsCommand, ClinicSettingsDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<ServiceItem>? _serviceRepo;
    private readonly ClinicEz.Clinic.Domain.Interfaces.IKioskAccessInvalidator? _kioskInvalidator;
    private readonly IFacilityLicenseValidator? _licenseValidator;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IInteropPublisher? _interopPublisher;
    private readonly IRepository<AuditEntry>? _auditRepo;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;

    public UpdateClinicSettingsCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IRepository<ServiceItem>? serviceRepo = null,
        ClinicEz.Clinic.Domain.Interfaces.IKioskAccessInvalidator? kioskInvalidator = null,
        IFacilityLicenseValidator? licenseValidator = null,
        IClinicDirectorySyncService? directorySyncService = null,
        IInteropPublisher? interopPublisher = null,
        IRepository<AuditEntry>? auditRepo = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _serviceRepo = serviceRepo;
        _kioskInvalidator = kioskInvalidator;
        _licenseValidator = licenseValidator;
        _directorySyncService = directorySyncService;
        _interopPublisher = interopPublisher;
        _auditRepo = auditRepo;
        _staffRepo = staffRepo;
        _scheduleRepo = scheduleRepo;
    }

    public async Task<ClinicSettingsDto> Handle(UpdateClinicSettingsCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(ct);

        if (settings == null)
        {
            settings = new FacilitySettings
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

        var prevClinicName = settings.ClinicName;
        var prevOperatingHours = settings.OperatingHours;
        var prevLetterheadAddress = settings.LetterheadAddress;
        var prevLetterheadContact = settings.LetterheadContact;
        var prevLetterheadDohLto = settings.LetterheadDohLto;
        var prevDohLtoExpiryDate = settings.DohLtoExpiryDate;
        var prevLtoEvidenceObjectKey = settings.LtoEvidenceObjectKey;
        var wasVerified = settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified;
        var prevSpecialtyMode = settings.SpecialtyMode;
        var prevAccreditationNumber = settings.AccreditationNumber;
        var prevIsPhilHealthConfigured = settings.IsPhilHealthConfigured;
        var prevEnableTeleconsultation = settings.EnableTeleconsultation;
        var prevIsJoinEnabled = settings.IsJoinEnabled;
        var prevJoinCode = settings.JoinCode;
        var prevJoinCodeExpiresAt = settings.JoinCodeExpiresAt;

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

        if (request.ClearDohLtoExpiryDate)
            settings.DohLtoExpiryDate = null;
        else if (request.DohLtoExpiryDate.HasValue)
            settings.DohLtoExpiryDate = request.DohLtoExpiryDate.Value;

        if (request.LtoEvidenceObjectKey != null)
        {
            settings.LtoEvidenceObjectKey = FacilityDirectoryValidationHelper.ValidateLtoEvidenceObjectKeyForClinic(
                settings.TenantId,
                settings.ClinicId,
                prevLtoEvidenceObjectKey,
                request.LtoEvidenceObjectKey);
        }

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

        if (request.ClearJoinCode || (request.JoinCode != null && string.IsNullOrWhiteSpace(request.JoinCode)))
        {
            settings.JoinCode = null;
            settings.JoinCodeExpiresAt = null;
        }
        else
        {
            if (request.JoinCode != null)
                settings.JoinCode = request.JoinCode.Trim().ToUpperInvariant();

            if (request.ClearJoinCodeExpiresAt)
            {
                settings.JoinCodeExpiresAt = null;
            }
            else if (request.JoinCodeExpiresAt.HasValue)
            {
                settings.JoinCodeExpiresAt = request.JoinCodeExpiresAt.Value;
            }
        }

        if (request.PatientSearchDisplayFieldsJson != null)
            settings.PatientSearchDisplayFieldsJson = string.IsNullOrWhiteSpace(request.PatientSearchDisplayFieldsJson) ? null : request.PatientSearchDisplayFieldsJson.Trim();

        if (!string.IsNullOrWhiteSpace(request.EodReconciliationTime))
            settings.EodReconciliationTime = request.EodReconciliationTime.Trim();

        if (request.AutoEodEnabled.HasValue)
            settings.AutoEodEnabled = request.AutoEodEnabled.Value;

        if (request.TvDisplayMaskPatientNames.HasValue)
            settings.TvDisplayMaskPatientNames = request.TvDisplayMaskPatientNames.Value;

        if (request.ClearTvDisplayPin || (request.TvDisplayPin != null && string.IsNullOrWhiteSpace(request.TvDisplayPin)))
            settings.TvDisplayPin = null;
        else if (!string.IsNullOrWhiteSpace(request.TvDisplayPin))
            settings.TvDisplayPin = request.TvDisplayPin.Trim();

        if (!string.IsNullOrWhiteSpace(request.TvDisplaySoundTheme))
            settings.TvDisplaySoundTheme = request.TvDisplaySoundTheme.Trim();

        if (request.TvDisplayVoiceEnabled.HasValue)
            settings.TvDisplayVoiceEnabled = request.TvDisplayVoiceEnabled.Value;

        if (request.TvDisplayShowPhysicianName.HasValue)
            settings.TvDisplayShowPhysicianName = request.TvDisplayShowPhysicianName.Value;

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

        if (request.EnableStaffMorningDigest.HasValue)
            settings.EnableStaffMorningDigest = request.EnableStaffMorningDigest.Value;

        if (request.EnableStaffPreSlotReminders.HasValue)
            settings.EnableStaffPreSlotReminders = request.EnableStaffPreSlotReminders.Value;

        if (request.EnableStaffOverdueAlerts.HasValue)
            settings.EnableStaffOverdueAlerts = request.EnableStaffOverdueAlerts.Value;

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

        if (request.IsKioskIntakeEnabled.HasValue)
        {
            settings.IsKioskIntakeEnabled = request.IsKioskIntakeEnabled.Value;
            _kioskInvalidator?.Invalidate(settings.ClinicId);
        }

        if (!string.IsNullOrWhiteSpace(request.TeleconsultRecordingPolicy))
        {
            var normalized = request.TeleconsultRecordingPolicy.Trim();
            if (normalized.Equals("Disabled", StringComparison.OrdinalIgnoreCase))
                settings.TeleconsultRecordingPolicy = "Disabled";
            else if (normalized.Equals("WorkspaceVaultOnly", StringComparison.OrdinalIgnoreCase))
                settings.TeleconsultRecordingPolicy = "WorkspaceVaultOnly";
            else if (normalized.Equals("Both", StringComparison.OrdinalIgnoreCase))
                settings.TeleconsultRecordingPolicy = "Both";
            else if (normalized.Equals("LocalDeviceOnly", StringComparison.OrdinalIgnoreCase))
                settings.TeleconsultRecordingPolicy = "LocalDeviceOnly";
        }

        if (request.TeleconsultRecordingRetentionDays.HasValue && request.TeleconsultRecordingRetentionDays.Value >= 0)
            settings.TeleconsultRecordingRetentionDays = request.TeleconsultRecordingRetentionDays.Value;

        if (request.TeleconsultRecordingConsentRequired.HasValue)
            settings.TeleconsultRecordingConsentRequired = request.TeleconsultRecordingConsentRequired.Value;

        if (request.TeleconsultPaymentPolicy.HasValue)
            settings.TeleconsultPaymentPolicy = request.TeleconsultPaymentPolicy.Value.ToString();

        if (request.TeleconsultDefaultFee.HasValue && request.TeleconsultDefaultFee.Value >= 0)
            settings.TeleconsultDefaultFee = request.TeleconsultDefaultFee.Value;

        if (request.EnableTeleconsultation.HasValue)
        {
            if (request.EnableTeleconsultation.Value)
            {
                var isWorkspaceTeleconsultEntitled = false;
                if (!string.IsNullOrWhiteSpace(settings.LicenseToken))
                {
                    var validation = (_licenseValidator ?? new FacilityLicenseValidator()).Validate(settings.LicenseToken, _clinicContext.ClinicId, _clinicContext.TenantId);
                    isWorkspaceTeleconsultEntitled = validation.IsValid &&
                        validation.Payload?.EnabledFeatures != null &&
                        validation.Payload.EnabledFeatures.Contains(FacilityFeatureKeys.Teleconsultation, StringComparer.OrdinalIgnoreCase);
                }

                if (!isWorkspaceTeleconsultEntitled)
                {
                    throw new ForbiddenException("Clinic cannot enable teleconsultation because tenant workspace lacks active teleconsultation entitlement.");
                }

                settings.EnableTeleconsultation = true;
            }
            else
            {
                settings.EnableTeleconsultation = false;
            }
        }

        if (request.AllowNurseMidwifeYakapFpeFacilitator.HasValue)
            settings.AllowNurseMidwifeYakapFpeFacilitator = request.AllowNurseMidwifeYakapFpeFacilitator.Value;

        if (request.ClearDefaultHealthScreeningServiceItemId || request.DefaultHealthScreeningServiceItemId == Guid.Empty)
            settings.DefaultHealthScreeningServiceItemId = null;
        else if (request.DefaultHealthScreeningServiceItemId.HasValue)
            settings.DefaultHealthScreeningServiceItemId = request.DefaultHealthScreeningServiceItemId.Value;

        if (request.DefaultHealthScreeningServiceCode != null)
            settings.DefaultHealthScreeningServiceCode = string.IsNullOrWhiteSpace(request.DefaultHealthScreeningServiceCode)
                ? null
                : request.DefaultHealthScreeningServiceCode.Trim();

        if (request.IdleLockMinutes.HasValue)
        {
            var mins = request.IdleLockMinutes.Value;
            if (mins == 0 || (mins >= 5 && mins <= 120))
                settings.IdleLockMinutes = mins;
        }

        if (request.MaxLockedSessionHours.HasValue)
        {
            var hours = request.MaxLockedSessionHours.Value;
            if (hours >= 1 && hours <= 24)
                settings.MaxLockedSessionHours = hours;
        }

        if (request.AllowStaffPinUnlock.HasValue)
            settings.AllowStaffPinUnlock = request.AllowStaffPinUnlock.Value;

        var updatedAt = DateTime.UtcNow;
        settings.UpdatedAt = updatedAt;
        settings.UpdatedBy = "ClinicAdmin";

        var ltoCredentialsChanged = FacilityDirectoryValidationHelper.HasRegulatedLtoCredentialsChanged(
            prevLetterheadDohLto,
            settings.LetterheadDohLto,
            prevDohLtoExpiryDate,
            settings.DohLtoExpiryDate,
            prevLtoEvidenceObjectKey,
            settings.LtoEvidenceObjectKey);

        var triggeredLtoUpdateResubmission = false;
        if (wasVerified && ltoCredentialsChanged)
        {
            if (string.IsNullOrWhiteSpace(settings.LetterheadDohLto)
                && string.IsNullOrWhiteSpace(settings.LtoEvidenceObjectKey))
            {
                throw new ValidationException("A DOH LTO number or LTO proof document is required when updating a verified facility's LTO credentials.");
            }

            await FacilityDirectoryValidationHelper.EnqueueLtoResubmissionAndAuditAsync(
                settings,
                updatedAt,
                _clinicContext,
                _directorySyncService,
                _interopPublisher,
                _staffRepo,
                _serviceRepo,
                _scheduleRepo,
                _auditRepo,
                ct);
            triggeredLtoUpdateResubmission = true;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var directoryFieldsChanged =
            !string.Equals(prevClinicName, settings.ClinicName, StringComparison.Ordinal) ||
            !string.Equals(prevOperatingHours, settings.OperatingHours, StringComparison.Ordinal) ||
            !string.Equals(prevLetterheadAddress, settings.LetterheadAddress, StringComparison.Ordinal) ||
            !string.Equals(prevLetterheadContact, settings.LetterheadContact, StringComparison.Ordinal) ||
            !string.Equals(prevLetterheadDohLto, settings.LetterheadDohLto, StringComparison.Ordinal) ||
            prevDohLtoExpiryDate != settings.DohLtoExpiryDate ||
            !string.Equals(prevLtoEvidenceObjectKey, settings.LtoEvidenceObjectKey, StringComparison.Ordinal) ||
            !string.Equals(prevSpecialtyMode, settings.SpecialtyMode, StringComparison.Ordinal) ||
            !string.Equals(prevAccreditationNumber, settings.AccreditationNumber, StringComparison.Ordinal) ||
            prevIsPhilHealthConfigured != settings.IsPhilHealthConfigured ||
            prevEnableTeleconsultation != settings.EnableTeleconsultation;

        var joinGatingChanged =
            prevIsJoinEnabled != settings.IsJoinEnabled ||
            !string.Equals(prevJoinCode, settings.JoinCode, StringComparison.Ordinal) ||
            prevJoinCodeExpiresAt != settings.JoinCodeExpiresAt;

        if (!request.SkipPendingVerificationSync
            && !triggeredLtoUpdateResubmission
            && directoryFieldsChanged
            && _directorySyncService != null
            && settings.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
        {
            await _directorySyncService.SyncPendingFacilityVerificationAsync(
                settings,
                throwOnConflict: false,
                _clinicContext.StaffId?.ToString(),
                _clinicContext.StaffName,
                ct);
        }
        else if (!triggeredLtoUpdateResubmission
            && (directoryFieldsChanged || joinGatingChanged)
            && _directorySyncService != null
            && settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified
            && settings.IsDirectoryPublished)
        {
            await _directorySyncService.EnqueueDirectoryUpdateAsync(settings, ct);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        var isWorkspaceEntitled = false;
        if (!string.IsNullOrWhiteSpace(settings.LicenseToken))
        {
            var validation = (_licenseValidator ?? new FacilityLicenseValidator()).Validate(settings.LicenseToken, _clinicContext.ClinicId, _clinicContext.TenantId);
            isWorkspaceEntitled = validation.IsValid &&
                validation.Payload?.EnabledFeatures != null &&
                validation.Payload.EnabledFeatures.Contains(FacilityFeatureKeys.Teleconsultation, StringComparer.OrdinalIgnoreCase);
        }

        return ClinicSettingsDto.FromEntity(settings, isWorkspaceEntitled);
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
                var newItem = new ServiceItem
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
