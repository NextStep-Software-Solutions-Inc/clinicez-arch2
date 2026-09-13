using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;

namespace ClinicEz.PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;

public sealed record IsAtcValidQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string Pin { get; init; }
    public required string Atc { get; init; }
    public required string EffectivityDate { get; init; }
}
