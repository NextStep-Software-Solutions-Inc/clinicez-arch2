using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using MediatR;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record ClaimLabOrderCommand(string Token) : IRequest<ClaimLabOrderResult>;

/// <summary>Accepted claim: the order itself arrives from the hub as <c>lab.order.issued</c> and shows up on the worklist.</summary>
public record ClaimLabOrderResult(Guid ClaimId, Guid CorrelationId);

/// <summary>
/// Redeems the patient's QR slip for the signed-in laboratory. Hub failures surface as <see cref="HubClaimException"/>
/// (the API maps 404/409/410/403/422 to friendly, fixed messages).
/// </summary>
public class ClaimLabOrderCommandHandler : IRequestHandler<ClaimLabOrderCommand, ClaimLabOrderResult>
{
    private readonly IHubClaimsClient _claims;
    private readonly ILabContext _labContext;

    public ClaimLabOrderCommandHandler(IHubClaimsClient claims, ILabContext labContext)
    {
        _claims = claims;
        _labContext = labContext;
    }

    public async Task<ClaimLabOrderResult> Handle(ClaimLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("A claim token is required.");
        }

        if (_labContext.ScopeKind != LabScopeKind.Facility
            || string.IsNullOrWhiteSpace(_labContext.TenantId)
            || _labContext.LaboratoryId is not { } laboratoryId
            || laboratoryId == Guid.Empty)
        {
            throw new ForbiddenException("Only a signed-in laboratory can claim an order.");
        }

        var redeemed = await _claims.RedeemAsync(
            request.Token.Trim(),
            new ClaimRedeemRequest(_labContext.TenantId, laboratoryId.ToString()),
            cancellationToken);

        return new ClaimLabOrderResult(redeemed.ClaimId, redeemed.CorrelationId);
    }
}
