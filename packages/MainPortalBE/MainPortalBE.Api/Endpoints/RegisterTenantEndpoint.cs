using MainPortalBE.Api.Abstractions;
using MainPortalBE.Application.Features.Tenants.Commands.RegisterTenant;
using MediatR;

namespace MainPortalBE.Api.Endpoints;

public sealed class RegisterTenantEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/tenants/register", async (RegisterTenantCommand command, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(command, cancellationToken);
            return Results.Ok(new { ClerkUserId = result });
        })
        .WithTags("Tenants")
        .AllowAnonymous();
    }
}
