using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;

namespace ClinicEz.PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

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
