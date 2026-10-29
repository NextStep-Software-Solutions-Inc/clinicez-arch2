using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Token.Queries.GetToken;

public sealed record GetTokenQuery : IRequest<PcapiTokenResponse>;
