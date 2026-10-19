using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;

namespace ClinicEz.PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed record CheckUploadStatusQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public string? StartDate { get; init; }
    public string? EndDate { get; init; }
    public string? TransmittalId { get; init; }
    public string? Report { get; init; }
}
