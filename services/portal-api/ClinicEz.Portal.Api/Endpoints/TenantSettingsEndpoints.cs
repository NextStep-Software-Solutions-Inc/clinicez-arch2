using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Tenants.Commands.UpdateTenantSettings;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ClinicEz.Portal.Api.Endpoints;

public class TenantSettingsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPut("/tenants/{tenantSlug}/settings", async (
            string tenantSlug,
            UpdateTenantSettingsCommand command,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var slugLower = tenantSlug.Trim().ToLowerInvariant();
            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == slugLower || t.Id.ToString() == slugLower);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            // Ensure route slug matches command
            var cmdWithSlug = command with { TenantSlug = tenant.TenantSlug };
            var result = await sender.Send(cmdWithSlug);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("UpdateTenantSettings")
        .WithDescription("Updates workspace identity, profile, and contact settings.")
        .WithTags("Tenants");
    }
}
