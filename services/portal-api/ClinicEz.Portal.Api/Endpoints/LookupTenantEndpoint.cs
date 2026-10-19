using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class LookupTenantEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/tenants/lookup/{slug}", async (
            string slug,
            IApplicationDbContext context,
            TimeProvider timeProvider,
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
                var facility = await context.Facilities
                    .Include(f => f.Tenant)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(f => !f.IsDeleted && f.Slug.ToLower() == cleanSlug, ct);

                if (facility?.Tenant != null)
                {
                    return Results.Ok(new
                    {
                        Exists = true,
                        TenantId = facility.Tenant.Id.ToString(),
                        TenantSlug = facility.Tenant.TenantSlug,
                        FacilityId = facility.Id.ToString(),
                        FacilitySlug = facility.Slug,
                        Name = facility.Name,
                        TenantType = facility.Tenant.TenantType,
                        Status = await StatusOfAsync(context, facility.Tenant.Id, timeProvider, ct)
                    });
                }

                return Results.NotFound(new { Exists = false, Message = $"Workspace or facility '{slug}' was not found." });
            }

            return Results.Ok(new
            {
                Exists = true,
                TenantId = tenant.Id.ToString(),
                TenantSlug = tenant.TenantSlug,
                Name = tenant.Name,
                TenantType = tenant.TenantType,
                Status = await StatusOfAsync(context, tenant.Id, timeProvider, ct)
            });
        })
        .WithName("LookupTenant")
        .WithDescription("Checks whether a tenant workspace slug exists.")
        .WithTags("Tenants")
        .AllowAnonymous();
    }

    private static async Task<string> StatusOfAsync(IApplicationDbContext context, Guid tenantId, TimeProvider timeProvider, CancellationToken ct)
    {
        var subscription = await context.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        var status = subscription?.EffectiveStatus(timeProvider.GetUtcNow().UtcDateTime) ?? SubscriptionStatus.Trialing;
        return SubscriptionWire.Status(status);
    }
}
