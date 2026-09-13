using MediatR;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Domain.Enums;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace PatientAppBE.Application.Features.Organizations.Commands.CancelOrganizationMembership;

public sealed record CancelOrganizationMembershipCommand(
    Guid PatientId,
    Guid OrganizationId) : IRequest<bool>;

public sealed class CancelOrganizationMembershipCommandHandler
    : IRequestHandler<CancelOrganizationMembershipCommand, bool>
{
    private readonly IOrganizationMembershipRepository _membershipRepo;
    private readonly IOrganizationRepository _organizationRepo;
    private readonly IUnitOfWork _uow;

    public CancelOrganizationMembershipCommandHandler(
        IOrganizationMembershipRepository membershipRepo,
        IOrganizationRepository organizationRepo,
        IUnitOfWork uow)
    {
        _membershipRepo = membershipRepo;
        _organizationRepo = organizationRepo;
        _uow = uow;
    }

    public async Task<bool> Handle(
        CancelOrganizationMembershipCommand request, CancellationToken cancellationToken)
    {
        var membership = await _membershipRepo.GetByPatientAndOrgAsync(
            request.PatientId, request.OrganizationId, cancellationToken);
        if (membership is null)
            return false;

        var org = await _organizationRepo.GetByIdAsync(request.OrganizationId, cancellationToken);
        if (org is not null && membership.Status == ClinicMembershipStatus.Active)
        {
            org.ActiveMemberCount = Math.Max(0, org.ActiveMemberCount - 1);
            _organizationRepo.Update(org);
        }

        _membershipRepo.Delete(membership);
        await _uow.SaveChangesAsync(cancellationToken);
        return true;
    }
}
