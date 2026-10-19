using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Newsletter.Commands;
using ClinicEz.Portal.Application.Features.Newsletter.Queries;
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
        app.MapPost("/public/newsletter", async (SubscribeNewsletterCommand command, ISender sender, CancellationToken ct) =>
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
        app.MapGet("/admin/newsletter-subscribers", async (string? search, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetNewsletterSubscribersQuery(search), ct);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("GetNewsletterSubscribers")
        .WithDescription("Retrieves the list of newsletter subscribers for administration and CSV export.")
        .WithTags("Admin");
    }
}
