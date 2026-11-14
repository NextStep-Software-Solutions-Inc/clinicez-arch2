using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.MediaBroker.Application.Services;

public interface IAbandonedSessionCleanupService
{
    Task<int> CleanupAbandonedSessionsAsync(TimeSpan? ttl = null, CancellationToken ct = default);
}

public sealed class AbandonedSessionCleanupService : IAbandonedSessionCleanupService
{
    private readonly IMediaBrokerDbContext _db;
    private readonly IMediaMeteringService _meteringService;
    private readonly ILiveKitRoomClient _liveKitClient;
    private readonly ILogger<AbandonedSessionCleanupService> _logger;

    public AbandonedSessionCleanupService(
        IMediaBrokerDbContext db,
        IMediaMeteringService meteringService,
        ILiveKitRoomClient liveKitClient,
        ILogger<AbandonedSessionCleanupService> logger)
    {
        _db = db;
        _meteringService = meteringService;
        _liveKitClient = liveKitClient;
        _logger = logger;
    }

    public async Task<int> CleanupAbandonedSessionsAsync(TimeSpan? ttl = null, CancellationToken ct = default)
    {
        var effectiveTtl = ttl ?? TimeSpan.FromHours(2);
        var cutoff = DateTime.UtcNow - effectiveTtl;

        var staleSessions = await _db.CallSessions
            .Where(s => s.Status == "Active" && (s.StartedAtUtc ?? s.RequestedAtUtc) < cutoff)
            .ToListAsync(ct);

        int cleaned = 0;
        foreach (var session in staleSessions)
        {
            var startedAt = session.StartedAtUtc ?? session.RequestedAtUtc;
            var endedAt = startedAt.Add(effectiveTtl);

            _logger.LogWarning("[MediaBroker] Cleaning up abandoned call session {CallId} (started {StartedAt}, cutoff {Cutoff}).",
                session.CallId, startedAt, cutoff);

            await _meteringService.RecordCallEndedAsync(session.CallId, startedAt, endedAt, ct);
            await _liveKitClient.DeleteRoomAsync(session.RoomName, ct);

            _db.AuditLogs.Add(new MediaAuditLog
            {
                TenantId = session.TenantId,
                CallId = session.CallId,
                EventType = "SessionAbandoned",
                Details = $"Abandoned session {session.CallId} timed out after {effectiveTtl.TotalMinutes} mins and was cleaned up.",
                TimestampUtc = DateTime.UtcNow
            });

            cleaned++;
        }

        if (cleaned > 0)
        {
            await _db.SaveChangesAsync(ct);
        }

        return cleaned;
    }
}
