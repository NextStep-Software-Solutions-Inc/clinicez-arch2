using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Queries.ExtractAndParseMasterlist;

public sealed record ExtractAndParseMasterlistQuery : IRequest<ApiResponse<YakapMasterlistResult>>
{
    public required string StartDate { get; init; }
    public required string EndDate { get; init; }
}
