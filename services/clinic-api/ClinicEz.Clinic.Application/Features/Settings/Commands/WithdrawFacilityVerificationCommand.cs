using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record WithdrawFacilityVerificationCommand(string? Reason = null) : IRequest<ClinicPublishingResultDto>;

public sealed class WithdrawFacilityVerificationCommandHandler : IRequestHandler<WithdrawFacilityVerificationCommand, ClinicPublishingResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public WithdrawFacilityVerificationCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher,
        IClinicDirectorySyncService? directorySyncService = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
        _directorySyncService = directorySyncService;
        _auditRepo = auditRepo;
    }

    public async Task<ClinicPublishingResultDto> Handle(WithdrawFacilityVerificationCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new NotFoundException("Clinic settings were not found.");
        }

        var wasVerified = settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified;
        var withdrawnAt = DateTime.UtcNow;

        settings.PlatformVerificationStatus = PlatformVerificationStatus.Unverified;
        settings.IsDirectoryPublished = false;
        settings.VerificationRejectionReason = null;
        settings.UpdatedAt = withdrawnAt;

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
        var payload = new FacilityVerificationWithdrawnPayload
        {
            TenantId = settings.TenantId,
            FacilityId = settings.ClinicId,
            WithdrawnByActor = _clinicContext.StaffName ?? _clinicContext.StaffId?.ToString() ?? "ClinicAdmin",
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim(),
            WithdrawnAtUtc = withdrawnAt
        };

        _interopPublisher.Enqueue(
            InteropTypes.FacilityVerificationWithdrawn,
            from,
            Party.Portal,
            settings.ClinicId,
            payload);

        if (wasVerified && _directorySyncService != null)
        {
            await _directorySyncService.EnqueueDirectoryUpdateAsync(settings, ct);
        }

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Operations,
                ClinicAuditSeverities.Urgent,
                "operations.facility_verification.withdrawn",
                "FacilitySettings",
                settings.ClinicId.ToString(),
                ClinicAuditOutcomes.Success,
                "Withdrew clinic facility directory verification submission.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new { settings.ClinicId, WasVerified = wasVerified, request.Reason }),
                ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicPublishingResultDto(
            Success: true,
            IsPublished: false,
            Message: "Facility verification submission withdrawn.",
            PlatformVerificationStatus: settings.PlatformVerificationStatus
        );
    }
}
