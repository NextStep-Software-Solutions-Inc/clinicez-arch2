using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record PublishClinicToDirectoryCommand(bool IsPublished) : IRequest<ClinicPublishingResultDto>;

public sealed record ClinicPublishingResultDto(
    bool Success,
    bool IsPublished,
    string Message,
    PlatformVerificationStatus PlatformVerificationStatus = PlatformVerificationStatus.Unverified
);

public sealed class PublishClinicToDirectoryCommandHandler : IRequestHandler<PublishClinicToDirectoryCommand, ClinicPublishingResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ServiceItem> _servicesRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public PublishClinicToDirectoryCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher,
        IClinicDirectorySyncService? directorySyncService = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
        _directorySyncService = directorySyncService;
        _scheduleRepo = scheduleRepo;
        _auditRepo = auditRepo;
    }

    public async Task<ClinicPublishingResultDto> Handle(PublishClinicToDirectoryCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic settings must be initialized before publishing.");
        }

        var syncService = _directorySyncService
            ?? new ClinicDirectorySyncService(_staffRepo, _servicesRepo, _interopPublisher, _scheduleRepo);

        if (request.IsPublished)
        {
            var hasActiveDoctor = await _staffRepo.Query()
                .AnyAsync(s => s.IsActive && s.Role == StaffRole.Doctor && !string.IsNullOrWhiteSpace(s.PrcLicenseNumber), ct);

            var hasActiveService = await _servicesRepo.Query()
                .AnyAsync(s => s.IsActive, ct);

            var missingChecks = new List<string>();
            if (!settings.IsWorkspaceEligible)
                missingChecks.Add("Facility has not been granted workspace eligibility for patient app directory publishing in Portal");

            if (string.IsNullOrWhiteSpace(settings.OperatingHours))
                missingChecks.Add("Operating hours must be configured");

            if (string.IsNullOrWhiteSpace(settings.LetterheadDohLto) && string.IsNullOrWhiteSpace(settings.LtoEvidenceObjectKey))
                missingChecks.Add("A DOH LTO number or LTO proof document is required");

            if (!hasActiveDoctor)
                missingChecks.Add("At least one active licensed doctor with PRC license number is required");

            if (!hasActiveService)
                missingChecks.Add("At least one active clinic service must be published in the fee schedule");

            if (missingChecks.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Cannot publish clinic to directory: readiness checks failed. {string.Join("; ", missingChecks)}.");
            }

            if (settings.PlatformVerificationStatus != PlatformVerificationStatus.Verified)
            {
                var requestKind = settings.PlatformVerificationStatus is PlatformVerificationStatus.Rejected or PlatformVerificationStatus.Suspended
                    || settings.LastVerificationSubmittedAtUtc.HasValue
                    ? "Resubmission"
                    : "Initial";

                var submittedAt = DateTime.UtcNow;
                settings.IsDirectoryPublished = true;
                settings.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
                settings.VerificationRejectionReason = null;
                settings.LastVerificationSubmittedAtUtc = submittedAt;
                settings.UpdatedAt = submittedAt;

                await syncService.EnqueueVerificationRequestAsync(
                    settings,
                    requestKind,
                    _clinicContext.StaffId?.ToString(),
                    _clinicContext.StaffName,
                    ct);

                if (_auditRepo != null)
                {
                    await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                        settings.TenantId,
                        settings.ClinicId,
                        ClinicAuditCategories.Operations,
                        ClinicAuditSeverities.Urgent,
                        "operations.facility_verification.submitted",
                        "FacilitySettings",
                        settings.ClinicId.ToString(),
                        ClinicAuditOutcomes.Success,
                        $"Submitted facility directory verification request ({requestKind}).",
                        _clinicContext.StaffId,
                        _clinicContext.StaffName,
                        _clinicContext.StaffRole,
                        new { settings.ClinicId, RequestKind = requestKind, settings.LetterheadDohLto, settings.LtoEvidenceObjectKey }),
                        ct);
                }

                await _unitOfWork.SaveChangesAsync(ct);

                return new ClinicPublishingResultDto(
                    Success: true,
                    IsPublished: settings.IsDirectoryPublished,
                    Message: "Clinic verification request submitted for platform review.",
                    PlatformVerificationStatus: settings.PlatformVerificationStatus
                );
            }

            settings.IsDirectoryPublished = true;
            settings.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            settings.IsDirectoryPublished = false;
            settings.UpdatedAt = DateTime.UtcNow;
        }

        await syncService.EnqueueDirectoryUpdateAsync(settings, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicPublishingResultDto(
            Success: true,
            IsPublished: settings.IsDirectoryPublished,
            Message: settings.IsDirectoryPublished
                ? "Clinic successfully published to the consumer patient directory."
                : "Clinic unpublished from the consumer patient directory.",
            PlatformVerificationStatus: settings.PlatformVerificationStatus
        );
    }
}
