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
    private readonly IRepository<ClinicRefreshToken>? _refreshTokenRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;

    public DeactivateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<ClinicRefreshToken>? refreshTokenRepository = null,
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

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
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

        return true;
    }
}
