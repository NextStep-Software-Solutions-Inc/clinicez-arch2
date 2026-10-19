using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Staff.Commands;

public sealed record DeactivateLabStaffMemberCommand(Guid LaboratoryId, Guid StaffId) : IRequest<bool>;

public sealed class DeactivateLabStaffMemberCommandValidator : AbstractValidator<DeactivateLabStaffMemberCommand>
{
    public DeactivateLabStaffMemberCommandValidator()
    {
        RuleFor(x => x.LaboratoryId).NotEmpty();
        RuleFor(x => x.StaffId).NotEmpty();
    }
}

public sealed class DeactivateLabStaffMemberCommandHandler : IRequestHandler<DeactivateLabStaffMemberCommand, bool>
{
    private readonly IRepository<LabStaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;

    public DeactivateLabStaffMemberCommandHandler(
        IRepository<LabStaffMember> staffRepo,
        IUnitOfWork unitOfWork)
    {
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(DeactivateLabStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepo.Query(s => s.Id == request.StaffId && s.LaboratoryId == request.LaboratoryId)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Laboratory staff member '{request.StaffId}' was not found.");
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            staff.IsActive = false;
            staff.TokenVersion++;
            staff.UpdatedAt = DateTime.UtcNow;

            _staffRepo.Update(staff);
        }, cancellationToken);

        return true;
    }
}
