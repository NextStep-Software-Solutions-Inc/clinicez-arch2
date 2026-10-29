using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record DeactivateStaffMemberCommand(Guid Id) : IRequest<bool>;

public sealed class DeactivateStaffMemberCommandValidator : AbstractValidator<DeactivateStaffMemberCommand>
{
    public DeactivateStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class DeactivateStaffMemberCommandHandler : IRequestHandler<DeactivateStaffMemberCommand, bool>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<RefreshToken>? _refreshTokenRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;

    public DeactivateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<RefreshToken>? refreshTokenRepository = null,
        IStaffAccessInvalidator? accessCache = null)
    {
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _refreshTokenRepository = refreshTokenRepository;
        _accessCache = accessCache;
    }

    public async Task<bool> Handle(DeactivateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        // Prevent self-deactivation if caller is this staff member
        if (_clinicContext.StaffId.HasValue && _clinicContext.StaffId.Value == staff.Id)
        {
            throw new ValidationException("You cannot deactivate your own account.");
        }

        // Guard: Cannot deactivate the only active Administrator
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
                throw new ValidationException("Cannot deactivate the only active Administrator in this clinic.");
            }
        }

        // Guard 1: Cannot deactivate the only active built-in System Administrator
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

        // Guard 2: Cannot deactivate the last active user holding critical governance permissions
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
                        $"Cannot deactivate the last active user with '{lostPerm}' permission in this clinic.");
                }
            }
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            staff.IsActive = false;
            staff.Status = StaffAccountStatus.Suspended;
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

        return true;
    }
}
