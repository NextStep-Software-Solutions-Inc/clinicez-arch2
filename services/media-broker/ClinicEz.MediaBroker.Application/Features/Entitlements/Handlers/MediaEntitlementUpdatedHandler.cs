using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.MediaBroker.Application.Features.Entitlements.Handlers;

public sealed class MediaEntitlementUpdatedHandler : IInteropHandler<MediaEntitlementUpdatedPayload>
{
    private readonly IMediaBrokerDbContext _db;
    private readonly ILogger<MediaEntitlementUpdatedHandler> _logger;

    public MediaEntitlementUpdatedHandler(
        IMediaBrokerDbContext db,
        ILogger<MediaEntitlementUpdatedHandler> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task HandleAsync(
        MediaEntitlementUpdatedPayload payload,
        InteropMessageContext context,
        CancellationToken ct)
    {
        _logger.LogInformation("[MediaBroker] Ingesting media.entitlement.updated for Tenant {TenantId}: {Minutes} mins, Active: {IsActive}, Version: {Version}",
            payload.TenantId, payload.CallMinutesMonthly, payload.IsActive, payload.Version);

        var existing = await _db.Entitlements
            .FirstOrDefaultAsync(e => e.TenantId == payload.TenantId, ct);

        if (existing == null)
        {
            existing = new TenantMediaEntitlement
            {
                TenantId = payload.TenantId,
                CallMinutesMonthly = payload.CallMinutesMonthly,
                IsActive = payload.IsActive,
                AllowOverdraft = true,
                AllowTransportOnlyFallback = false,
                Version = payload.Version,
                UpdatedAtUtc = payload.UpdatedAtUtc
            };
            _db.Entitlements.Add(existing);
        }
        else
        {
            // Idempotent version check: only update if new version >= current version
            if (payload.Version >= existing.Version)
            {
                existing.CallMinutesMonthly = payload.CallMinutesMonthly;
                existing.IsActive = payload.IsActive;
                existing.Version = payload.Version;
                existing.UpdatedAtUtc = payload.UpdatedAtUtc;
            }
        }

        _db.AuditLogs.Add(new MediaAuditLog
        {
            TenantId = payload.TenantId,
            CallId = Guid.Empty,
            EventType = "EntitlementUpdated",
            Details = $"Entitlement updated: {payload.CallMinutesMonthly} mins, Active: {payload.IsActive}, Version: {payload.Version}",
            TimestampUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("[MediaBroker] Successfully committed entitlement for Tenant {TenantId}.", payload.TenantId);
    }
}
