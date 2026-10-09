using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using MassTransit;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>Announces to facility services (any server) that their cached workspace profile is stale.</summary>
public static class WorkspaceProfileEvents
{
    public static Task PublishUpdatedAsync(
        IPublishEndpoint publishEndpoint,
        Tenant tenant,
        WorkspaceSettings settings,
        CancellationToken cancellationToken) =>
        publishEndpoint.Publish(new WorkspaceProfileUpdatedEvent
        {
            TenantId = tenant.Id.ToString(),
            TenantSlug = tenant.TenantSlug,
            Version = settings.ProfileVersion
        }, cancellationToken);
}
