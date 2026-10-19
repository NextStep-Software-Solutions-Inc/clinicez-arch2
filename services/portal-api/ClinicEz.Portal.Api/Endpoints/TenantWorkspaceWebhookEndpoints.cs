using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Portal.Api.Endpoints;

public class TenantWorkspaceWebhookEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/webhooks/tenant-workspace", async (
            TenantWorkspaceWebhookPayload payload,
            HttpContext httpContext,
            IConfiguration configuration,
            ISender sender) =>
        {
            var isAuthenticated = httpContext.User?.Identity?.IsAuthenticated == true;
            var configuredSecret = configuration["Webhooks:TenantWorkspaceSecret"] ?? configuration["Xendit:CallbackToken"];
            var providedSecret = httpContext.Request.Headers["X-Webhook-Token"].ToString();

            var hasValidWebhookSecret = !string.IsNullOrWhiteSpace(configuredSecret) &&
                !string.IsNullOrWhiteSpace(providedSecret) &&
                CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(configuredSecret),
                    Encoding.UTF8.GetBytes(providedSecret));

            if (!isAuthenticated && !hasValidWebhookSecret)
            {
                return Results.Unauthorized();
            }

            Console.WriteLine($"[Webhook] Received tenant workspace event: {payload.EventType} for tenant {payload.TenantId}");
            var success = await sender.Send(new ProcessTenantWorkspaceWebhookCommand(payload));
            return success ? Results.Ok(new { Success = true }) : Results.BadRequest(new { Message = "Tenant not found or invalid event type" });
        })
        .WithName("ProcessTenantWorkspaceWebhook")
        .WithDescription("Authenticated webhook receiver endpoint for clinic, organization, lab, and pharmacy creation events from the Tenant Workspace.")
        .WithTags("Webhooks");
    }
}

