using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;

/// <summary>Result of redeeming a prescription QR. The prescription itself arrives asynchronously as an <c>rx.issued</c> message.</summary>
public record ClaimPrescriptionResultDto(
    Guid ClaimId,
    Guid PrescriptionId,
    string IssuerTenantId,
    string IssuerFacilityId,
    string Type);

public record ClaimPrescriptionCommand(string Token) : IRequest<ClaimPrescriptionResultDto>;

public class ClaimPrescriptionCommandValidator : AbstractValidator<ClaimPrescriptionCommand>
{
    public ClaimPrescriptionCommandValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(512);
    }
}

/// <summary>
/// Redeems a patient's single-use claim token at the hub on behalf of THIS pharmacy (tenant and facility come from the
/// authenticated staff scope, never from the request). The hub then delivers the claimed <c>rx.issued</c> into this pharmacy's
/// mailbox, where <c>PrescriptionIssuedHandler</c> ingests it. Hub failures surface as <c>HubClaimException</c> and are mapped
/// to HTTP 404/409/410/403/422 by the API.
/// </summary>
public class ClaimPrescriptionCommandHandler : IRequestHandler<ClaimPrescriptionCommand, ClaimPrescriptionResultDto>
{
    private readonly IHubClaimsClient _claims;
    private readonly IPharmacyContext _pharmacy;

    public ClaimPrescriptionCommandHandler(IHubClaimsClient claims, IPharmacyContext pharmacy)
    {
        _claims = claims;
        _pharmacy = pharmacy;
    }

    public async Task<ClaimPrescriptionResultDto> Handle(ClaimPrescriptionCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_pharmacy.TenantId) || _pharmacy.PharmacyId == Guid.Empty)
        {
            throw new ForbiddenException("No pharmacy workspace is associated with this session.");
        }

        var redeemed = await _claims.RedeemAsync(
            request.Token.Trim(),
            new ClaimRedeemRequest(_pharmacy.TenantId, _pharmacy.PharmacyId.ToString()),
            cancellationToken);

        return new ClaimPrescriptionResultDto(
            redeemed.ClaimId,
            redeemed.CorrelationId,
            redeemed.IssuerTenantId,
            redeemed.IssuerFacilityId,
            redeemed.Type);
    }
}
