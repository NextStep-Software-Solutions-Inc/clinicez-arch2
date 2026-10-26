using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Net;

namespace ClinicEz.Portal.Application.Features.Hub;

/// <summary>
/// One hub client's credentials. The secret and the envelope signing key (<c>Messaging:SigningKey</c>, base64 of a PEM
/// ECDSA P-256 private key) are shown once; the hub keeps only a hash and the public key.
/// </summary>
public sealed record HubClientSecret(string ClientId, string ClientSecret, string? SigningKey);

/// <summary>
/// What an on-premise workspace needs to join the cloud hub: the hub address, the upstream client its local hub uses to
/// reach the cloud hub (<c>Messaging:ClientId/ClientSecret</c> of the local hub), and one client per facility service
/// running on site (keyed by service name: clinic, laboratory, pharmacy, organization, billing).
/// </summary>
public sealed record HubEdgeCredentials(
    string HubUrl,
    HubClientSecret? Upstream,
    IReadOnlyDictionary<string, HubClientSecret> Services);

/// <summary>The result of rotating a single hub client.</summary>
public sealed record HubRotatedCredentials(string HubUrl, string Service, string ClientId, string ClientSecret, string? SigningKey);

/// <summary>Names of the clients an edge cell gets.</summary>
public static class EdgeHubServices
{
    /// <summary>The client the local hub uses to talk upstream to the cloud hub.</summary>
    public const string Upstream = "cell";

    /// <summary>Every client an on-premise workspace is issued, upstream first.</summary>
    public static readonly IReadOnlyList<string> All =
    [
        Upstream,
        InteropServices.Clinic,
        InteropServices.Laboratory,
        InteropServices.Pharmacy,
        InteropServices.Organization,
        InteropServices.Billing,
        InteropServices.Comms
    ];

    public static bool IsKnown(string service) => All.Contains(service, StringComparer.Ordinal);
}

/// <summary>
/// Onboards on-premise workspaces to the cloud hub through the hub admin API (portal-api acts as a ControlPlane
/// client). Cloud facilities need nothing here: clients of the shared cloud cell are provisioned by operations.
/// </summary>
public interface IHubOnboardingService
{
    /// <summary>
    /// Upserts the workspace's edge cell and issues every client it is still missing (the upstream client and one per
    /// facility service). Returns null when the facility is a cloud facility or the workspace already holds all clients,
    /// because the hub never reveals an existing secret.
    /// </summary>
    Task<HubEdgeCredentials?> OnboardAsync(Facility facility, Tenant tenant, CancellationToken cancellationToken);

    /// <summary>
    /// Replaces the secret of one client (the old one stops working); <paramref name="service"/> defaults to the
    /// facility's own service. A client that does not exist yet is created instead.
    /// </summary>
    Task<HubRotatedCredentials> RotateAsync(Facility facility, Tenant tenant, string? service, CancellationToken cancellationToken);

    /// <summary>
    /// Revokes the hub clients a deactivated or deleted on-premise facility no longer needs: its service client once no
    /// other live facility of that type remains on site, and every client once no on-premise facility remains.
    /// </summary>
    /// <param name="leftEdgeCell">True when the facility has just moved from on-premise to the cloud and so no longer reports as on-premise.</param>
    Task RevokeForFacilityAsync(Facility facility, CancellationToken cancellationToken, bool leftEdgeCell = false);

    /// <summary>Revokes every hub client of the workspace (archived workspace, lapsed subscription).</summary>
    Task RevokeWorkspaceAsync(Guid tenantId, CancellationToken cancellationToken);
}

