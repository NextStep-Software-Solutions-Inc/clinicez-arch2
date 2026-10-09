using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Staff.Commands;

public sealed record DeactivatePharmacyStaffMemberCommand(Guid PharmacyId, Guid StaffId) : IRequest<bool>;

public sealed class DeactivatePharmacyStaffMemberCommandValidator : AbstractValidator<DeactivatePharmacyStaffMemberCommand>
{
    public DeactivatePharmacyStaffMemberCommandValidator()
    {
        RuleFor(x => x.PharmacyId).NotEmpty();
        RuleFor(x => x.StaffId).NotEmpty();
    }
}

public sealed class DeactivatePharmacyStaffMemberCommandHandler : IRequestHandler<DeactivatePharmacyStaffMemberCommand, bool>
{
    private readonly IRepository<PharmacyStaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;

    public DeactivatePharmacyStaffMemberCommandHandler(
        IRepository<PharmacyStaffMember> staffRepo,
        IUnitOfWork unitOfWork)
    {
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(DeactivatePharmacyStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepo.Query(s => s.Id == request.StaffId && s.PharmacyId == request.PharmacyId)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Pharmacy staff member '{request.StaffId}' was not found.");
        }

        staff.IsActive = false;
        staff.TokenVersion++;
        staff.UpdatedAt = DateTime.UtcNow;

        _staffRepo.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
