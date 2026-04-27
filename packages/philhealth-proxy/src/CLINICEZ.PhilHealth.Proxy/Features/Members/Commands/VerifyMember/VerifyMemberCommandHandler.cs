using CLINICEZ.PhilHealth.Proxy.Services;
using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Commands.VerifyMember;

public sealed class VerifyMemberCommandHandler(IPhilHealthSoapClient soapClient)
    : IRequestHandler<VerifyMemberCommand, bool>
{
    public async Task<bool> Handle(
        VerifyMemberCommand request,
        CancellationToken cancellationToken)
    {
        var response = await soapClient.VerifyMemberAsync(
            request.PhilHealthNumber,
            request.LastName,
            request.FirstName,
            request.DateOfBirth,
            cancellationToken);

        if (!response.IsSuccess)
            throw new InvalidOperationException(
                response.ErrorMessage ?? "Failed to verify member with PhilHealth.");

        return response.Data;
    }
}
