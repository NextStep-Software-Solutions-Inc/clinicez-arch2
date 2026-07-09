using Clinic EZ.Shared.Common;
using Clinic EZ.Shared.Exceptions;
using MediatR;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Domain.Interfaces;

namespace PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed class CheckUploadStatusQueryHandler(
    IPhilHealthSoapClient soapClient,
    ICurrentTenant currentTenant)
    : IRequestHandler<CheckUploadStatusQuery, ApiResponse<KonsultaOperationResponse>>
{
    public async Task<ApiResponse<KonsultaOperationResponse>> Handle(
        CheckUploadStatusQuery request,
        CancellationToken cancellationToken)
    {
        if (currentTenant.TenantId is null)
            throw new UnauthorizedException("Tenant could not be resolved from the request.");

        var result = await soapClient.CheckUploadStatusAsync(
            request.StartDate,
            request.EndDate,
            request.TransmittalId,
            request.Report,
            cancellationToken);

        if (!result.IsSuccess)
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{result.ErrorCode}] {result.ErrorMessage}");

        return ApiResponse<KonsultaOperationResponse>.Success(
            new KonsultaOperationResponse(true, result.ResponseXml, null, null));
    }
}
