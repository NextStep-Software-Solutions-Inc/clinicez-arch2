using CLINICEZ.PhilHealth.Proxy.Models;
using CLINICEZ.PhilHealth.Proxy.Services;
using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Queries.GetMemberInfo;

public sealed class GetMemberInfoQueryHandler(IPhilHealthSoapClient soapClient)
    : IRequestHandler<GetMemberInfoQuery, PhilHealthMemberInfo>
{
    public async Task<PhilHealthMemberInfo> Handle(
        GetMemberInfoQuery request,
        CancellationToken cancellationToken)
    {
        var response = await soapClient.GetMemberInfoAsync(request.PhilHealthNumber, cancellationToken);

        if (!response.IsSuccess || response.Data is null)
            throw new InvalidOperationException(
                response.ErrorMessage ?? "Failed to retrieve member information from PhilHealth.");

        return response.Data;
    }
}
