using MediatR;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Domain.Enums;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace PatientAppBE.Application.Features.Clinics.Commands.CancelClinicMembership;

public sealed record CancelClinicMembershipCommand(
    Guid PatientId,
    Guid ClinicId) : IRequest<bool>;

public sealed class CancelClinicMembershipCommandHandler
    : IRequestHandler<CancelClinicMembershipCommand, bool>
{
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IUnitOfWork _uow;

    public CancelClinicMembershipCommandHandler(
        IClinicMembershipRepository membershipRepo,
        IClinicRepository clinicRepo,
        IUnitOfWork uow)
    {
        _membershipRepo = membershipRepo;
        _clinicRepo = clinicRepo;
        _uow = uow;
    }

    public async Task<bool> Handle(
        CancelClinicMembershipCommand request, CancellationToken cancellationToken)
    {
        var membership = await _membershipRepo.GetByPatientAndClinicAsync(
            request.PatientId, request.ClinicId, cancellationToken);
        if (membership is null)
            return false;

        var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken);
        if (clinic is not null && membership.Status == ClinicMembershipStatus.Active)
        {
            clinic.ActiveMemberCount = Math.Max(0, clinic.ActiveMemberCount - 1);
            _clinicRepo.Update(clinic);
        }

        _membershipRepo.Delete(membership);
        await _uow.SaveChangesAsync(cancellationToken);
        return true;
    }
}
