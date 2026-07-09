using Clinic EZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed record CheckUploadStatusQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public string? StartDate { get; init; }
    public string? EndDate { get; init; }
    public string? TransmittalId { get; init; }
    public string? Report { get; init; }
}
