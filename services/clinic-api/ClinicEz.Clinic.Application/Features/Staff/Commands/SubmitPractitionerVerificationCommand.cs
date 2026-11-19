using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record SubmitPractitionerVerificationCommand(Guid StaffId) : IRequest<StaffMemberDto>;

public sealed class SubmitPractitionerVerificationCommandHandler : IRequestHandler<SubmitPractitionerVerificationCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IClinicDirectorySyncService? _directorySyncService;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepo;
    private readonly IRepository<AuditEntry>? _auditRepo;

    public SubmitPractitionerVerificationCommandHandler(
        IRepository<StaffMember> staffRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher,
        IClinicDirectorySyncService? directorySyncService = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepo = null,
        IRepository<AuditEntry>? auditRepo = null)
    {
        _staffRepo = staffRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
        _directorySyncService = directorySyncService;
        _settingsRepo = settingsRepo;
        _scheduleRepo = scheduleRepo;
        _auditRepo = auditRepo;
    }

    public async Task<StaffMemberDto> Handle(SubmitPractitionerVerificationCommand request, CancellationToken ct)
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
            throw new ValidationException("Inactive staff members cannot be submitted for directory verification.");
        }

        if (staff.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification)
        {
            throw new VerificationConflictException(
                "A practitioner verification submission is already pending for this staff member. Save updates to the pending submission instead.",
                currentStatus: staff.PublicVerificationStatus.ToString());
        }

        ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
            staff.Role,
            isDirectoryOptIn: true,
            staff.PrcLicenseNumber,
            staff.PrcExpiryDate,
            staff.PrcEvidenceObjectKey,
            staff.VerificationContact);

        var requestKind = staff.CanonicalProviderId.HasValue || !string.IsNullOrWhiteSpace(staff.PublicVerificationReason)
            ? "Resubmission"
            : "Initial";

        var submittedAt = DateTime.UtcNow;
        staff.IsDirectoryOptIn = true;
        staff.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
        staff.PublicVerificationReason = null;
        staff.UpdatedAt = submittedAt;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        await PractitionerVerificationSubmissionHelper.EnqueueVerificationAndAuditAsync(
            staff,
            requestKind,
            submittedAt,
            _clinicContext,
            _directorySyncService,
            _interopPublisher,
            _settingsRepo,
            _scheduleRepo,
            _auditRepo,
            ct,
            _staffRepo);

        _staffRepo.Update(staff);
        await _unitOfWork.SaveChangesAsync(ct);

        return StaffMemberDto.FromEntity(staff);
    }
}
