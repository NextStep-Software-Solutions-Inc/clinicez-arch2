using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed class ContactEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "contact-us";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/contact", async (
            SendContactMessageCommand command,
            ISender sender,
            CancellationToken ct) =>
        {
            var accepted = await sender.Send(command, ct);
            return accepted
                ? Results.Ok(new { Success = true })
                : Results.Json(new { Message = "Contact messages are not available right now." }, statusCode: StatusCodes.Status503ServiceUnavailable);
        })
        .AllowAnonymous()
        .RequireRateLimiting(RateLimitPolicy)
        .WithName("SendContactMessage")
        .WithDescription("Emails a message from the public contact form to the configured inbox. Anonymous and rate limited.")
        .WithTags("Contact");

        app.MapGet("/contact/info", async (ISystemSettingsService settingsService, CancellationToken ct) =>
        {
            var info = await settingsService.GetContactPlatformConfigAsync(ct);
            return Results.Ok(info);
        })
        .AllowAnonymous()
        .WithName("GetContactPlatformConfig")
        .WithDescription("Retrieves public contact details: headquarters address, support/sales emails, phone, and operating hours.")
        .WithTags("Contact");
    }
}
