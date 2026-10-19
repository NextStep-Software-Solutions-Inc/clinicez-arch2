using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>Body of POST /tenants/{slug}/integrations/api-keys.</summary>
public record CreateApiKeyRequest(string Name, List<string>? Scopes);

/// <summary>Body of POST /tenants/{slug}/integrations/webhooks.</summary>
public record CreateWebhookEndpointRequest(string Url, string? Description, List<string>? Events);

/// <summary>Body of PUT /tenants/{slug}/integrations/webhooks/{id}. The whole endpoint is replaced (the secret is not).</summary>
public record UpdateWebhookEndpointRequest(string Url, string? Description, List<string>? Events, bool IsActive);

/// <summary>Workspace Owner/Admin management of API keys and outbound webhooks.</summary>
public class TenantIntegrationEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tenants/{tenantSlug}/integrations")
            .RequireAuthorization()
            .WithTags("Workspace Integrations");

        group.MapGet("", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            return Results.Ok(await sender.Send(new GetIntegrationsQuery(denied.Access!.Tenant.TenantSlug), ct));
        })
        .WithName("GetWorkspaceIntegrations")
        .WithDescription("API keys (never their secret) and webhook endpoints (never their signing secret) of the workspace.");

        group.MapPost("/api-keys", async (
            string tenantSlug,
            CreateApiKeyRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var created = await sender.Send(new CreateApiKeyCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                body.Name,
                body.Scopes), ct);

            return Results.Ok(created);
        })
        .WithName("CreateWorkspaceApiKey")
        .WithDescription("Creates a read-only API key. The plain key is in this response only and cannot be retrieved again.");

        group.MapDelete("/api-keys/{apiKeyId:guid}", async (
            string tenantSlug,
            Guid apiKeyId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            await sender.Send(new RevokeApiKeyCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                apiKeyId), ct);

            return Results.NoContent();
        })
        .WithName("RevokeWorkspaceApiKey")
        .WithDescription("Revokes an API key immediately. The key stays listed as revoked.");

        group.MapPost("/webhooks", async (
            string tenantSlug,
            CreateWebhookEndpointRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var created = await sender.Send(new CreateWebhookEndpointCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                body.Url,
                body.Description,
                body.Events), ct);

            return Results.Ok(created);
        })
        .WithName("CreateWorkspaceWebhook")
        .WithDescription("Registers an https webhook endpoint. The signing secret is in this response only.");

        group.MapPut("/webhooks/{endpointId:guid}", async (
            string tenantSlug,
            Guid endpointId,
            UpdateWebhookEndpointRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var updated = await sender.Send(new UpdateWebhookEndpointCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                endpointId,
                body.Url,
                body.Description,
                body.Events,
                body.IsActive), ct);

            return Results.Ok(updated);
        })
        .WithName("UpdateWorkspaceWebhook")
        .WithDescription("Replaces a webhook endpoint's URL, description, subscribed events and enabled flag.");

        group.MapDelete("/webhooks/{endpointId:guid}", async (
            string tenantSlug,
            Guid endpointId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            await sender.Send(new DeleteWebhookEndpointCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                endpointId), ct);

            return Results.NoContent();
        })
        .WithName("DeleteWorkspaceWebhook")
        .WithDescription("Removes a webhook endpoint, its signing secret and its delivery log.");

        group.MapPost("/webhooks/{endpointId:guid}/test", async (
            string tenantSlug,
            Guid endpointId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            await sender.Send(new SendTestWebhookCommand(denied.Access!.Tenant.TenantSlug, endpointId), ct);
            return Results.Accepted();
        })
        .WithName("SendWorkspaceWebhookTest")
        .WithDescription("Queues a webhook.ping event to this endpoint. It is delivered by the next delivery run (about a minute).");

        group.MapGet("/webhooks/{endpointId:guid}/deliveries", async (
            string tenantSlug,
            Guid endpointId,
            int? take,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            return Results.Ok(await sender.Send(new GetWebhookDeliveriesQuery(denied.Access!.Tenant.TenantSlug, endpointId, take ?? 25), ct));
        })
        .WithName("GetWorkspaceWebhookDeliveries")
        .WithDescription("Most recent deliveries (newest first) of a webhook endpoint, kept for 30 days.");
    }
}
