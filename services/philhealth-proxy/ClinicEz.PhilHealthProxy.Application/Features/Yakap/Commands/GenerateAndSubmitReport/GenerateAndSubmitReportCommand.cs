using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndSubmitReport;

public sealed record YakapSubmissionResponse(
    bool IsSuccess,
    string TransmittalNumber,
    string? TransactionNumber,
    string? RawXml,
    string? PhilHealthSoapResponse,
    IReadOnlyList<string>? ValidationErrors);

public sealed record GenerateAndSubmitReportCommand : IRequest<ApiResponse<YakapSubmissionResponse>>
{
    public required YakapReportDocument Document { get; init; }
    public required string ReportTagging { get; init; } // "1" for Tranche 1, "2" for Tranche 2
}
