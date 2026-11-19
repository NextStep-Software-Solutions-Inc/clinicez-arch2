using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record RevertPhilHealthToBranchCommand(bool SkipPendingVerificationSync = false) : IRequest<ClinicSettingsDto>;

public sealed class RevertPhilHealthToBranchCommandHandler : IRequestHandler<RevertPhilHealthToBranchCommand, ClinicSettingsDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public RevertPhilHealthToBranchCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _directorySyncService = directorySyncService;
    }

    public async Task<ClinicSettingsDto> Handle(RevertPhilHealthToBranchCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            settings = new FacilitySettings
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

        settings.IsPhilHealthOverridden = false;
        settings.AccreditationNumber = settings.BranchPhilHealthAccreditationNumber;
        settings.PmccNumber = settings.BranchPmccNumber;
        settings.SoftwareCertificateId = settings.BranchSoftwareCertificateId;
        settings.KonsultaEndpoint = !string.IsNullOrWhiteSpace(settings.BranchKonsultaEndpoint) ? settings.BranchKonsultaEndpoint : "/soap/konsulta";
        settings.IsPhilHealthConfigured = settings.IsBranchPhilHealthAccredited && !string.IsNullOrWhiteSpace(settings.BranchPhilHealthAccreditationNumber);
        settings.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        if (!request.SkipPendingVerificationSync
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

        return ClinicSettingsDto.FromEntity(settings);
    }
}
