using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Commands;

public sealed record DeleteDoctorScheduleTemplateCommand(
    Guid DoctorId,
    Guid TemplateId,
    bool SkipPendingVerificationSync = false) : IRequest<bool>;

public sealed class DeleteDoctorScheduleTemplateCommandHandler
    : IRequestHandler<DeleteDoctorScheduleTemplateCommand, bool>
{
    private readonly IRepository<DoctorScheduleTemplate> _templateRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public DeleteDoctorScheduleTemplateCommandHandler(
        IRepository<DoctorScheduleTemplate> templateRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _templateRepo = templateRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
        _directorySyncService = directorySyncService;
    }

    public async Task<bool> Handle(DeleteDoctorScheduleTemplateCommand request, CancellationToken ct)
    {
        var template = await _templateRepo.Query()
            .Include(t => t.BreakTimes)
            .FirstOrDefaultAsync(t => t.ClinicId == _clinicContext.ClinicId &&
                                      t.DoctorId == request.DoctorId &&
                                      t.Id == request.TemplateId &&
                                      !t.IsDeleted, ct);

        if (template == null)
        {
            throw new KeyNotFoundException($"Schedule template with ID {request.TemplateId} was not found for doctor {request.DoctorId}.");
        }

        var now = DateTime.UtcNow;
        template.IsDeleted = true;
        template.DeletedAt = now;
        template.DeletedBy = "ClinicStaff";

        foreach (var brk in template.BreakTimes)
        {
            brk.IsDeleted = true;
            brk.DeletedAt = now;
            brk.DeletedBy = "ClinicStaff";
        }

        await _unitOfWork.SaveChangesAsync(ct);

        if (!request.SkipPendingVerificationSync && _staffRepo != null && _directorySyncService != null)
        {
            var clinician = await _staffRepo.Query()
                .FirstOrDefaultAsync(s => s.ClinicId == _clinicContext.ClinicId && s.Id == request.DoctorId && !s.IsDeleted, ct);

            if (clinician is { IsActive: true, IsDirectoryOptIn: true }
                && ClinicianDirectoryValidationHelper.IsClinicianRole(clinician.Role))
            {
                if (clinician.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification)
                {
                    await _directorySyncService.SyncPendingPractitionerVerificationAsync(
                        clinician.Id,
                        throwOnConflict: false,
                        _clinicContext.StaffId?.ToString(),
                        _clinicContext.StaffName,
                        ct);
                }
                else if (_settingsRepo != null)
                {
                    var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
                    if (settings?.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
                    {
                        await _directorySyncService.SyncPendingFacilityVerificationAsync(
                            settings,
                            throwOnConflict: false,
                            _clinicContext.StaffId?.ToString(),
                            _clinicContext.StaffName,
                            ct);
                    }
                }
            }
        }

        return true;
    }
}
