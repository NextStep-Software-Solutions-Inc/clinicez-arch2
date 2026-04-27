using CLINICEZ.Shared.Common;
using MediatR;

namespace PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed record CheckUploadStatusQuery : IRequest<ApiResponse<CheckUploadStatusResponse>>
{
    public string? StartDate { get; init; }
    public string? EndDate { get; init; }
    public string? TransmittalId { get; init; }
    public string? Report { get; init; }
}
