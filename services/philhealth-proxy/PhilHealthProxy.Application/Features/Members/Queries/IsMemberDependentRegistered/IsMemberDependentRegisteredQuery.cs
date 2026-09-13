using CLINICEZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;

public sealed record IsMemberDependentRegisteredQuery : IRequest<ApiResponse<KonsultaOperationResponse>>
{
    public required string Pin { get; init; }

    /// <summary>Member type code (e.g. "M" for member, "D" for dependent).</summary>
    public required string Type { get; init; }
}