public sealed class HubOnboardingService(
    IHubAdminClient hubAdmin,
    IApplicationDbContext context,
    IOptions<HubOptions> options,
    ILogger<HubOnboardingService> logger) : IHubOnboardingService
{
    public async Task<HubEdgeCredentials?> OnboardAsync(Facility facility, Tenant tenant, CancellationToken cancellationToken)
    {
        if (!FacilityCells.RequiresHubClient(facility)) return null;

        var hubUrl = RequirePublicUrl();
        await hubAdmin.UpsertCellAsync(DirectoryPayloads.EdgeCell(tenant), cancellationToken);

        var existing = await context.EdgeHubClients
            .Where(c => c.TenantId == tenant.Id)
            .ToListAsync(cancellationToken);

        var issued = new Dictionary<string, HubClientSecret>(StringComparer.Ordinal);
        foreach (var service in EdgeHubServices.All.Where(s => existing.All(c => c.Service != s)))
        {
            issued[service] = await CreateClientAsync(tenant.Id, service, cancellationToken);
        }

        await LinkFacilityClientAsync(facility, cancellationToken);

        if (issued.Count == 0) return null;

        issued.Remove(EdgeHubServices.Upstream, out var upstream);
        return new HubEdgeCredentials(hubUrl, upstream, issued);
    }

    public async Task<HubRotatedCredentials> RotateAsync(Facility facility, Tenant tenant, string? service, CancellationToken cancellationToken)
    {
        if (!FacilityCells.RequiresHubClient(facility))
        {
            throw new InvalidOperationException("Only on-premise facilities have hub credentials. Cloud facilities are provisioned by operations.");
        }

        var target = string.IsNullOrWhiteSpace(service) ? InteropServices.ForFacilityType(facility.FacilityType) : service.Trim().ToLowerInvariant();
        if (!EdgeHubServices.IsKnown(target))
        {
            throw new InvalidOperationException($"Unknown hub client '{target}'. Use one of: {string.Join(", ", EdgeHubServices.All)}.");
        }

        var hubUrl = RequirePublicUrl();
        var record = await context.EdgeHubClients.FirstOrDefaultAsync(c => c.TenantId == tenant.Id && c.Service == target, cancellationToken);

        HubClientSecret secret;
        if (record is null)
        {
            await hubAdmin.UpsertCellAsync(DirectoryPayloads.EdgeCell(tenant), cancellationToken);
            secret = await CreateClientAsync(tenant.Id, target, cancellationToken);
        }
        else
        {
            var rotated = await hubAdmin.RotateClientAsync(record.ClientId, cancellationToken);
            logger.LogInformation("Rotated hub client {ClientId} ({Service}) of workspace {TenantId}.", rotated.ClientId, target, tenant.Id);
            secret = new HubClientSecret(rotated.ClientId, rotated.ClientSecret, rotated.SigningKey);
        }

        await LinkFacilityClientAsync(facility, cancellationToken);
        return new HubRotatedCredentials(hubUrl, target, secret.ClientId, secret.ClientSecret, secret.SigningKey);
    }

    public async Task RevokeForFacilityAsync(Facility facility, CancellationToken cancellationToken, bool leftEdgeCell = false)
    {
        if (!leftEdgeCell && !FacilityCells.RequiresHubClient(facility)) return;

        var siblings = await context.Facilities
            .AsNoTracking()
            .Where(f => f.TenantId == facility.TenantId && f.Id != facility.Id && f.DeploymentMode == FacilityDeploymentMode.OnPremise)
            .ToListAsync(cancellationToken);
        var live = siblings.Where(FacilityCells.IsRoutable).ToList();

        var clients = await context.EdgeHubClients.Where(c => c.TenantId == facility.TenantId).ToListAsync(cancellationToken);

        var ownService = InteropServices.ForFacilityType(facility.FacilityType);
        var toRevoke = live.Count == 0
            ? clients
            : live.Any(f => f.FacilityType == facility.FacilityType)
                ? []
                : clients.Where(c => c.Service == ownService).ToList();

        await RevokeAsync(toRevoke, cancellationToken);
    }

    public async Task RevokeWorkspaceAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var clients = await context.EdgeHubClients.Where(c => c.TenantId == tenantId).ToListAsync(cancellationToken);
        await RevokeAsync(clients, cancellationToken);
    }

    private async Task RevokeAsync(IReadOnlyCollection<EdgeHubClient> clients, CancellationToken cancellationToken)
    {
        if (clients.Count == 0) return;

        var revokedIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var client in clients)
        {
            try
            {
                await hubAdmin.RevokeClientAsync(client.ClientId, cancellationToken);
            }
            catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
            {
                logger.LogInformation("Hub client {ClientId} ({Service}) was already gone from the hub.", client.ClientId, client.Service);
            }
            catch (HttpRequestException ex)
            {
                // The facility is already unroutable through the directory; the row stays so a later revoke retries it.
                logger.LogError(ex, "Could not revoke hub client {ClientId} ({Service}) of workspace {TenantId}.", client.ClientId, client.Service, client.TenantId);
                continue;
            }

            context.EdgeHubClients.Remove(client);
            revokedIds.Add(client.ClientId);
            logger.LogInformation("Revoked hub client {ClientId} ({Service}) of workspace {TenantId}.", client.ClientId, client.Service, client.TenantId);
        }

        var facilities = await context.Facilities
            .Where(f => f.HubClientId != null && revokedIds.Contains(f.HubClientId))
            .ToListAsync(cancellationToken);
        foreach (var facility in facilities)
        {
            facility.HubClientId = null;
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task<HubClientSecret> CreateClientAsync(Guid tenantId, string service, CancellationToken cancellationToken)
    {
        var cellId = FacilityCells.EdgeCellId(tenantId);
        var created = await hubAdmin.CreateClientAsync(cellId, new CreateHubClientRequest(service, HubClientKind.EdgeCell), cancellationToken);

        context.EdgeHubClients.Add(new EdgeHubClient
        {
            TenantId = tenantId,
            CellId = cellId,
            Service = service,
            ClientId = created.ClientId
        });
        await context.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Created hub client {ClientId} ({Service}) in cell {CellId}.", created.ClientId, service, cellId);
        return new HubClientSecret(created.ClientId, created.ClientSecret, created.SigningKey);
    }

    private async Task LinkFacilityClientAsync(Facility facility, CancellationToken cancellationToken)
    {
        var service = InteropServices.ForFacilityType(facility.FacilityType);
        var clientId = await context.EdgeHubClients
            .Where(c => c.TenantId == facility.TenantId && c.Service == service)
            .Select(c => c.ClientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (clientId is null || facility.HubClientId == clientId) return;

        facility.HubClientId = clientId;
        await context.SaveChangesAsync(cancellationToken);
    }

    private string RequirePublicUrl()
    {
        var url = options.Value.PublicUrl;
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("Hub:PublicUrl is not configured; on-premise sites cannot be told where the cloud hub is.");
        }

        return url.Trim().TrimEnd('/');
    }
}
