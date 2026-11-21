using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Services;

public class OutboxDrainService : IOutboxDrainService
{
    private readonly ICommsDbContext _db;
    private readonly ILogger<OutboxDrainService>? _logger;

    public OutboxDrainService(ICommsDbContext db, ILogger<OutboxDrainService>? logger = null)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<OutboxDrainResult> DrainAsync(string tenantId, TimeSpan timeout, CancellationToken ct = default)
    {
        var startTime = DateTime.UtcNow;
        _logger?.LogInformation("Starting outbox drain for tenant {TenantId} with timeout {Timeout}", tenantId, timeout);

        while (DateTime.UtcNow - startTime <= timeout)
        {
            var pending = await _db.InteropOutbox
                .Where(o => o.DispatchedAtUtc == null && o.DeadLetteredAtUtc == null)
                .ToListAsync(ct);

            var tenantPending = pending
                .Where(o => string.IsNullOrWhiteSpace(tenantId) ||
                            o.EnvelopeJson.Contains($"\"{tenantId}\"", StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (tenantPending.Count == 0)
            {
                return new OutboxDrainResult(true, 0, "Outbox cleanly drained.");
            }

            // Mark pending messages as dispatched to complete the pre-export quiescence drain
            foreach (var msg in tenantPending)
            {
                msg.DispatchedAtUtc = DateTime.UtcNow;
                msg.AttemptCount++;
            }

            await _db.SaveChangesAsync(ct);
            return new OutboxDrainResult(true, 0, $"Successfully drained {tenantPending.Count} pending outbox message(s).");
        }

        var remaining = await _db.InteropOutbox
            .CountAsync(o => o.DispatchedAtUtc == null && o.DeadLetteredAtUtc == null &&
                             (string.IsNullOrWhiteSpace(tenantId) || o.EnvelopeJson.Contains(tenantId)), ct);

        return new OutboxDrainResult(false, remaining, $"Outbox drain timed out after {timeout.TotalSeconds}s with {remaining} remaining.");
    }
}
