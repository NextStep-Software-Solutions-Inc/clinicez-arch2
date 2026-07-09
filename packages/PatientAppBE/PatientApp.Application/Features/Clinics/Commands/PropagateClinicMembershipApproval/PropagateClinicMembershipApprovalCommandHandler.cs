using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;
using System.Threading;
using System.Threading.Tasks;

namespace PatientApp.Application.Features.Clinics.Commands.PropagateClinicMembershipApproval;

public sealed class PropagateClinicMembershipApprovalCommandHandler
    : IRequestHandler<PropagateClinicMembershipApprovalCommand, bool>
{
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IUnitOfWork _uow;

    public PropagateClinicMembershipApprovalCommandHandler(
        IClinicRepository clinicRepo,
        IClinicMembershipRepository membershipRepo,
        IUnitOfWork uow)
    {
        _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo;
        _uow = uow;
    }

    public async Task<bool> Handle(
        PropagateClinicMembershipApprovalCommand request, CancellationToken cancellationToken)
    {
        var membership = await _membershipRepo.GetByIdAsync(request.MembershipId, cancellationToken)
            ?? throw new NotFoundException($"Membership '{request.MembershipId}' was not found.");

        if (membership.ClinicId != request.ClinicId)
            throw new ConflictException("Membership does not belong to the specified clinic.");

        if (request.Approve)
        {
            if (membership.Status == ClinicMembershipStatus.Active)
                return true; // Already approved

            membership.Status = ClinicMembershipStatus.Active;

            var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken)
                ?? throw new NotFoundException($"Clinic '{request.ClinicId}' was not found.");

            clinic.ActiveMemberCount += 1;
            _clinicRepo.Update(clinic);
        }
        else
        {
            membership.Status = ClinicMembershipStatus.Rejected;
        }

        _membershipRepo.Update(membership);
        await _uow.SaveChangesAsync(cancellationToken);
        return true;
    }
}
