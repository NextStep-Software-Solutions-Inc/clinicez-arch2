using CLINICEZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.Reports.Commands.SubmitReport;

public sealed record SubmitReportCommand : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string TransmittalId { get; init; }

    /// <summary>Base64-encoded or raw XML report content as specified by PhilHealth.</summary>
    public required string Report { get; init; }

    public required string ReportTagging { get; init; }
}
