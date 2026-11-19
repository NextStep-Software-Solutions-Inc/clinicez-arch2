using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record UpdatePendingFacilityVerificationCommand : IRequest<ClinicPublishingResultDto>;

public sealed class UpdatePendingFacilityVerificationCommandHandler
    : IRequestHandler<UpdatePendingFacilityVerificationCommand, ClinicPublishingResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicDirectorySyncService _directorySyncService;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public UpdatePendingFacilityVerificationCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicDirectorySyncService directorySyncService,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _settingsRepo = settingsRepo;
        _directorySyncService = directorySyncService;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _auditRepo = auditRepo;
    }

    public async Task<ClinicPublishingResultDto> Handle(UpdatePendingFacilityVerificationCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new NotFoundException("Clinic settings must be initialized before updating a pending verification submission.");
        }

        if (settings.PlatformVerificationStatus != PlatformVerificationStatus.PendingReview)
        {
            throw new VerificationConflictException(
                $"Facility directory verification is currently '{settings.PlatformVerificationStatus}' and can no longer be updated in place.",
                currentStatus: settings.PlatformVerificationStatus.ToString());
        }

        await _directorySyncService.SyncPendingFacilityVerificationAsync(
            settings,
            throwOnConflict: true,
            _clinicContext.StaffId?.ToString(),
            _clinicContext.StaffName,
            ct);

        var updatedAt = DateTime.UtcNow;
        settings.UpdatedAt = updatedAt;

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Operations,
                ClinicAuditSeverities.Urgent,
                "operations.facility_verification.updated",
                "FacilitySettings",
                settings.ClinicId.ToString(),
                ClinicAuditOutcomes.Success,
                "Updated active pending facility directory verification submission.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new
                {
                    settings.ClinicId,
                    settings.LetterheadDohLto,
                    settings.DohLtoExpiryDate,
                    settings.LtoEvidenceObjectKey,
                    UpdatedAtUtc = updatedAt
                }),
                ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicPublishingResultDto(
            Success: true,
            IsPublished: settings.IsDirectoryPublished,
            Message: "Pending facility verification submission updated.",
            PlatformVerificationStatus: settings.PlatformVerificationStatus);
    }
}
