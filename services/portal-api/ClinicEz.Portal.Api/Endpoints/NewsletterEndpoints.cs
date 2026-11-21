using System.Security.Claims;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Newsletter.Commands;
using ClinicEz.Portal.Application.Features.Newsletter.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class NewsletterEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "PublicApi";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // Public subscription endpoint
        app.MapPost("/public/newsletter", async (
            SubscribeNewsletterCommand command,
            ISender sender,
            CancellationToken ct) =>
        {
            var result = await sender.Send(command, ct);
            if (!result.Success)
            {
                return Results.BadRequest(new { Success = false, result.Message });
            }

            return result.AlreadySubscribed
                ? Results.Ok(new { Success = true, result.Message, AlreadySubscribed = true })
                : Results.Created("/public/newsletter", new { Success = true, result.Message });
        })
        .AllowAnonymous()
        .RequireRateLimiting(RateLimitPolicy)
        .WithName("SubscribeNewsletter")
        .WithDescription("Subscribes an email to Clinic EZ updates and newsletter.")
        .WithTags("Newsletter");

        // Admin subscriber management endpoint
        app.MapGet("/admin/newsletter-subscribers", async (
            string? search,
            HttpContext httpContext,
            ISender sender,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var email = httpContext.User.FindFirst("emails")?.Value
                        ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value
                        ?? httpContext.User.FindFirst("email")?.Value;

            var admin = await sender.Send(new GetAdminMeQuery(clerkUserId, email), ct);
            if (admin == null)
            {
                return Results.Json(new { Message = "Access denied. Not an administrative profile." }, statusCode: 403);
            }

            if (!admin.Permissions.Contains(Permissions.ManageBlogs) && !admin.Permissions.Contains(Permissions.ViewTenants))
            {
                return Results.Json(new { Message = "Access denied. Requires manage:blogs or view:tenants permission." }, statusCode: 403);
            }

            var result = await sender.Send(new GetNewsletterSubscribersQuery(search), ct);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("GetNewsletterSubscribers")
        .WithDescription("Retrieves the list of newsletter subscribers for administration and CSV export.")
        .WithTags("Admin");
    }
}
