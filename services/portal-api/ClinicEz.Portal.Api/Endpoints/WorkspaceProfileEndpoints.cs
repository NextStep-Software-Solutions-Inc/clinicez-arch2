using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Workspace;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Net.Http.Headers;
using System.Threading;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>
/// Anonymous, cacheable projection of the workspace identity (brand + regional defaults) that facility
/// services pull and cache. Versioned with an ETag so unchanged profiles cost a 304.
/// </summary>
public class WorkspaceProfileEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/tenants/{tenantSlug}/workspace-profile", async (
            string tenantSlug,
            HttpContext httpContext,
            ISender sender,
            CancellationToken ct) =>
        {
            var profile = await sender.Send(new GetWorkspaceProfileQuery(tenantSlug), ct);
            if (profile is null) return Results.NotFound(new { Message = "Workspace not found." });

            var etag = $"\"{profile.Version}\"";
            var response = httpContext.Response;
            response.Headers[HeaderNames.ETag] = etag;
            response.Headers[HeaderNames.CacheControl] = "public, max-age=300, must-revalidate";

            if (httpContext.Request.Headers.IfNoneMatch.ToString().Contains(etag))
                return Results.StatusCode(StatusCodes.Status304NotModified);

            return Results.Ok(profile);
        })
        .AllowAnonymous()
        .WithTags("Workspace Settings")
        .WithName("GetWorkspaceProfile")
        .WithDescription("Anonymous, ETag-versioned workspace identity (display name, logo, accent color, locale defaults) inherited by facilities.");
    }
}
