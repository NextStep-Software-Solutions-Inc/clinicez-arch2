using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record WithdrawPractitionerVerificationCommand(
    Guid StaffId,
    string? Reason = null
) : IRequest<StaffMemberDto>;

public sealed class WithdrawPractitionerVerificationCommandHandler : IRequestHandler<WithdrawPractitionerVerificationCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public WithdrawPractitionerVerificationCommandHandler(
        IRepository<StaffMember> staffRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IRepository<FacilitySettings>? settingsRepo = null,
        IClinicDirectorySyncService? directorySyncService = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _staffRepo = staffRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _settingsRepo = settingsRepo;
        _directorySyncService = directorySyncService;
        _auditRepo = auditRepo;
    }

    public async Task<StaffMemberDto> Handle(WithdrawPractitionerVerificationCommand request, CancellationToken ct)
    {
        var staff = await _staffRepo.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(ct);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        var wasOptedIn = staff.IsDirectoryOptIn;
        staff.IsDirectoryOptIn = false;
        staff.PublicVerificationStatus = PractitionerVerificationLevel.Unverified;
        staff.PublicVerificationReason = null;
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
        _staffRepo.Update(staff);

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                staff.TenantId,
                staff.ClinicId,
                ClinicAuditCategories.Security,
                ClinicAuditSeverities.Urgent,
                "security.practitioner_verification.withdrawn",
                "StaffMember",
                staff.Id.ToString(),
                ClinicAuditOutcomes.Success,
                $"Withdrew directory verification for {staff.FirstName} {staff.LastName}.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new { StaffId = staff.Id, request.Reason }),
                ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        if (wasOptedIn && _settingsRepo != null && _directorySyncService != null)
        {
            var settings = await _settingsRepo.Query()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.ClinicId == staff.ClinicId && !s.IsDeleted, ct);

            if (settings is { PlatformVerificationStatus: PlatformVerificationStatus.Verified, IsDirectoryPublished: true })
            {
                await _directorySyncService.EnqueueDirectoryUpdateAsync(settings, ct);
                await _unitOfWork.SaveChangesAsync(ct);
            }
        }

        return StaffMemberDto.FromEntity(staff);
    }
}
