using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using MediatR;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using System.Threading;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class GetTenantByOwnerEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/users/{userId}/tenant", async (
            string userId, 
            string? tenantSlug,
            HttpContext httpContext, 
            ISender sender, 
            CancellationToken cancellationToken) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId) || clerkUserId != userId)
            {
                return Results.Forbid();
            }

            var result = await sender.Send(new GetTenantByOwnerQuery(userId, tenantSlug), cancellationToken);
            if (result == null) return Results.NotFound();
            return Results.Ok(result);
        })
        .WithName("GetTenantByOwner")
        .WithDescription("Retrieves the tenant details and role associated with the specified user ID.")
        .WithTags("Users")
        .RequireAuthorization();
    }
}
