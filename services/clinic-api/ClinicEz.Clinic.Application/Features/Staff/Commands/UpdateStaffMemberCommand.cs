using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record UpdateStaffMemberCommand(
    Guid Id,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    StaffRole Role,
    Guid? ClinicRoleId,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    bool IsActive,
    string? PhilHealthPan = null,
    IReadOnlyList<Guid>? AssignedRoomIds = null,
    bool ClearAssignedRoom = false,
    string? SignatureSpecimen = null,
    SignatureMode? DefaultSignatureMode = null,
    bool? IsDirectoryOptIn = null,
    DateOnly? PrcExpiryDate = null,
    string? PrcEvidenceObjectKey = null,
    string? VerificationContact = null,
    string? PublicBio = null,
    string? AvatarUrl = null,
    bool SkipPendingVerificationSync = false) : IRequest<StaffMemberDto>;

public sealed class UpdateStaffMemberCommandValidator : AbstractValidator<UpdateStaffMemberCommand>
{
    public UpdateStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).IsInEnum();

        When(x => x.Role == StaffRole.Doctor, () =>
        {
            RuleFor(x => x.PrcLicenseNumber)
                .NotEmpty()
                .WithMessage("PRC License Number is mandatory for Doctors.");
        });

        When(x => !string.IsNullOrEmpty(x.PhilHealthPan), () =>
        {
            RuleFor(x => x.PhilHealthPan).MaximumLength(50);
        });

        When(x => !string.IsNullOrWhiteSpace(x.Email), () =>
        {
            RuleFor(x => x.Email)
                .EmailAddress()
                .WithMessage("A valid email address is required.")
                .MaximumLength(255);
        });
    }
}

