using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.PhilHealthProxy.Application.Common;

namespace ClinicEz.PhilHealthProxy.Application.Features.Token.Queries.GetToken;

public sealed record GetTokenQuery : IRequest<ApiResponse<KonsultaOperationResponse>>;
