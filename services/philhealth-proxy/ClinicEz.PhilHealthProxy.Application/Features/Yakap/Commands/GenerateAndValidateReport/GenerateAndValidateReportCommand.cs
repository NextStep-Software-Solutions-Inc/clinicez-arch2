using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndValidateReport;

public sealed record YakapValidationResponse(
    bool IsValid,
    string? TransmittalNumber,
    string? RawXml,
    string? EncryptedPayload,
    string? PhilHealthSoapResponse,
    IReadOnlyList<string>? ValidationErrors);

public sealed record GenerateAndValidateReportCommand : IRequest<ApiResponse<YakapValidationResponse>>
{
    public required YakapReportDocument Document { get; init; }
    public required string ReportTagging { get; init; } // "1" for Tranche 1, "2" for Tranche 2
}
