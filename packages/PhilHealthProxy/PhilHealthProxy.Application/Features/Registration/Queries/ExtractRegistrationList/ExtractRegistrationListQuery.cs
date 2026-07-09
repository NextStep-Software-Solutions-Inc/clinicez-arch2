using Clinic EZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;

public sealed record ExtractRegistrationListQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string StartDate { get; init; }
    public required string EndDate { get; init; }
}
