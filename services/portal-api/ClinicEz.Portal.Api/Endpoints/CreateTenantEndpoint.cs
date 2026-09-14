using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System.Security.Claims;
using System.Threading;

namespace ClinicEz.Portal.Api.Endpoints;

public record CreateTenantRequest(
    string Name,
    string TenantSlug,
    string? TenantType,
    string? FirstName,
    string? LastName,
    string? Email
);

public sealed class CreateTenantEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/tenants", async (
            CreateTenantRequest request, 
            HttpContext httpContext, 
            ISender sender, 
            CancellationToken cancellationToken) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var email = request.Email ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value;
            var firstName = request.FirstName ?? httpContext.User.FindFirst(ClaimTypes.GivenName)?.Value;
            var lastName = request.LastName ?? httpContext.User.FindFirst(ClaimTypes.Surname)?.Value;

            var command = new CreateTenantCommand(
                OwnerId: clerkUserId,
                Name: request.Name,
                TenantSlug: request.TenantSlug,
                TenantType: request.TenantType ?? "Workplace",
                FirstName: firstName,
                LastName: lastName,
                Email: email
            );

            var result = await sender.Send(command, cancellationToken);
            return Results.Created($"/users/{clerkUserId}/tenant", result);
        })
        .WithName("CreateTenant")
        .WithDescription("Provisions a new workplace/entity tenant for an authenticated user.")
        .WithTags("Tenants")
        .RequireAuthorization();
    }
}
