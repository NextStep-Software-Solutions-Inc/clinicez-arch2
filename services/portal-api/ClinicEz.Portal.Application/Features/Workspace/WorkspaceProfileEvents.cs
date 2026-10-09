using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Announces that the workspace profile changed: every routable facility of the workspace (clinic, laboratory,
/// pharmacy, organization) is told over the hub that its cached profile is stale, and the workspace's webhook
/// endpoints get the new profile.
/// </summary>
public interface IWorkspaceProfilePublisher
{
    /// <summary>
    /// Stages the facility messages and webhook deliveries. Call it AFTER the profile entities are modified
    /// (and the profile version bumped) but BEFORE the <c>SaveChanges</c> that persists them, so the change and
    /// its notifications commit atomically.
    /// </summary>
    Task StageUpdatedAsync(Tenant tenant, WorkspaceSettings settings, CancellationToken cancellationToken);
}

public sealed class WorkspaceProfilePublisher(
    IApplicationDbContext context,
    IInteropPublisher publisher,
    IWebhookDispatcher webhookDispatcher) : IWorkspaceProfilePublisher
{
    public async Task StageUpdatedAsync(Tenant tenant, WorkspaceSettings settings, CancellationToken cancellationToken)
    {
        var facilities = await context.Facilities
            .AsNoTracking()
            .Where(f => f.TenantId == tenant.Id)
            .ToListAsync(cancellationToken);

        foreach (var facility in facilities.Where(FacilityCells.IsRoutable))
        {
            publisher.Enqueue(
                InteropTypes.WorkspaceProfileUpdated,
                Party.Portal,
                Party.ForFacility(tenant.Id.ToString(), facility.Id.ToString(), facility.FacilityType),
                tenant.Id,
                WorkspaceProfileMapper.ToEvent(tenant, settings));
        }

        // Webhook receivers want the profile itself, not just the version number.
        await webhookDispatcher.StageAsync(
            tenant.Id,
            tenant.TenantSlug,
            IntegrationCatalog.EventWorkspaceProfileUpdated,
            WorkspaceProfileMapper.From(tenant, settings),
            cancellationToken);
    }
}
