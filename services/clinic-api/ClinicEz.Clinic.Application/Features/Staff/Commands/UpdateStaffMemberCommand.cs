using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
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
    bool ClearAssignedRoom = false) : IRequest<StaffMemberDto>;

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
    }
}

public sealed class UpdateStaffMemberCommandHandler : IRequestHandler<UpdateStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<ClinicRole> _roleRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    private readonly IStaffAccessInvalidator? _accessCache;
    private readonly IRepository<ClinicRoom>? _roomRepository;

    public UpdateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicRole> roleRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IStaffAccessInvalidator? accessCache = null,
        IRepository<ClinicRoom>? roomRepository = null)
    {
        _staffRepository = staffRepository;
        _roleRepository = roleRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _accessCache = accessCache;
        _roomRepository = roomRepository;
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
        bool isCurrentSystemAdmin = ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.IsSystemAdministrator(staff);
        if (isCurrentSystemAdmin && staff.IsActive)
        {
            bool willLoseSystemAdmin = !request.IsActive ||
                request.Role != StaffRole.Admin ||
                (request.ClinicRoleId.HasValue && (staff.ClinicRole == null || request.ClinicRoleId.Value != staff.ClinicRoleId));

            await ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.EnsureActiveSystemAdminRemainsAsync(
                _staffRepository,
                _clinicContext.ClinicId,
                staff.Id,
                willLoseSystemAdmin,
                cancellationToken);
        }

        // Guard 2: Cannot reassign or deactivate the last active user holding critical governance permissions (roles:manage, staff:manage, settings:manage)
        await ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.EnsureGovernancePermissionsRemainOnStaffChangeAsync(
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

        staff.FirstName = request.FirstName.Trim();
        staff.LastName = request.LastName.Trim();
        staff.MiddleName = request.MiddleName?.Trim();
        staff.Title = request.Title?.Trim();
        staff.Role = request.Role;
        staff.Email = request.Email?.Trim();
        staff.PhoneNumber = request.PhoneNumber?.Trim();
        staff.PrcLicenseNumber = request.PrcLicenseNumber?.Trim();
        staff.PtrNumber = request.PtrNumber?.Trim();
        staff.S2LicenseNumber = request.S2LicenseNumber?.Trim();
        staff.Specialty = request.Specialty?.Trim();
        staff.PhilHealthPan = request.PhilHealthPan?.Trim();
        staff.IsActive = request.IsActive;
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        _staffRepository.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _accessCache?.Invalidate(staff.Id);

        return new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            roleName,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.PtrNumber,
            staff.S2LicenseNumber,
            staff.Specialty,
            staff.IsActive,
            staff.CreatedAt,
            HasCredentials: !string.IsNullOrEmpty(staff.PasswordHash),
            MustChangePassword: staff.MustChangePassword,
            PhilHealthPan: staff.PhilHealthPan,
            AssignedRoomIds: staff.GetAssignedRoomIds(),
            AssignedRoomNames: assignedRoomNames);
    }
}
