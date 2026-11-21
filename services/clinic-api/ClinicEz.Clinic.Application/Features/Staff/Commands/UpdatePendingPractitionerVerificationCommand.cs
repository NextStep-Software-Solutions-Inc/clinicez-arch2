using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record UpdatePendingPractitionerVerificationCommand(Guid StaffId) : IRequest<StaffMemberDto>;

public sealed class UpdatePendingPractitionerVerificationCommandHandler
    : IRequestHandler<UpdatePendingPractitionerVerificationCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IClinicDirectorySyncService _directorySyncService;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public UpdatePendingPractitionerVerificationCommandHandler(
        IRepository<StaffMember> staffRepo,
        IClinicDirectorySyncService directorySyncService,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _staffRepo = staffRepo;
        _directorySyncService = directorySyncService;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _auditRepo = auditRepo;
    }

    public async Task<StaffMemberDto> Handle(UpdatePendingPractitionerVerificationCommand request, CancellationToken ct)
    {
        var staff = await _staffRepo.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(ct);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        if (!staff.IsActive)
        {
            throw new ValidationException("Inactive staff members cannot update a directory verification submission.");
        }

        if (!staff.IsDirectoryOptIn || staff.PublicVerificationStatus != PractitionerVerificationLevel.PendingVerification)
        {
            throw new VerificationConflictException(
                $"Practitioner verification is currently '{staff.PublicVerificationStatus}' and can no longer be updated in place.",
                currentStatus: staff.PublicVerificationStatus.ToString());
        }

        ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
            staff.Role,
            staff.IsDirectoryOptIn,
            staff.PrcLicenseNumber,
            staff.PrcExpiryDate,
            staff.PrcEvidenceObjectKey,
            staff.VerificationContact);

        await _directorySyncService.SyncPendingPractitionerVerificationAsync(
            staff.Id,
            throwOnConflict: true,
            _clinicContext.StaffId?.ToString(),
            _clinicContext.StaffName,
            ct);

        var updatedAt = DateTime.UtcNow;
        staff.UpdatedAt = updatedAt;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        if (_auditRepo != null)
        {
            await _auditRepo.AddAsync(DirectoryVerificationAuditHelper.CreateEntry(
                staff.TenantId,
                staff.ClinicId,
                ClinicAuditCategories.Security,
                ClinicAuditSeverities.Urgent,
                "security.practitioner_verification.updated",
                "StaffMember",
                staff.Id.ToString(),
                ClinicAuditOutcomes.Success,
                $"Updated active pending practitioner verification submission for {staff.FirstName} {staff.LastName}.",
                _clinicContext.StaffId,
                _clinicContext.StaffName,
                _clinicContext.StaffRole,
                new
                {
                    StaffId = staff.Id,
                    NormalizedPrc = PractitionerIdentity.NormalizePrc(staff.PrcLicenseNumber),
                    staff.PrcExpiryDate,
                    staff.PrcEvidenceObjectKey,
                    UpdatedAtUtc = updatedAt
                }),
                ct);
        }

        _staffRepo.Update(staff);
        await _unitOfWork.SaveChangesAsync(ct);

        return StaffMemberDto.FromEntity(staff);
    }
}
