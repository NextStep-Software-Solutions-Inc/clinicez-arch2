using System;
using System.Linq;
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

public sealed record RemoveStaffMemberCommand(Guid Id) : IRequest<bool>;

public sealed class RemoveStaffMemberCommandValidator : AbstractValidator<RemoveStaffMemberCommand>
{
    public RemoveStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class RemoveStaffMemberCommandHandler : IRequestHandler<RemoveStaffMemberCommand, bool>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<RefreshToken>? _refreshTokenRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;

    public RemoveStaffMemberCommandHandler(
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

    public async Task<bool> Handle(RemoveStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        if (_clinicContext.StaffId.HasValue && _clinicContext.StaffId.Value == staff.Id)
        {
            throw new ValidationException("You cannot remove your own account.");
        }

        if (staff.Status != StaffAccountStatus.Revoked && staff.Status != StaffAccountStatus.Suspended && staff.IsActive)
        {
            throw new ValidationException("Only revoked or suspended staff accounts can be permanently removed from the facility directory. Please revoke or suspend their access first.");
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var now = DateTime.UtcNow;
            var actor = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

            staff.IsActive = false;
            staff.Status = StaffAccountStatus.Revoked;
            staff.InvitationToken = null;
            staff.InvitationExpiresAt = null;
            staff.IsDeleted = true;
            staff.DeletedAt = now;
            staff.DeletedBy = actor;
            staff.TokenVersion++;
            staff.UpdatedAt = now;
            staff.UpdatedBy = actor;

            _staffRepository.Update(staff);

            if (_refreshTokenRepository != null)
            {
                var activeTokens = await _refreshTokenRepository.Query(t =>
                    t.StaffMemberId == staff.Id &&
                    t.ClinicId == _clinicContext.ClinicId &&
                    t.RevokedAt == null)
                    .ToListAsync(ct);

                foreach (var token in activeTokens)
                {
                    token.RevokedAt = now;
                    token.UpdatedAt = now;
                    token.UpdatedBy = actor;
                    _refreshTokenRepository.Update(token);
                }
            }
        }, cancellationToken);

        _accessCache?.Invalidate(staff.Id);

        return true;
    }
}
