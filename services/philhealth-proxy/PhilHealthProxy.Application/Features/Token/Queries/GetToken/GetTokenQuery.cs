using CLINICEZ.Shared.Common;
using MediatR;
using PhilHealthProxy.Application.Common;

namespace PhilHealthProxy.Application.Features.Token.Queries.GetToken;

public sealed record GetTokenQuery : IRequest<ApiResponse<KonsultaOperationResponse>>;
