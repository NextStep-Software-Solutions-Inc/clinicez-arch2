using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Coordinates per-binding exclusive execution locks (preventing concurrent backfill/pull collisions)
/// and runs the indefinite Auto-Sync background poller against `_v1_sync.changelog` with
/// overnight PH backoff so Neon can still scale to zero during off-hours.
/// </summary>
public sealed class SyncCoordinator
{
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _bindingLocks = new();
    private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _activeRunCts = new();
    private readonly SyncLedgerRepository _ledger;
    private readonly Track1ClinicSyncEngine _track1;
    private readonly Track2PatientSyncEngine _track2;
    private readonly Track3StorageSyncEngine? _track3;
    private readonly SyncConnectionFactory? _connections;
    private readonly IHostApplicationLifetime? _hostLifetime;
    private readonly ILogger<SyncCoordinator> _logger;

    public SyncCoordinator(
        SyncLedgerRepository ledger,
        Track1ClinicSyncEngine track1,
        Track2PatientSyncEngine track2,
        ILogger<SyncCoordinator> logger,
        Track3StorageSyncEngine? track3 = null,
        SyncConnectionFactory? connections = null,
        IHostApplicationLifetime? hostLifetime = null)
    {
        _ledger = ledger;
        _track1 = track1;
        _track2 = track2;
        _logger = logger;
        _track3 = track3;
        _connections = connections;
        _hostLifetime = hostLifetime;
    }

    private Track3StorageSyncEngine RequireTrack3() =>
        _track3 ?? throw new InvalidOperationException("Track 3 Storage Sync Engine is not configured.");

