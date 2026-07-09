using MainPortalBE.Api.Abstractions;
using MainPortalBE.Application.Features.Tenants.Queries.GetTenantByOwner;
using MediatR;


namespace MainPortalBE.Api.Endpoints;

public sealed class GetTenantByOwnerEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/users/{userId}/tenant", async (string userId, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetTenantByOwnerQuery(userId), cancellationToken);
            if (result == null) return Results.NotFound();
            return Results.Ok(result);
        })
        .WithTags("Users")
        .RequireAuthorization();
    }
}
