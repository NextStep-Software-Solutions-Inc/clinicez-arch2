using System;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public class TenantWorkspaceWebhookEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/webhooks/tenant-workspace", async (
            TenantWorkspaceWebhookPayload payload,
            ISender sender) =>
        {
            Console.WriteLine($"[Webhook] Received tenant workspace event: {payload.EventType} for tenant {payload.TenantId}");
            var success = await sender.Send(new ProcessTenantWorkspaceWebhookCommand(payload));
            return success ? Results.Ok(new { Success = true }) : Results.BadRequest(new { Message = "Tenant not found or invalid event type" });
        })
        .AllowAnonymous()
        .WithName("ProcessTenantWorkspaceWebhook")
        .WithDescription("Webhook receiver endpoint for clinic, organization, lab, and pharmacy creation events from the Tenant Workspace.")
        .WithTags("Webhooks");
    }
}
