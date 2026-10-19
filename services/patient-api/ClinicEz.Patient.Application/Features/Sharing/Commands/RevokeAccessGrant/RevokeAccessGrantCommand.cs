using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Sharing.Commands.RevokeAccessGrant;

/// <summary>
/// Ends a facility's access. Future fetches are refused; whatever the facility already imported into its own
/// chart stays there (clinical record retention), which the app tells the patient before they confirm.
/// </summary>
public sealed record RevokeAccessGrantCommand(Guid PatientId, Guid GrantId) : IRequest;

public sealed class RevokeAccessGrantCommandHandler : IRequestHandler<RevokeAccessGrantCommand>
{
    public const string RevokedAction = "GrantRevoked";

    private readonly IPatientAccessRepository _access;
    private readonly IUnitOfWork _uow;
    private readonly TimeProvider _clock;

    public RevokeAccessGrantCommandHandler(IPatientAccessRepository access, IUnitOfWork uow, TimeProvider clock)
    {
        _access = access;
        _uow = uow;
        _clock = clock;
    }

    public async Task Handle(RevokeAccessGrantCommand request, CancellationToken cancellationToken)
    {
        var grant = await _access.GetGrantAsync(request.PatientId, request.GrantId, cancellationToken)
            ?? throw new NotFoundException($"Access grant '{request.GrantId}' was not found.");

        if (grant.RevokedAt is not null)
            return;

        grant.RevokedAt = _clock.GetUtcNow().UtcDateTime;
        await _access.AddLogAsync(new PatientAccessLog
        {
            PatientId = request.PatientId,
            GrantId = grant.Id,
            Actor = $"patient:{request.PatientId}",
            Action = RevokedAction,
            Detail = "The patient revoked this facility's access."
        }, cancellationToken);

        await _uow.SaveChangesAsync(cancellationToken);
    }
}