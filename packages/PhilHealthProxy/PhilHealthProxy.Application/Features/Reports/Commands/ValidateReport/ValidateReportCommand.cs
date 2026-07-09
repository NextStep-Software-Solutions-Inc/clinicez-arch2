using Clinic EZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;

public sealed record ValidateReportCommand : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string ReportTagging { get; init; }

    /// <summary>Base64-encoded or raw XML report content as specified by PhilHealth.</summary>
    public required string Report { get; init; }
}
