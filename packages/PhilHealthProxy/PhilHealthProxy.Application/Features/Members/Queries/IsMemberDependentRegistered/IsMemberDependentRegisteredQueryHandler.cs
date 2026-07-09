using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using MediatR;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Domain.Interfaces;

namespace PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;

public sealed class IsMemberDependentRegisteredQueryHandler(
    IPhilHealthSoapClient soapClient,
    ICurrentTenant currentTenant)
    : IRequestHandler<IsMemberDependentRegisteredQuery, ApiResponse<KonsultaOperationResponse>>
{
    public async Task<ApiResponse<KonsultaOperationResponse>> Handle(
        IsMemberDependentRegisteredQuery request,
        CancellationToken cancellationToken)
    {
        if (currentTenant.TenantId is null)
            throw new UnauthorizedException("Tenant could not be resolved from the request.");

        var result = await soapClient.IsMemberDependentRegisteredAsync(
            request.Pin,
            request.Type,
            cancellationToken);

        if (!result.IsSuccess)
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{result.ErrorCode}] {result.ErrorMessage}");

        return ApiResponse<KonsultaOperationResponse>.Success(
            new KonsultaOperationResponse(true, result.ResponseXml, null, null));
    }
}
