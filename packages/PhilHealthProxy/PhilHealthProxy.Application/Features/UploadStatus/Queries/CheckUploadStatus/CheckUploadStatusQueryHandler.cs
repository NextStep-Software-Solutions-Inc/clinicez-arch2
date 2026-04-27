using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using MediatR;
using PhilHealthProxy.Domain.Interfaces;

namespace PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed class CheckUploadStatusQueryHandler(
    IPhilHealthSoapClient soapClient,
    ICurrentTenant currentTenant)
    : IRequestHandler<CheckUploadStatusQuery, ApiResponse<CheckUploadStatusResponse>>
{
    public async Task<ApiResponse<CheckUploadStatusResponse>> Handle(
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

        var response = new CheckUploadStatusResponse(
            IsSuccess: result.IsSuccess,
            RawXml: result.ResponseXml,
            ErrorCode: result.ErrorCode,
            ErrorMessage: result.ErrorMessage);

        return ApiResponse<CheckUploadStatusResponse>.Success(response);
    }
}
