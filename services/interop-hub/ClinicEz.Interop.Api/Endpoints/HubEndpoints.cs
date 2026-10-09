using ClinicEz.Interop.Api.Security;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Admin;
using ClinicEz.Interop.Application.Claims;
using ClinicEz.Interop.Application.Directory;
using ClinicEz.Interop.Application.Messaging;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Api.Endpoints;

public static class HubEndpoints
{
    public const string TenantHeader = "X-Hub-Tenant";

    public static void MapHubEndpoints(this WebApplication app, HubOptions options)
    {
        MapHealth(app);
        MapMessaging(app);
        MapKeys(app, options);
        MapDirectory(app, options);
        if (options.IsLocal) MapLocalClaimProxy(app, options);
        else
        {
            MapCellInbox(app);
            MapAdmin(app);
            MapClaims(app);
        }
    }

    private static void MapHealth(WebApplication app)
    {
        app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        app.MapGet("/health/ready", async (HubDbContext db, CancellationToken ct) =>
            await db.Database.CanConnectAsync(ct)
                ? Results.Ok(new { status = "ready" })
                : Results.Json(new { status = "database unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable)).AllowAnonymous();
    }

    private static void MapMessaging(WebApplication app)
    {
        app.MapPost("/v1/messages", async (HttpContext ctx, HubHttpClient.SendRequest request, MessageService messages, CancellationToken ct) =>
        {
            var results = await messages.SendAsync(Principal(ctx), request.Messages, ct);
            return Results.Ok(new HubHttpClient.SendResponse(results));
        });

        app.MapGet("/v1/inbox", async (HttpContext ctx, string? service, int? max, int? waitSeconds, InboxService inbox, CancellationToken ct) =>
        {
            var pulled = await inbox.PullAsync(Principal(ctx), service, max ?? 50, waitSeconds ?? 0, ct);
            return Results.Ok(new HubHttpClient.PullResponse(pulled));
        });

        app.MapPost("/v1/inbox/ack", async (HttpContext ctx, HubHttpClient.AckRequest request, InboxService inbox, CancellationToken ct) =>
        {
            await inbox.AckAsync(Principal(ctx), request.DeliveryIds, false, ct);
            return Results.NoContent();
        });

        app.MapPost("/v1/inbox/nack", async (HttpContext ctx, HubHttpClient.NackRequest request, InboxService inbox, CancellationToken ct) =>
        {
            await inbox.NackAsync(Principal(ctx), request.Items, false, ct);
            return Results.NoContent();
        });
    }

    /// <summary>
    /// <c>GET /v1/keys/{clientId}</c>: the registered public signing key of a hub client, for receivers verifying envelope
    /// signatures. A local hub answers for its own clients and asks the cloud hub for everyone else (cloud clients' messages arrive
    /// through the cell inbox with their original signature).
    /// </summary>
    private static void MapKeys(WebApplication app, HubOptions options)
    {
        app.MapGet("/v1/keys/{clientId}", async (string clientId, ClientKeyDirectory keys, IUpstreamHub upstream, CancellationToken ct) =>
        {
            var key = await keys.GetAsync(clientId, ct);
            if (key is not null) return Results.Ok(new HubSignerKey(key.ClientId, key.CellId, key.Service, key.Kind, key.PublicKeyPem, key.Revoked));

            if (!options.UpstreamActive) return Results.NotFound();
            try
            {
                var response = await upstream.ForwardAsync(HttpMethod.Get, $"v1/keys/{Uri.EscapeDataString(clientId)}", null, ct);
                return Results.Content(response.Body, "application/json", statusCode: response.StatusCode);
            }
            catch (HttpRequestException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status502BadGateway, detail: $"The cloud hub is unreachable, so the key of '{clientId}' cannot be looked up. ({ex.Message})");
            }
        });
    }

    private static void MapCellInbox(WebApplication app)
    {
        app.MapGet("/v1/cell-inbox", async (HttpContext ctx, int? max, int? waitSeconds, InboxService inbox, CancellationToken ct) =>
        {
            var pulled = await inbox.PullCellInboxAsync(Principal(ctx), max ?? 50, waitSeconds ?? 0, ct);
            return Results.Ok(new HubHttpClient.PullResponse(pulled));
        });

        app.MapPost("/v1/cell-inbox/ack", async (HttpContext ctx, HubHttpClient.AckRequest request, InboxService inbox, CancellationToken ct) =>
        {
            await inbox.AckAsync(Principal(ctx), request.DeliveryIds, true, ct);
            return Results.NoContent();
        });

        app.MapPost("/v1/cell-inbox/nack", async (HttpContext ctx, HubHttpClient.NackRequest request, InboxService inbox, CancellationToken ct) =>
        {
            await inbox.NackAsync(Principal(ctx), request.Items, true, ct);
            return Results.NoContent();
        });
    }

    private static void MapDirectory(WebApplication app, HubOptions options)
    {
        app.MapGet("/v1/directory/facilities", async (HttpContext ctx, string? type, string? q, string? city, string? tenantId, DirectoryService directory, CancellationToken ct) =>
        {
            FacilityType? facilityType = null;
            if (!string.IsNullOrWhiteSpace(type))
            {
                if (!char.IsLetter(type[0]) || !Enum.TryParse<FacilityType>(type, true, out var parsed)) throw HubRequestException.BadRequest($"Unknown facility type '{type}'.");
                facilityType = parsed;
            }

            var tenant = ctx.Request.Headers[TenantHeader].FirstOrDefault() ?? tenantId;
            return Results.Ok(await directory.ListAsync(Principal(ctx), tenant, facilityType, q, city, ct));
        });

        if (options.IsLocal) return;

        app.MapGet("/v1/directory/snapshot", async (HttpContext ctx, long? sinceVersion, DirectoryService directory, CancellationToken ct) =>
            Results.Ok(await directory.GetSnapshotAsync(Principal(ctx), sinceVersion ?? 0, ct)));
    }

    private static void MapAdmin(WebApplication app)
    {
        var admin = app.MapGroup("/v1/admin").RequireAuthorization(HubClientAuthenticationHandler.ControlPlanePolicy);

        admin.MapPut("/cells/{cellId}", async (string cellId, DirectoryCellUpsertedPayload cell, AdminService service, CancellationToken ct) =>
        {
            await service.UpsertCellAsync(cellId, cell, ct);
            return Results.NoContent();
        });

        admin.MapPost("/cells/{cellId}/clients", async (string cellId, CreateHubClientRequest request, AdminService service, CancellationToken ct) =>
            Results.Json(await service.CreateClientAsync(cellId, request, ct), InteropJson.Options, statusCode: StatusCodes.Status201Created));

        admin.MapPost("/clients/{clientId}/rotate", async (string clientId, AdminService service, CancellationToken ct) =>
            Results.Ok(await service.RotateClientAsync(clientId, ct)));

        admin.MapDelete("/clients/{clientId}", async (string clientId, AdminService service, CancellationToken ct) =>
        {
            await service.RevokeClientAsync(clientId, ct);
            return Results.NoContent();
        });
    }

    private static void MapClaims(WebApplication app)
    {
        app.MapPost("/v1/claims", async (HttpContext ctx, CreateClaimRequest request, ClaimService claims, CancellationToken ct) =>
            Results.Json(await claims.CreateAsync(Principal(ctx), request, ct), InteropJson.Options, statusCode: StatusCodes.Status201Created));

        app.MapPost("/v1/claims/{token}/redeem", async (HttpContext ctx, string token, RedeemClaimRequest request, ClaimService claims, CancellationToken ct) =>
            Results.Ok(await claims.RedeemAsync(Principal(ctx), token, request, ct)));
    }

    /// <summary>
    /// Local mode: claims live at the cloud hub, so these calls are proxied with the local hub's upstream credentials
    /// (the cloud validates that the sending/redeeming facility belongs to this edge cell). They need the internet.
    /// </summary>
    private static void MapLocalClaimProxy(WebApplication app, HubOptions options)
    {
        if (!options.Upstream.Enabled)
        {
            const string detail = "upstream_disabled: this edge hub runs without an upstream connection (Hub:Upstream:Enabled=false); claims live at the cloud hub.";
            app.MapPost("/v1/claims", () => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: detail));
            app.MapPost("/v1/claims/{token}/redeem", (string token) => Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: detail));
            return;
        }

        app.MapPost("/v1/claims", async (HttpContext ctx, IUpstreamHub upstream, EnvelopeSignatureVerifier signatures, CancellationToken ct) =>
        {
            // Verify the facility's own signature here; the upstream client then re-signs the envelope as this edge cell.
            var body = await ReadBodyAsync(ctx, ct);
            var request = System.Text.Json.JsonSerializer.Deserialize<CreateClaimRequest>(body, InteropJson.Options);
            if (request?.Envelope is null) throw HubRequestException.BadRequest("Envelope is required.");
            var error = await signatures.VerifyAsync(Principal(ctx), request.Envelope, ct);
            if (error is not null) throw HubRequestException.Forbidden(error);
            return await ProxyAsync(upstream, "v1/claims", body, ct);
        });
        app.MapPost("/v1/claims/{token}/redeem", async (HttpContext ctx, string token, IUpstreamHub upstream, CancellationToken ct) =>
            await ProxyAsync(upstream, $"v1/claims/{Uri.EscapeDataString(token)}/redeem", await ReadBodyAsync(ctx, ct), ct));
    }

    private static async Task<string> ReadBodyAsync(HttpContext ctx, CancellationToken ct)
    {
        using var reader = new StreamReader(ctx.Request.Body);
        return await reader.ReadToEndAsync(ct);
    }

    private static async Task<IResult> ProxyAsync(IUpstreamHub upstream, string path, string body, CancellationToken ct)
    {
        try
        {
            var response = await upstream.ForwardAsync(HttpMethod.Post, path, body, ct);
            return Results.Content(response.Body, "application/json", statusCode: response.StatusCode);
        }
        catch (HttpRequestException ex)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status502BadGateway,
                detail: $"The cloud hub is unreachable; claims need an internet connection. ({ex.Message})");
        }
    }

    private static Application.Security.HubPrincipal Principal(HttpContext ctx) => HubClientAuthenticationHandler.ToHubPrincipal(ctx.User);
}