public sealed class UpdateStaffMemberCommandHandler : IRequestHandler<UpdateStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    private readonly IStaffAccessInvalidator? _accessCache;
    private readonly IRepository<Room>? _roomRepository;
    private readonly IInteropPublisher? _interopPublisher;
    private readonly IRepository<FacilitySettings>? _settingsRepository;
    private readonly IRepository<DoctorScheduleTemplate>? _scheduleRepository;
    private readonly IRepository<AuditEntry>? _auditRepository;
    private readonly IClinicDirectorySyncService? _directorySyncService;

    public UpdateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<Role> roleRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IStaffAccessInvalidator? accessCache = null,
        IRepository<Room>? roomRepository = null,
        IInteropPublisher? interopPublisher = null,
        IRepository<FacilitySettings>? settingsRepository = null,
        IRepository<DoctorScheduleTemplate>? scheduleRepository = null,
        IRepository<AuditEntry>? auditRepository = null,
        IClinicDirectorySyncService? directorySyncService = null)
    {
        _staffRepository = staffRepository;
        _roleRepository = roleRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _accessCache = accessCache;
        _roomRepository = roomRepository;
        _interopPublisher = interopPublisher;
        _settingsRepository = settingsRepository;
        _scheduleRepository = scheduleRepository;
        _auditRepository = auditRepository;
        _directorySyncService = directorySyncService;
    }

    public async Task<StaffMemberDto> Handle(UpdateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        // Prevent clinic staff from changing or downgrading their own clinic role or deactivating themselves
        bool isSelf = _clinicContext.StaffId.HasValue && _clinicContext.StaffId.Value == staff.Id;
        if (isSelf)
        {
            bool roleChanged = request.Role != staff.Role;
            bool clinicRoleChanged = request.ClinicRoleId.HasValue && request.ClinicRoleId.Value != staff.ClinicRoleId;
            if (roleChanged || clinicRoleChanged)
            {
                throw new ValidationException("You cannot change or downgrade your own clinic role.");
            }

            if (!request.IsActive && staff.IsActive)
            {
                throw new ValidationException("You cannot deactivate your own account.");
            }
        }

        var normalizedEmail = StaffEmailUniquenessHelper.NormalizeEmail(request.Email);
        if (normalizedEmail != null)
        {
            var duplicateEmail = await _staffRepository.Query(s =>
                s.ClinicId == _clinicContext.ClinicId &&
                s.Id != staff.Id &&
                s.Email != null &&
                s.Email.ToLower() == normalizedEmail)
                .AnyAsync(cancellationToken);

            if (duplicateEmail)
            {
                throw new ValidationException(StaffEmailUniquenessHelper.DuplicateStaffEmailMessage);
            }
        }

        // Guard: Cannot downgrade or deactivate the only active Administrator
        if (staff.Role == StaffRole.Admin && staff.IsActive && (request.Role != StaffRole.Admin || !request.IsActive))
        {
            var otherActiveAdmins = await _staffRepository.Query(s =>
                s.ClinicId == _clinicContext.ClinicId &&
                s.Role == StaffRole.Admin &&
                s.IsActive &&
                s.Id != staff.Id)
                .AnyAsync(cancellationToken);

            if (!otherActiveAdmins)
            {
                throw new ValidationException("Cannot downgrade or deactivate the only active Administrator in this clinic.");
            }
        }

        // Guard 1: Cannot downgrade, reassign, or deactivate the only active built-in System Administrator
        bool isCurrentSystemAdmin = GovernanceSafetyChecker.IsSystemAdministrator(staff);
        if (isCurrentSystemAdmin && staff.IsActive)
        {
            bool willLoseSystemAdmin = !request.IsActive ||
                request.Role != StaffRole.Admin ||
                (request.ClinicRoleId.HasValue && (staff.ClinicRoleId == null || request.ClinicRoleId.Value != staff.ClinicRoleId));

            await GovernanceSafetyChecker.EnsureActiveSystemAdminRemainsAsync(
                _staffRepository,
                _clinicContext.ClinicId,
                staff.Id,
                willLoseSystemAdmin,
                cancellationToken);
        }

        // Guard 2: Cannot reassign or deactivate the last active user holding critical governance permissions (roles:manage, staff:manage, settings:manage)
        await GovernanceSafetyChecker.EnsureGovernancePermissionsRemainOnStaffChangeAsync(
            _staffRepository,
            _roleRepository,
            _clinicContext.ClinicId,
            staff,
            request.IsActive,
            request.Role,
            request.ClinicRoleId,
            cancellationToken);

        string? roleName = staff.ClinicRole?.Name;

        if (request.ClinicRoleId.HasValue && request.ClinicRoleId != staff.ClinicRoleId)
        {
            var role = await _roleRepository.Query(r => r.Id == request.ClinicRoleId.Value && r.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (role == null)
            {
                throw new NotFoundException($"Role '{request.ClinicRoleId.Value}' does not exist in this clinic.");
            }
            staff.ClinicRoleId = role.Id;
            roleName = role.Name;
        }

        var assignedRoomNames = new List<string>();
        if (request.ClearAssignedRoom || (request.AssignedRoomIds != null && request.AssignedRoomIds.Count == 0))
        {
            staff.SetAssignedRoomIds(null);
        }
        else if (request.AssignedRoomIds != null)
        {
            var targetIds = request.AssignedRoomIds.Where(id => id != Guid.Empty).Distinct().ToList();
            if (_roomRepository != null && targetIds.Count > 0)
            {
                var targetIdSet = targetIds.ToHashSet();
                var validRooms = await _roomRepository
                    .Query(r => r.ClinicId == _clinicContext.ClinicId && targetIdSet.Contains(r.Id))
                    .ToListAsync(cancellationToken);
                var validRoomMap = validRooms.ToDictionary(r => r.Id);

                // Preserve the exact caller-specified order so the primary room (index 0) is maintained
                var orderedValidIds = targetIds.Where(id => validRoomMap.ContainsKey(id)).ToList();
                staff.SetAssignedRoomIds(orderedValidIds);
                assignedRoomNames = orderedValidIds.Select(id => validRoomMap[id].Name).ToList();
            }
            else
            {
                staff.SetAssignedRoomIds(targetIds);
            }
        }
        else
        {
            // Preserve existing rooms and look up their display names for the DTO
            var currentIds = staff.GetAssignedRoomIds();
            if (_roomRepository != null && currentIds.Count > 0)
            {
                var targetIds = currentIds.ToHashSet();
                var validRooms = await _roomRepository
                    .Query(r => r.ClinicId == _clinicContext.ClinicId && targetIds.Contains(r.Id))
                    .ToListAsync(cancellationToken);
                var roomMap = validRooms.ToDictionary(r => r.Id, r => r.Name);
                assignedRoomNames = currentIds.Where(id => roomMap.ContainsKey(id)).Select(id => roomMap[id]).ToList();
            }
        }

        var prevFirstName = staff.FirstName;
        var prevLastName = staff.LastName;
        var prevTitle = staff.Title;
        var prevRole = staff.Role;
        var prevSpecialty = staff.Specialty;
        var previousPrc = staff.PrcLicenseNumber;
        var prevExpiry = staff.PrcExpiryDate;
        var prevProofKey = staff.PrcEvidenceObjectKey;
        var prevVerificationContact = staff.VerificationContact;
        var prevPublicBio = staff.PublicBio;
        var prevAvatarUrl = staff.AvatarUrl;
        var prevOptIn = staff.IsDirectoryOptIn;
        var prevIsActive = staff.IsActive;
        var wasVerified = staff.PublicVerificationStatus == PractitionerVerificationLevel.Verified;

        var effectiveOptIn = request.IsDirectoryOptIn ?? (ClinicianDirectoryValidationHelper.IsClinicianRole(request.Role) && staff.IsDirectoryOptIn);
        var effectivePrc = request.PrcLicenseNumber?.Trim();
        var effectiveExpiry = request.PrcExpiryDate ?? staff.PrcExpiryDate;
        var effectiveProofKey = request.PrcEvidenceObjectKey != null
            ? (string.IsNullOrWhiteSpace(request.PrcEvidenceObjectKey) ? null : request.PrcEvidenceObjectKey.Trim())
            : staff.PrcEvidenceObjectKey;
        var effectiveContact = request.VerificationContact != null
            ? (string.IsNullOrWhiteSpace(request.VerificationContact) ? null : request.VerificationContact.Trim())
            : staff.VerificationContact;

        ClinicianDirectoryValidationHelper.ValidateOptInRequirements(
            request.Role,
            effectiveOptIn,
            effectivePrc,
            effectiveExpiry,
            effectiveProofKey,
            effectiveContact);

        staff.FirstName = request.FirstName.Trim();
        staff.LastName = request.LastName.Trim();
        staff.MiddleName = request.MiddleName?.Trim();
        staff.Title = request.Title?.Trim();
        staff.Role = request.Role;
        staff.Email = normalizedEmail;
        staff.PhoneNumber = request.PhoneNumber?.Trim();
        staff.PrcLicenseNumber = effectivePrc;
        staff.PtrNumber = request.PtrNumber?.Trim();
        staff.S2LicenseNumber = request.S2LicenseNumber?.Trim();
        staff.Specialty = request.Specialty?.Trim();
        staff.PhilHealthPan = request.PhilHealthPan?.Trim();
        staff.IsDirectoryOptIn = effectiveOptIn;
        staff.PrcExpiryDate = effectiveExpiry;
        staff.PrcEvidenceObjectKey = effectiveProofKey;
        staff.VerificationContact = effectiveContact;
        if (request.PublicBio != null)
        {
            staff.PublicBio = string.IsNullOrWhiteSpace(request.PublicBio) ? null : request.PublicBio.Trim();
        }
        if (request.AvatarUrl != null)
        {
            staff.AvatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim();
        }
        if (request.SignatureSpecimen != null)
        {
            staff.SignatureSpecimen = string.IsNullOrWhiteSpace(request.SignatureSpecimen) ? null : request.SignatureSpecimen;
        }
        if (request.DefaultSignatureMode.HasValue)
        {
            staff.DefaultSignatureMode = request.DefaultSignatureMode.Value;
        }
        staff.IsActive = request.IsActive;
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        var triggeredPrcUpdateResubmission = false;
        if (wasVerified
            && ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role)
            && ClinicianDirectoryValidationHelper.HasPrcLicenseChanged(previousPrc, staff.PrcLicenseNumber))
        {
            if (!PractitionerIdentity.IsValidPrcFormat(staff.PrcLicenseNumber))
            {
                throw new ValidationException("A valid PRC license number is required when updating a verified practitioner's license.");
            }

            staff.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
            staff.PublicVerificationReason = null;

            await PractitionerVerificationSubmissionHelper.EnqueueVerificationAndAuditAsync(
                staff,
                "PrcUpdate",
                staff.UpdatedAt.Value,
                _clinicContext,
                _directorySyncService,
                _interopPublisher,
                _settingsRepository,
                _scheduleRepository,
                _auditRepository,
                cancellationToken,
                _staffRepository);
            triggeredPrcUpdateResubmission = true;
        }

        _staffRepository.Update(staff);
        try
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (StaffEmailUniquenessHelper.IsStaffEmailUniqueViolation(ex))
        {
            throw new ValidationException(StaffEmailUniquenessHelper.DuplicateStaffEmailMessage);
        }

        var directoryProfileChanged =
            !string.Equals(prevFirstName, staff.FirstName, StringComparison.Ordinal) ||
            !string.Equals(prevLastName, staff.LastName, StringComparison.Ordinal) ||
            !string.Equals(prevTitle, staff.Title, StringComparison.Ordinal) ||
            prevRole != staff.Role ||
            !string.Equals(prevSpecialty, staff.Specialty, StringComparison.Ordinal) ||
            !string.Equals(previousPrc, staff.PrcLicenseNumber, StringComparison.Ordinal) ||
            prevExpiry != staff.PrcExpiryDate ||
            !string.Equals(prevProofKey, staff.PrcEvidenceObjectKey, StringComparison.Ordinal) ||
            !string.Equals(prevVerificationContact, staff.VerificationContact, StringComparison.Ordinal) ||
            !string.Equals(prevPublicBio, staff.PublicBio, StringComparison.Ordinal) ||
            !string.Equals(prevAvatarUrl, staff.AvatarUrl, StringComparison.Ordinal) ||
            prevOptIn != staff.IsDirectoryOptIn ||
            prevIsActive != staff.IsActive;

        if (!request.SkipPendingVerificationSync
            && !triggeredPrcUpdateResubmission
            && directoryProfileChanged
            && _directorySyncService != null)
        {
            if (staff.IsActive
                && staff.IsDirectoryOptIn
                && ClinicianDirectoryValidationHelper.IsClinicianRole(staff.Role)
                && staff.PublicVerificationStatus == PractitionerVerificationLevel.PendingVerification)
            {
                await _directorySyncService.SyncPendingPractitionerVerificationAsync(
                    staff.Id,
                    throwOnConflict: false,
                    _clinicContext.StaffId?.ToString(),
                    _clinicContext.StaffName,
                    cancellationToken);
            }
            else if ((prevOptIn || staff.IsDirectoryOptIn) && _settingsRepository != null)
            {
                var settings = await _settingsRepository.Query().FirstOrDefaultAsync(cancellationToken);
                if (settings?.PlatformVerificationStatus == PlatformVerificationStatus.PendingReview)
                {
                    await _directorySyncService.SyncPendingFacilityVerificationAsync(
                        settings,
                        throwOnConflict: false,
                        _clinicContext.StaffId?.ToString(),
                        _clinicContext.StaffName,
                        cancellationToken);
                }
            }
        }

        _accessCache?.Invalidate(staff.Id);

        return StaffMemberDto.FromEntity(staff, roleName, assignedRoomNames);
    }
}
