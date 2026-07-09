using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using MediatR;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Domain.Interfaces;

namespace PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;

public sealed class IsAtcValidQueryHandler(
    IPhilHealthSoapClient soapClient,
    ICurrentTenant currentTenant)
    : IRequestHandler<IsAtcValidQuery, ApiResponse<KonsultaOperationResponse>>
{
    public async Task<ApiResponse<KonsultaOperationResponse>> Handle(
        IsAtcValidQuery request,
        CancellationToken cancellationToken)
    {
        if (currentTenant.TenantId is null)
            throw new UnauthorizedException("Tenant could not be resolved from the request.");

        var result = await soapClient.IsAtcValidAsync(
            request.Pin,
            request.Atc,
            request.EffectivityDate,
            cancellationToken);

        if (!result.IsSuccess)
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{result.ErrorCode}] {result.ErrorMessage}");

        return ApiResponse<KonsultaOperationResponse>.Success(
            new KonsultaOperationResponse(true, result.ResponseXml, null, null));
    }
}
