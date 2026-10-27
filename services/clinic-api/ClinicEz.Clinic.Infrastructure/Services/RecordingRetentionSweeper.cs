using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public interface IRecordingRetentionSweeper
{
    Task<int> SweepExpiredRecordingsAsync(CancellationToken ct = default);
}

public sealed class RecordingRetentionSweeper : BackgroundService, IRecordingRetentionSweeper
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RecordingRetentionSweeper> _logger;

    public RecordingRetentionSweeper(
        IServiceProvider serviceProvider,
        ILogger<RecordingRetentionSweeper> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task<int> SweepExpiredRecordingsAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IClinicStorageService>();

        var now = DateTime.UtcNow;

        // Medico-Legal Hold Immunity: Strictly bypasses any recording with IsLegalHold == true
        var expiredSessions = await db.TeleconsultRecordingSessions
            .IgnoreQueryFilters()
            .Include(s => s.Segments)
            .Where(s => !s.IsPurged
                     && !s.IsLegalHold
                     && s.ExpiresAtUtc != null
                     && s.ExpiresAtUtc <= now)
            .Take(50)
            .ToListAsync(ct);

        var purgedCount = 0;

        foreach (var session in expiredSessions)
        {
            // 1. Delete all encrypted segment chunks from sovereign storage
            foreach (var segment in session.Segments)
            {
                if (!string.IsNullOrWhiteSpace(segment.StorageKey))
                {
                    try
                    {
                        await storage.DeleteEncryptedFileAsync(segment.StorageKey, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[RetentionSweeper] Could not delete segment file {Key}", segment.StorageKey);
                    }
                }
            }

            // 2. Delete manifest if present
            if (!string.IsNullOrWhiteSpace(session.ManifestStorageKey))
            {
                try
                {
                    await storage.DeleteEncryptedFileAsync(session.ManifestStorageKey, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[RetentionSweeper] Could not delete manifest file {Key}", session.ManifestStorageKey);
                }
            }

            // 3. Mark purged in database
            session.IsPurged = true;
            session.PurgedAtUtc = DateTime.UtcNow;
            session.PurgedBy = "System.RetentionSweeper";

            // 4. Write immutable WORM audit log
            db.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = session.TenantId,
                ClinicId = session.ClinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "teleconsult.recording.purged",
                ActorName = "System Sweeper",
                ActorRole = "System",
                TargetEntityType = "TeleconsultRecordingSession",
                TargetEntityId = session.Id.ToString(),
                PatientId = session.PatientId,
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Automated retention purge executed for teleconsult recording {session.Id} (retention: {session.RetentionPolicyDays} days, expired at: {session.ExpiresAtUtc:u})",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    session.Id,
                    session.CallId,
                    session.TotalDurationSeconds,
                    session.SegmentCount,
                    session.TotalSizeBytes,
                    session.RetentionPolicyDays
                })
            });

            purgedCount++;
        }

        if (purgedCount > 0)
        {
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("[RetentionSweeper] Purged {Count} expired teleconsult recordings.", purgedCount);
        }

        return purgedCount;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepExpiredRecordingsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[RetentionSweeper] Error occurred during automated recording retention sweep.");
            }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }
}
