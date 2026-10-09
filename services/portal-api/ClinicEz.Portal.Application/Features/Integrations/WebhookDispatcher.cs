using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Integrations;

/// <summary>
/// Turns a workspace event into one queued <see cref="WebhookDelivery"/> per subscribed, active endpoint.
/// Sending happens later in a background job, so a slow or dead customer endpoint can never slow down or fail
/// the action that caused the event.
/// </summary>
public interface IWebhookDispatcher
{
    /// <param name="onlyEndpointId">When set, the event goes to that endpoint only and subscriptions are ignored (test events).</param>
    /// <returns>How many deliveries were queued.</returns>
    Task<int> EnqueueAsync(
        Guid tenantId,
        string tenantSlug,
        string eventType,
        object data,
        Guid? onlyEndpointId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Like <see cref="EnqueueAsync"/> but only adds the deliveries to the context; the caller's own
    /// <c>SaveChanges</c> commits them together with the change that caused the event, so an event can
    /// never be lost (or fired for a change that was rolled back).
    /// </summary>
    Task<int> StageAsync(
        Guid tenantId,
        string tenantSlug,
        string eventType,
        object data,
        CancellationToken cancellationToken);
}

public class WebhookDispatcher(IApplicationDbContext context) : IWebhookDispatcher
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<int> EnqueueAsync(
        Guid tenantId,
        string tenantSlug,
        string eventType,
        object data,
        Guid? onlyEndpointId,
        CancellationToken cancellationToken)
    {
        var queued = await StageAsync(tenantId, tenantSlug, eventType, data, onlyEndpointId, cancellationToken);
        if (queued > 0) await context.SaveChangesAsync(cancellationToken);
        return queued;
    }

    public Task<int> StageAsync(
        Guid tenantId,
        string tenantSlug,
        string eventType,
        object data,
        CancellationToken cancellationToken) =>
        StageAsync(tenantId, tenantSlug, eventType, data, null, cancellationToken);

    private async Task<int> StageAsync(
        Guid tenantId,
        string tenantSlug,
        string eventType,
        object data,
        Guid? onlyEndpointId,
        CancellationToken cancellationToken)
    {
        var endpoints = await context.WebhookEndpoints
            .Where(e => e.TenantId == tenantId && e.IsActive && (onlyEndpointId == null || e.Id == onlyEndpointId))
            .ToListAsync(cancellationToken);

        if (onlyEndpointId == null)
        {
            endpoints = endpoints.Where(e => IntegrationCatalog.Split(e.Events).Contains(eventType)).ToList();
        }

        if (endpoints.Count == 0) return 0;

        var now = DateTime.UtcNow;
        var payload = JsonSerializer.Serialize(new
        {
            id = Guid.NewGuid(),
            type = eventType,
            createdAt = now,
            tenantSlug,
            data
        }, Json);

        foreach (var endpoint in endpoints)
        {
            context.WebhookDeliveries.Add(new WebhookDelivery
            {
                TenantId = tenantId,
                EndpointId = endpoint.Id,
                EventType = eventType,
                Payload = payload,
                Status = WebhookDeliveryStatus.Pending,
                NextAttemptAt = now
            });
        }

        return endpoints.Count;
    }
}
