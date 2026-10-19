using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;

namespace ClinicEz.PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;

public sealed record ExtractRegistrationListQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string StartDate { get; init; }
    public required string EndDate { get; init; }
}
