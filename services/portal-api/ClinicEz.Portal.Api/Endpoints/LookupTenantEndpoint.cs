using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Threading;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class LookupTenantEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/tenants/lookup/{slug}", async (
            string slug,
            IApplicationDbContext context,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(slug))
            {
                return Results.BadRequest(new { Exists = false, Message = "Slug is required." });
            }

            var cleanSlug = slug.Trim().ToLowerInvariant();
            var tenant = await context.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == cleanSlug, ct);

            if (tenant == null)
            {
                return Results.NotFound(new { Exists = false, Message = $"Workspace '{slug}' was not found." });
            }

            return Results.Ok(new
            {
                Exists = true,
                TenantId = tenant.Id.ToString(),
                TenantSlug = tenant.TenantSlug,
                Name = tenant.Name,
                TenantType = tenant.TenantType,
                Status = tenant.SubscriptionStatus
            });
        })
        .WithName("LookupTenant")
        .WithDescription("Checks whether a tenant workspace slug exists.")
        .WithTags("Tenants")
        .AllowAnonymous();
    }
}
