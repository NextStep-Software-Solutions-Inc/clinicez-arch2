using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Shared.Common;
using MassTransit;
using MediatR;
using System;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Integrations;

/// <summary>Fans a workspace profile change out to the workspace's webhook endpoints.</summary>
public class WorkspaceProfileUpdatedWebhookConsumer(IWebhookDispatcher dispatcher, ISender sender) : IConsumer<WorkspaceProfileUpdatedEvent>
{
    public async Task Consume(ConsumeContext<WorkspaceProfileUpdatedEvent> context)
    {
        var message = context.Message;
        if (!Guid.TryParse(message.TenantId, out var tenantId)) return;

        // The current profile (not the event's version number) is what receivers want to see.
        var profile = await sender.Send(new GetWorkspaceProfileQuery(message.TenantSlug), context.CancellationToken);
        if (profile == null) return;

        await dispatcher.EnqueueAsync(
            tenantId, profile.TenantSlug, IntegrationCatalog.EventWorkspaceProfileUpdated, profile, null, context.CancellationToken);
    }
}

/// <summary>Fans a new facility out to the workspace's webhook endpoints. Never forwards the facility licence.</summary>
public class FacilityCreatedWebhookConsumer(IWebhookDispatcher dispatcher) : IConsumer<FacilityCreatedEvent>
{
    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
        if (!Guid.TryParse(message.TenantId, out var tenantId)) return;

        await dispatcher.EnqueueAsync(
            tenantId,
            message.TenantSlug ?? string.Empty,
            IntegrationCatalog.EventFacilityCreated,
            new
            {
                facilityId = message.ResourceId,
                name = message.Name,
                slug = message.Slug,
                facilityType = message.FacilityType.ToString(),
                planTier = message.PlanTier
            },
            null,
            context.CancellationToken);
    }
}
