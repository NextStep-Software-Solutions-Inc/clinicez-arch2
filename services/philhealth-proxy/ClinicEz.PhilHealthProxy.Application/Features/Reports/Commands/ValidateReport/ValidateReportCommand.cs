using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;

namespace ClinicEz.PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;

public sealed record ValidateReportCommand : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string ReportTagging { get; init; }

    /// <summary>Base64-encoded or raw XML report content as specified by PhilHealth.</summary>
    public required string Report { get; init; }
}
