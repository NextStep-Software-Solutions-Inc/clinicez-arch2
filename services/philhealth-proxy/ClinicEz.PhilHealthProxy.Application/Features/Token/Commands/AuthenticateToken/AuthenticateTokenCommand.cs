using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Token.Commands.AuthenticateToken;

public sealed record AuthenticateTokenCommand(PcapiTokenRequest Request) : IRequest<PcapiTokenResponse>;

public sealed class AuthenticateTokenCommandHandler(IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<AuthenticateTokenCommand, PcapiTokenResponse>
{
    public async Task<PcapiTokenResponse> Handle(AuthenticateTokenCommand command, CancellationToken cancellationToken)
    {
        var tenant = new PhilHealthTenant
        {
            AccreditationNumber = command.Request.AccreNo,
            SoftwareCertificateId = command.Request.SoftwareCertId,
            EncryptedSecretKey = command.Request.SecretKey,
            BaseUrl = "https://staging.philhealth.gov.ph"
        };

        var data = await pcapiClient.AuthenticateAsync(tenant, cancellationToken);
        return new PcapiTokenResponse("success", 200, "Token authenticated successfully.", data);
    }
}
