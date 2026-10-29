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

public sealed record SuspendStaffMemberCommand(Guid Id) : IRequest<StaffMemberDto>;

public sealed class SuspendStaffMemberCommandValidator : AbstractValidator<SuspendStaffMemberCommand>
{
    public SuspendStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class SuspendStaffMemberCommandHandler : IRequestHandler<SuspendStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<RefreshToken>? _refreshTokenRepository;
    private readonly IRepository<Room>? _roomRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;

    public SuspendStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<RefreshToken>? refreshTokenRepository = null,
        IRepository<Room>? roomRepository = null,
        IStaffAccessInvalidator? accessCache = null)
    {
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _refreshTokenRepository = refreshTokenRepository;
        _roomRepository = roomRepository;
        _accessCache = accessCache;
    }

    public async Task<StaffMemberDto> Handle(SuspendStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        if (_clinicContext.StaffId.HasValue && _clinicContext.StaffId.Value == staff.Id)
        {
            throw new ValidationException("You cannot suspend your own account.");
        }

        if (staff.Role == StaffRole.Admin && staff.IsActive)
        {
            var otherActiveAdmins = await _staffRepository.Query(s =>
                s.ClinicId == _clinicContext.ClinicId &&
                s.Role == StaffRole.Admin &&
                s.IsActive &&
                s.Id != staff.Id)
                .AnyAsync(cancellationToken);

            if (!otherActiveAdmins)
            {
                throw new ValidationException("Cannot suspend the only active Administrator in this clinic.");
            }
        }

        bool isCurrentSystemAdmin = ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.IsSystemAdministrator(staff);
        if (isCurrentSystemAdmin && staff.IsActive)
        {
            await ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.EnsureActiveSystemAdminRemainsAsync(
                _staffRepository,
                _clinicContext.ClinicId,
                staff.Id,
                targetWillLoseSystemAdmin: true,
                cancellationToken);
        }

        var currentPerms = ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.ResolveEffectivePermissions(staff);
        var lostCriticalPerms = ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.CriticalGovernancePermissions
            .Where(p => currentPerms.Contains(p, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (lostCriticalPerms.Count > 0)
        {
            var otherActiveStaff = await _staffRepository.Query(s =>
                s.ClinicId == _clinicContext.ClinicId &&
                s.IsActive &&
                s.Id != staff.Id)
                .Include(s => s.ClinicRole)
                .ToListAsync(cancellationToken);

            foreach (var lostPerm in lostCriticalPerms)
            {
                var anotherUserHasPerm = otherActiveStaff.Any(s =>
                    ClinicEz.Clinic.Application.Common.Helpers.GovernanceSafetyChecker.ResolveEffectivePermissions(s).Contains(lostPerm, StringComparer.OrdinalIgnoreCase));

                if (!anotherUserHasPerm)
                {
                    throw new ValidationException(
                        $"Cannot suspend the last active user with '{lostPerm}' permission in this clinic.");
                }
            }
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            staff.Status = StaffAccountStatus.Suspended;
            staff.IsActive = false;
            staff.TokenVersion++;
            staff.UpdatedAt = DateTime.UtcNow;
            staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

            _staffRepository.Update(staff);

            if (_refreshTokenRepository != null)
            {
                var activeTokens = await _refreshTokenRepository.Query(t =>
                    t.StaffMemberId == staff.Id &&
                    t.ClinicId == _clinicContext.ClinicId &&
                    t.RevokedAt == null)
                    .ToListAsync(ct);

                var now = DateTime.UtcNow;
                foreach (var token in activeTokens)
                {
                    token.RevokedAt = now;
                    token.UpdatedAt = now;
                    token.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                    _refreshTokenRepository.Update(token);
                }
            }
        }, cancellationToken);

        _accessCache?.Invalidate(staff.Id);

        var roomIds = staff.GetAssignedRoomIds();
        var roomNames = new List<string>();
        if (_roomRepository != null && roomIds.Count > 0)
        {
            var targetIds = roomIds.ToHashSet();
            var rooms = await _roomRepository.Query(r => r.ClinicId == _clinicContext.ClinicId && targetIds.Contains(r.Id))
                .ToListAsync(cancellationToken);
            var roomMap = rooms.ToDictionary(r => r.Id, r => r.Name);
            roomNames = roomIds.Where(id => roomMap.ContainsKey(id)).Select(id => roomMap[id]).ToList();
        }

        return new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            staff.ClinicRole?.Name,
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
            TemporaryPassword: null,
            PhilHealthPan: staff.PhilHealthPan,
            AssignedRoomIds: staff.GetAssignedRoomIds(),
            AssignedRoomNames: roomNames,
            SignatureSpecimen: staff.SignatureSpecimen,
            DefaultSignatureMode: staff.DefaultSignatureMode,
            Status: staff.Status,
            InvitationToken: staff.InvitationToken,
            InvitationExpiresAt: staff.InvitationExpiresAt,
            InviteAcceptedAt: staff.InviteAcceptedAt,
            InviteUrl: null);
    }
}