    public async Task<SyncRunRecord> ExecuteAsync(
        Guid bindingId,
        string mode,
        int? sampleLimit,
        bool forceV1OnConflict,
        string triggeredBy,
        CancellationToken ct,
        int? batchSize = null,
        RunSyncRequest? request = null,
        bool requeueFailed = false,
        bool includeAuthSkipped = false)
    {
        var binding = await _ledger.GetBindingAsync(bindingId, ct)
            ?? throw new KeyNotFoundException($"Sync binding '{bindingId}' was not found.");

        if (binding.IsFrozen && !string.Equals(mode, SyncRunMode.DryRun, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Binding '{binding.Name}' is manually frozen (decommissioned). Unfreeze explicitly before running write operations.");
        }

        if (binding.Track == SyncTrack.Track3Storage)
        {
            await RequireTrack3().EnsurePrerequisitesMetAsync(binding, request?.TargetPlaneFilter, ct);
        }

        await using var lockHandle = await AcquireBindingExecutionLockAsync(
            bindingId, binding.Name, TimeSpan.FromSeconds(2), ct);

        if (binding.Track == SyncTrack.Track3Storage && requeueFailed)
        {
            await _ledger.RequeueFailedStorageObjectsAsync(
                bindingId, includeAuthSkipped, request?.TargetPlaneFilter, request?.ProviderFilter, ct);
        }

        using var runCts = _hostLifetime is not null
            ? CancellationTokenSource.CreateLinkedTokenSource(ct, _hostLifetime.ApplicationStopping)
            : CancellationTokenSource.CreateLinkedTokenSource(ct);
        _activeRunCts[bindingId] = runCts;

        try
        {
            return binding.Track switch
            {
                SyncTrack.Track1Clinic => await _track1.RunAsync(binding, mode, sampleLimit, forceV1OnConflict, triggeredBy, runCts.Token, batchSizeOverride: batchSize),
                SyncTrack.Track2Patient => await _track2.RunAsync(binding, mode, sampleLimit, forceV1OnConflict, triggeredBy, runCts.Token, batchSizeOverride: batchSize),
                SyncTrack.Track3Storage => await RequireTrack3().RunAsync(binding, mode, sampleLimit, triggeredBy, runCts.Token, batchSizeOverride: batchSize, request: request),
                _ => throw new InvalidOperationException($"Unsupported track '{binding.Track}'.")
            };
        }
        finally
        {
            _activeRunCts.TryRemove(new KeyValuePair<Guid, CancellationTokenSource>(bindingId, runCts));
        }
    }

    /// <summary>
    /// Dispatches a manual import / preview run in the background and returns the RUNNING record immediately
    /// so the UI can display live stage transitions and incremental batch counters without holding an HTTP request open.
    /// </summary>
    public async Task<SyncRunRecord> StartBackgroundImportAsync(
        Guid bindingId,
        string mode,
        int? sampleLimit,
        bool forceV1OnConflict,
        int? batchSize,
        string triggeredBy,
        CancellationToken ct,
        RunSyncRequest? request = null,
        bool requeueFailed = false,
        bool includeAuthSkipped = false)
    {
        var binding = await _ledger.GetBindingAsync(bindingId, ct)
            ?? throw new KeyNotFoundException($"Sync binding '{bindingId}' was not found.");

        if (binding.IsFrozen && !string.Equals(mode, SyncRunMode.DryRun, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Binding '{binding.Name}' is manually frozen (decommissioned). Unfreeze explicitly before running write operations.");
        }

        if (binding.Track == SyncTrack.Track3Storage)
        {
            await RequireTrack3().EnsurePrerequisitesMetAsync(binding, request?.TargetPlaneFilter, ct);
        }

        var lockHandle = await AcquireBindingExecutionLockAsync(
            bindingId, binding.Name, TimeSpan.FromSeconds(2), ct);

        if (binding.Track == SyncTrack.Track3Storage && requeueFailed)
        {
            try
            {
                await _ledger.RequeueFailedStorageObjectsAsync(
                    bindingId, includeAuthSkipped, request?.TargetPlaneFilter, request?.ProviderFilter, ct);
            }
            catch
            {
                await lockHandle.DisposeAsync();
                throw;
            }
        }

        Guid runId;
        var effectiveBatch = Math.Clamp(batchSize ?? binding.BatchSize, 10, 1000);
        var initialSummary = new SyncRunSummary
        {
            Track = binding.Track,
            Mode = mode,
            SampleLimit = sampleLimit,
            BatchSize = effectiveBatch,
            CurrentStage = binding.Track == SyncTrack.Track3Storage ? "Inventory & Plan" : "Preparing cohort...",
            StageIndex = 0,
            TotalStages = binding.Track switch
            {
                SyncTrack.Track1Clinic => 9,
                SyncTrack.Track3Storage => 4,
                _ => (binding.V1ClinicId.HasValue && binding.V2ClinicId.HasValue ? 3 : 2)
            },
            PercentComplete = 0,
            LastProgressAtUtc = DateTimeOffset.UtcNow,
            BytesDownloaded = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            BytesUploaded = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            TransferRateMbps = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            ClinicCopiesMigrated = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            PatientCopiesMigrated = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            SkippedCount = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            FailedCount = binding.Track == SyncTrack.Track3Storage ? 0 : null,
            OverlapSavedDownloads = binding.Track == SyncTrack.Track3Storage ? 0 : null
        };

        try
        {
            runId = await _ledger.StartRunAsync(binding.Id, mode, sampleLimit, triggeredBy, ct, initialSummary);
        }
        catch
        {
            await lockHandle.DisposeAsync();
            throw;
        }

        var initialRun = await _ledger.GetRunAsync(runId, ct)
            ?? throw new InvalidOperationException("Failed to read newly created sync run.");

        var runCts = _hostLifetime is not null
            ? CancellationTokenSource.CreateLinkedTokenSource(_hostLifetime.ApplicationStopping)
            : new CancellationTokenSource();
        _activeRunCts[bindingId] = runCts;

        _ = Task.Run(async () =>
        {
            try
            {
                if (binding.Track == SyncTrack.Track1Clinic)
                {
                    await _track1.RunAsync(binding, mode, sampleLimit, forceV1OnConflict, triggeredBy, runCts.Token, existingRunId: runId, batchSizeOverride: effectiveBatch);
                }
                else if (binding.Track == SyncTrack.Track2Patient)
                {
                    await _track2.RunAsync(binding, mode, sampleLimit, forceV1OnConflict, triggeredBy, runCts.Token, existingRunId: runId, batchSizeOverride: effectiveBatch);
                }
                else if (binding.Track == SyncTrack.Track3Storage)
                {
                    await RequireTrack3().RunAsync(binding, mode, sampleLimit, triggeredBy, runCts.Token, existingRunId: runId, batchSizeOverride: effectiveBatch, request: request);
                }
            }
            catch (OperationCanceledException) when (runCts.IsCancellationRequested)
            {
                _logger.LogInformation("Background {Mode} run {RunId} for binding {BindingId} cancelled.", mode, runId, bindingId);
            }
            catch (ObjectDisposedException) when (_hostLifetime?.ApplicationStopping.IsCancellationRequested == true)
            {
                // Host shutdown disposed DB pool while background run was tearing down
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background {Mode} run {RunId} for binding {BindingId} ended with error.", mode, runId, bindingId);
            }
            finally
            {
                _activeRunCts.TryRemove(new KeyValuePair<Guid, CancellationTokenSource>(bindingId, runCts));
                runCts.Dispose();
                await lockHandle.DisposeAsync();
            }
        });

        return initialRun;
    }

    /// <summary>
    /// Manual-only decommission freeze (R4). Cancels any active in-flight run for the binding,
    /// acquires the binding lock + Postgres advisory lock, and marks `is_frozen = TRUE`.
    /// </summary>
    public async Task<SyncBinding?> FreezeBindingAsync(
        Guid bindingId,
        string actor,
        string? reason,
        CancellationToken ct)
    {
        var binding = await _ledger.GetBindingAsync(bindingId, ct);
        if (binding is null) return null;

        if (_activeRunCts.TryGetValue(bindingId, out var activeCts))
        {
            try
            {
                activeCts.Cancel();
            }
            catch (ObjectDisposedException)
            {
                // Run already finished disposing its CTS
            }
        }

        await using var lockHandle = await AcquireBindingExecutionLockAsync(
            bindingId, binding.Name, TimeSpan.FromSeconds(15), ct);

        return await _ledger.FreezeBindingAsync(bindingId, actor, reason, ct);
    }

    public async Task<ResolveConflictResponse?> ResolveConflictAsync(
        Guid conflictId,
        string resolution,
        string actor,
        CancellationToken ct)
    {
        var meta = await _ledger.GetConflictWithHashesAsync(conflictId, ct);
        if (meta is null) return null;

        var conflict = meta.Conflict;
        if (!string.Equals(conflict.Status, SyncConflictStatus.Open, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Conflict '{conflictId}' is already resolved ({conflict.Status}).");
        }

        var normalized = resolution.Trim().ToUpperInvariant();
        switch (normalized)
        {
            case "IGNORE":
            {
                var updated = await _ledger.ResolveConflictStatusAsync(
                    conflictId, SyncConflictStatus.ResolvedIgnore, actor, ct: ct);
                return updated is null
                    ? null
                    : new ResolveConflictResponse(updated, Message: "Conflict ignored.");
            }
            case "KEEP_V2":
            {
                var updated = await _ledger.ResolveConflictStatusAsync(
                    conflictId,
                    SyncConflictStatus.ResolvedKeepV2,
                    actor,
                    updateV1Hash: meta.IncomingV1Hash,
                    updateV2ExpectedHash: meta.LiveV2Hash,
                    ct: ct);
                return updated is null
                    ? null
                    : new ResolveConflictResponse(updated, Message: "Kept v2 value and updated row hashes.");
            }
            case "FORCE_V1":
            {
                if (string.Equals(conflict.ConflictType, SyncConflictType.V1SoftDeletedShielded, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        "Cannot FORCE_V1 on a Deletion Shield conflict; v2 clinical records are medico-legally protected.");
                }

                var binding = await _ledger.GetBindingAsync(conflict.BindingId, ct)
                    ?? throw new KeyNotFoundException($"Sync binding '{conflict.BindingId}' was not found.");

                if (binding.IsFrozen)
                {
                    throw new InvalidOperationException(
                        $"Binding '{binding.Name}' is manually frozen (decommissioned). Unfreeze explicitly before forcing v1 writes.");
                }

                await using var lockHandle = await AcquireBindingExecutionLockAsync(
                    binding.Id, binding.Name, TimeSpan.FromSeconds(5), ct);

                var syncRun = binding.Track switch
                {
                    SyncTrack.Track1Clinic => await _track1.ForceSyncEntityAsync(
                        binding, conflict.EntityType, conflict.V1Id, conflict.V2Id, actor, ct),
                    SyncTrack.Track2Patient => await _track2.ForceSyncEntityAsync(
                        binding, conflict.EntityType, conflict.V1Id, conflict.V2Id, actor, ct),
                    _ => throw new InvalidOperationException($"Unsupported track '{binding.Track}'.")
                };

                if (!string.Equals(syncRun.Status, SyncRunStatus.Completed, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        "Cannot FORCE_V1 because the forced sync run did not complete; Deletion Shield preserved the v2 record.");
                }

                var updated = await _ledger.ResolveConflictStatusAsync(
                    conflictId, SyncConflictStatus.ResolvedForceV1, actor, ct: ct);

                return updated is null
                    ? null
                    : new ResolveConflictResponse(
                        Conflict: updated,
                        SyncResult: syncRun,
                        Run: syncRun,
                        Message: "Forced v1 value to v2.");
            }
            default:
                throw new ArgumentException($"Unsupported resolution '{resolution}'.", nameof(resolution));
        }
    }

    private async Task<IAsyncDisposable> AcquireBindingExecutionLockAsync(
        Guid bindingId,
        string bindingName,
        TimeSpan semWaitTimeout,
        CancellationToken ct)
    {
        var sem = _bindingLocks.GetOrAdd(bindingId, _ => new SemaphoreSlim(1, 1));
        if (!await sem.WaitAsync(semWaitTimeout, ct))
        {
            throw new InvalidOperationException($"Binding '{bindingName}' already has a sync run in progress.");
        }

        try
        {
            var advisoryLock = await _ledger.TryAcquireBindingAdvisoryLockAsync(bindingId, ct);
            if (advisoryLock is null)
            {
                sem.Release();
                throw new InvalidOperationException($"Binding '{bindingName}' is currently locked by another sync worker.");
            }

            return new CombinedBindingLockHandle(sem, advisoryLock);
        }
        catch
        {
            if (sem.CurrentCount == 0)
            {
                // Ensure semaphore isn't leaked if TryAcquireBindingAdvisoryLockAsync threw
                try { sem.Release(); } catch (SemaphoreFullException) { }
            }
            throw;
        }
    }

    private sealed class CombinedBindingLockHandle : IAsyncDisposable
    {
        private readonly SemaphoreSlim _sem;
        private readonly IAsyncDisposable _advisoryLock;
        private int _disposed;

        public CombinedBindingLockHandle(SemaphoreSlim sem, IAsyncDisposable advisoryLock)
        {
            _sem = sem;
            _advisoryLock = advisoryLock;
        }

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            try
            {
                await _advisoryLock.DisposeAsync();
            }
            finally
            {
                _sem.Release();
            }
        }
    }

    public async Task<ParityReportResponse> GetParityReportAsync(Guid bindingId, CancellationToken ct)
    {
        var binding = await _ledger.GetBindingAsync(bindingId, ct)
            ?? throw new KeyNotFoundException($"Sync binding '{bindingId}' was not found.");

        return binding.Track switch
        {
            SyncTrack.Track1Clinic => await _track1.BuildParityReportAsync(binding, ct),
            SyncTrack.Track2Patient => await _track2.BuildParityReportAsync(binding, ct),
            SyncTrack.Track3Storage => await RequireTrack3().BuildParityReportAsync(binding, ct),
            _ => throw new InvalidOperationException($"Unsupported track '{binding.Track}'.")
        };
    }

    public async Task PollAutoSyncBindingsAsync(CancellationToken ct)
    {
        var bindings = await _ledger.ListBindingsAsync(ct);
        foreach (var binding in bindings)
        {
            if (ct.IsCancellationRequested) break;
            if (!binding.AutoSyncEnabled || binding.IsFrozen) continue;

            if (_connections is not null)
            {
                if (binding.Track != SyncTrack.Track3Storage && !_connections.HasV1Source)
                {
                    continue;
                }
                if (binding.Track == SyncTrack.Track3Storage && !_connections.HasClinicDb && !_connections.HasPatientDb)
                {
                    continue;
                }
            }

            if (binding.LastPolledAt.HasValue &&
                (DateTimeOffset.UtcNow - binding.LastPolledAt.Value).TotalSeconds < binding.PollIntervalSeconds)
            {
                continue;
            }

            try
            {
                await ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "AutoSyncWorker", ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Auto-sync incremental poll failed for binding {BindingId} ({Track}).", binding.Id, binding.Track);
            }
        }
    }
}

public sealed class V1SyncCdcWorker : BackgroundService
{
    private readonly SyncCoordinator _coordinator;
    private readonly SyncConnectionFactory _connections;
    private readonly IConfiguration _config;
    private readonly ILogger<V1SyncCdcWorker> _logger;
    private readonly SyncRuntimeSettingsService? _runtimeSettings;

    public DateTimeOffset? LastHeartbeatUtc { get; private set; }

    public V1SyncCdcWorker(
        SyncCoordinator coordinator,
        SyncConnectionFactory connections,
        IConfiguration config,
        ILogger<V1SyncCdcWorker> logger,
        SyncRuntimeSettingsService? runtimeSettings = null)
    {
        _coordinator = coordinator;
        _connections = connections;
        _config = config;
        _logger = logger;
        _runtimeSettings = runtimeSettings;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var enabled = _runtimeSettings?.Current.EnableBackgroundWorker
                ?? _config.GetValue("V1Sync:EnableBackgroundWorker", true);

            if (enabled)
            {
                LastHeartbeatUtc = DateTimeOffset.UtcNow;
                try
                {
                    if (_connections.HasSyncLedgerDb && (_connections.HasV1Source || _connections.HasClinicDb || _connections.HasPatientDb))
                    {
                        await _coordinator.PollAutoSyncBindingsAsync(stoppingToken);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error during V1Sync CDC worker loop.");
                }
            }

            var delaySeconds = enabled ? ComputePollDelaySeconds() : 15;
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(delaySeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private int ComputePollDelaySeconds()
    {
        var live = _runtimeSettings?.Current;
        var baseInterval = Math.Clamp(live?.DefaultPollIntervalSeconds ?? _config.GetValue("V1Sync:DefaultPollIntervalSeconds", 30), 10, 600);
        var overnightInterval = Math.Clamp(live?.OvernightPollIntervalSeconds ?? _config.GetValue("V1Sync:OvernightPollIntervalSeconds", 300), 60, 3600);
        var startHour = Math.Clamp(live?.OvernightBackoffStartHourPh ?? _config.GetValue("V1Sync:OvernightBackoffStartHourPh", 22), 0, 23);
        var endHour = Math.Clamp(live?.OvernightBackoffEndHourPh ?? _config.GetValue("V1Sync:OvernightBackoffEndHourPh", 6), 0, 23);

        var phNow = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        var isOvernight = startHour <= endHour
            ? (phNow.Hour >= startHour && phNow.Hour < endHour)
            : (phNow.Hour >= startHour || phNow.Hour < endHour);
        return isOvernight ? overnightInterval : baseInterval;
    }
}
