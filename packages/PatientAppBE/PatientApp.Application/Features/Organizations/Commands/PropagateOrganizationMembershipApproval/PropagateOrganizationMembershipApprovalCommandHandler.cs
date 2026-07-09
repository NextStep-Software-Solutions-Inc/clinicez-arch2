using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;
using System.Threading;
using System.Threading.Tasks;

namespace PatientApp.Application.Features.Organizations.Commands.PropagateOrganizationMembershipApproval;

public sealed class PropagateOrganizationMembershipApprovalCommandHandler
    : IRequestHandler<PropagateOrganizationMembershipApprovalCommand, bool>
{
    private readonly IOrganizationRepository _orgRepo;
    private readonly IOrganizationMembershipRepository _membershipRepo;
    private readonly IUnitOfWork _uow;

    public PropagateOrganizationMembershipApprovalCommandHandler(
        IOrganizationRepository orgRepo,
        IOrganizationMembershipRepository membershipRepo,
        IUnitOfWork uow)
    {
        _orgRepo = orgRepo;
        _membershipRepo = membershipRepo;
        _uow = uow;
    }

    public async Task<bool> Handle(
        PropagateOrganizationMembershipApprovalCommand request, CancellationToken cancellationToken)
    {
        var membership = await _membershipRepo.GetByIdAsync(request.MembershipId, cancellationToken)
            ?? throw new NotFoundException($"Membership '{request.MembershipId}' was not found.");

        if (membership.OrganizationId != request.OrganizationId)
            throw new ConflictException("Membership does not belong to the specified organization.");

        if (request.Approve)
        {
            if (membership.Status == ClinicMembershipStatus.Active)
                return true; // Already approved

            membership.Status = ClinicMembershipStatus.Active;

            var org = await _orgRepo.GetByIdAsync(request.OrganizationId, cancellationToken)
                ?? throw new NotFoundException($"Organization '{request.OrganizationId}' was not found.");

            org.ActiveMemberCount += 1;
            _orgRepo.Update(org);
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
