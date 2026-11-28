using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Services.Storage;

public sealed class Track3StorageSyncEngine
{
    private static readonly SemaphoreSlim[] EntityWriteLocks = Enumerable.Range(0, 1024)
        .Select(_ => new SemaphoreSlim(1, 1))
        .ToArray();

    private static SemaphoreSlim GetEntityWriteLock(string targetPlane, Guid targetEntityId)
    {
        var index = (int)((uint)HashCode.Combine(targetPlane, targetEntityId) % (uint)EntityWriteLocks.Length);
        return EntityWriteLocks[index];
    }

    private readonly SyncConnectionFactory _connections;
    private readonly SyncLedgerRepository _ledger;
    private readonly Track3EnvelopeEncryptor _encryptor;
    private readonly Track3R2ClientPool _r2Pool;
    private readonly LegacyBlobSourceDownloader _downloader;
    private readonly Track3StorageOptions _options;
    private readonly ILogger<Track3StorageSyncEngine> _logger;
    private readonly SyncRuntimeSettingsService? _runtimeSettings;

    public Track3StorageSyncEngine(
        SyncConnectionFactory connections,
        SyncLedgerRepository ledger,
        Track3EnvelopeEncryptor encryptor,
        Track3R2ClientPool r2Pool,
        LegacyBlobSourceDownloader downloader,
        IOptions<Track3StorageOptions> options,
        ILogger<Track3StorageSyncEngine> logger,
        SyncRuntimeSettingsService? runtimeSettings = null)
    {
        _connections = connections;
        _ledger = ledger;
        _encryptor = encryptor;
        _r2Pool = r2Pool;
        _downloader = downloader;
        _options = options.Value;
        _logger = logger;
        _runtimeSettings = runtimeSettings;
    }

    private bool IsStorageEnabled => _runtimeSettings?.Current.StorageEnabled ?? _options.Enabled;
    private int EffectiveMaxConcurrency => _runtimeSettings?.Current.StorageMaxConcurrency ?? _options.MaxConcurrency;
    private double EffectiveVerificationSampleRate => _runtimeSettings?.Current.StorageVerificationSampleRate ?? _options.VerificationSampleRate;

    public async Task<Track3StorageCounts> ProbeStorageCountsAsync(CancellationToken ct = default)
    {
        long clinicPending = 0, clinicTotal = 0, clinicSkipped = 0;
        long patientPending = 0, patientTotal = 0, patientSkipped = 0;

        var skippedClinicIds = Array.Empty<Guid>();
        var skippedPatientIds = Array.Empty<Guid>();
        var skippedClinicAvatarIds = Array.Empty<Guid>();
        var skippedPatientAvatarIds = Array.Empty<Guid>();
        if (_connections.HasSyncLedgerDb)
        {
            try
            {
                (skippedClinicIds, skippedPatientIds, skippedClinicAvatarIds, skippedPatientAvatarIds) =
                    await _ledger.LoadGloballySkippedStorageEntityIdsAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load skipped storage object IDs from sync ledger.");
            }
        }

        if (_connections.HasClinicDb)
        {
            try
            {
                await using var conn = await _connections.OpenClinicDbAsync(ct);
                const string sql = """
                    SELECT COUNT(*),
                           COUNT(*) FILTER (
                               WHERE COALESCE("EncryptionAlgorithm", 'NONE') = 'NONE'
                                 AND NOT ("Id" = ANY(@skippedIds))
                           ),
                           COUNT(*) FILTER (
                               WHERE COALESCE("EncryptionAlgorithm", 'NONE') = 'NONE'
                                 AND "Id" = ANY(@skippedIds)
                           )
                    FROM public."RecordAttachments"
                    WHERE "IsDeleted" = false
                    """;
                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.Add(new NpgsqlParameter("skippedIds", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = skippedClinicIds });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    clinicTotal = r.GetInt64(0);
                    clinicPending = r.GetInt64(1);
                    clinicSkipped = r.GetInt64(2);
                }
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                // RecordAttachments table not yet created
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to probe Clinic RecordAttachments storage counts.");
            }

            try
            {
                await using var conn = await _connections.OpenClinicDbAsync(ct);
                const string avatarSql = """
                    SELECT COUNT(*),
                           COUNT(*) FILTER (
                               WHERE COALESCE("AvatarEncryptionAlgorithm", 'NONE') = 'NONE'
                                 AND NOT ("Id" = ANY(@skippedIds))
                           ),
                           COUNT(*) FILTER (
                               WHERE COALESCE("AvatarEncryptionAlgorithm", 'NONE') = 'NONE'
                                 AND "Id" = ANY(@skippedIds)
                           )
                    FROM public."Patients"
                    WHERE "IsDeleted" = false
                      AND "AvatarUrl" IS NOT NULL
                      AND btrim("AvatarUrl") <> ''
                    """;
                await using var cmd = new NpgsqlCommand(avatarSql, conn);
                cmd.Parameters.Add(new NpgsqlParameter("skippedIds", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = skippedClinicAvatarIds });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    clinicTotal += r.GetInt64(0);
                    clinicPending += r.GetInt64(1);
                    clinicSkipped += r.GetInt64(2);
                }
            }
            catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
            {
                // Patients table or AvatarUrl/AvatarEncryptionAlgorithm columns not yet migrated
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to probe Clinic Patient avatar storage counts.");
            }
        }

        if (_connections.HasPatientDb)
        {
            try
            {
                await using var conn = await _connections.OpenPatientDbAsync(ct);
                const string sql = """
                    SELECT COUNT(*),
                           COUNT(*) FILTER (
                               WHERE COALESCE(encryption_algorithm, 'NONE') = 'NONE'
                                 AND NOT (id = ANY(@skippedIds))
                           ),
                           COUNT(*) FILTER (
                               WHERE COALESCE(encryption_algorithm, 'NONE') = 'NONE'
                                 AND id = ANY(@skippedIds)
                           )
                    FROM public.file_records
                    WHERE is_deleted = false
                    """;
                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.Add(new NpgsqlParameter("skippedIds", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = skippedPatientIds });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    patientTotal = r.GetInt64(0);
                    patientPending = r.GetInt64(1);
                    patientSkipped = r.GetInt64(2);
                }
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                // file_records table not yet created
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to probe Patient file_records storage counts.");
            }

            try
            {
                await using var conn = await _connections.OpenPatientDbAsync(ct);
                const string avatarSql = """
                    SELECT COUNT(*),
                           COUNT(*) FILTER (
                               WHERE COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE'
                                 AND NOT (id = ANY(@skippedIds))
                           ),
                           COUNT(*) FILTER (
                               WHERE COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE'
                                 AND id = ANY(@skippedIds)
                           )
                    FROM public.patients
                    WHERE is_deleted = false
                      AND avatar_url IS NOT NULL
                      AND btrim(avatar_url) <> ''
                    """;
                await using var cmd = new NpgsqlCommand(avatarSql, conn);
                cmd.Parameters.Add(new NpgsqlParameter("skippedIds", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = skippedPatientAvatarIds });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    patientTotal += r.GetInt64(0);
                    patientPending += r.GetInt64(1);
                    patientSkipped += r.GetInt64(2);
                }
            }
            catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
            {
                // patients table or avatar_encryption_algorithm column not yet migrated
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to probe Patient avatar storage counts.");
            }
        }

        return new Track3StorageCounts(
            clinicPending,
            clinicTotal,
            patientPending,
            patientTotal,
            clinicSkipped,
            patientSkipped);
    }

    public async Task EnsurePrerequisitesMetAsync(
        SyncBinding binding,
        string? targetPlaneFilter,
        CancellationToken ct = default)
    {
        var plane = NormalizePlaneFilter(targetPlaneFilter);
        var (clinicTotal, _, _) = await CountClinicScopeAsync(binding, ct);
        var (patientTotal, _, _) = await CountPatientScopeAsync(binding, ct);

        var ok = plane switch
        {
            "CLINIC_ONLY" => clinicTotal > 0,
            "PATIENT_ONLY" => patientTotal > 0,
            _ => clinicTotal > 0 || patientTotal > 0
        };

        if (!ok)
        {
            throw new ArgumentException(
                "File Storage requires Track 1 (Clinic Sync) or Track 2 (Patient Accounts) to import file metadata into scope first.");
        }
    }

    public async Task<SyncRunRecord> RunAsync(
        SyncBinding binding,
        string mode,
        int? sampleLimit,
        string triggeredBy,
        CancellationToken ct,
        Guid? existingRunId = null,
        int? batchSizeOverride = null,
        RunSyncRequest? request = null)
    {
        if (!IsStorageEnabled)
        {
            throw new InvalidOperationException("File storage migration is currently disabled in Migration Settings.");
        }

        await EnsurePrerequisitesMetAsync(binding, request?.TargetPlaneFilter, ct);

        var effectiveBatch = Math.Clamp(batchSizeOverride ?? request?.BatchSize ?? binding.BatchSize, 10, 1000);
        var providerFilter = NormalizeProviderFilter(request?.ProviderFilter);
        var planeFilter = NormalizePlaneFilter(request?.TargetPlaneFilter);
        var maxConcurrency = Math.Clamp(request?.MaxConcurrency ?? EffectiveMaxConcurrency, 1, 16);
        var retryFailedOnly = request?.RetryFailedOnly ?? false;
        var isDryRun = string.Equals(mode, SyncRunMode.DryRun, StringComparison.OrdinalIgnoreCase);
        var isFinalSweep = string.Equals(mode, SyncRunMode.FinalSweep, StringComparison.OrdinalIgnoreCase);

        var summary = new SyncRunSummary
        {
            Track = SyncTrack.Track3Storage,
            Mode = mode,
            SampleLimit = sampleLimit,
            BatchSize = effectiveBatch,
            TotalStages = 4,
            StageIndex = 1,
            CurrentStage = "Inventory & Plan",
            PercentComplete = 0,
            LastProgressAtUtc = DateTimeOffset.UtcNow,
            BytesDownloaded = 0,
            BytesUploaded = 0,
            TransferRateMbps = 0,
            ClinicCopiesMigrated = 0,
            PatientCopiesMigrated = 0,
            SkippedCount = 0,
            FailedCount = 0,
            OverlapSavedDownloads = 0
        };
        var summaryLock = new object();

        var runId = existingRunId ?? await _ledger.StartRunAsync(binding.Id, mode, sampleLimit, triggeredBy, ct, summary);
        var sw = Stopwatch.StartNew();
        long lastProgressFlushMs = -1000;

        async Task FlushProgressAsync(bool force, CancellationToken flushCt)
        {
            var elapsed = sw.ElapsedMilliseconds;
            if (!force && elapsed - Interlocked.Read(ref lastProgressFlushMs) < 300)
            {
                return;
            }
            Interlocked.Exchange(ref lastProgressFlushMs, elapsed);
            SyncRunSummary snap;
            lock (summaryLock)
            {
                summary.DurationMs = elapsed;
                summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
                var secs = Math.Max(0.001, elapsed / 1000.0);
                var totalBytes = (summary.BytesDownloaded ?? 0) + (summary.BytesUploaded ?? 0);
                summary.TransferRateMbps = Math.Round((totalBytes * 8.0) / (secs * 1_000_000.0), 2);
                snap = SnapshotSummary(summary);
            }
            await _ledger.UpdateRunProgressAsync(runId, snap, flushCt);
        }

        void LogVerbose(string message)
        {
            lock (summaryLock)
            {
                summary.AppendVerboseLog(message);
            }
        }

        try
        {
            // Stage 1/4: Inventory & Plan
            LogVerbose($"Starting Track 3 {mode} run (plane={planeFilter}, provider={providerFilter}, concurrency={maxConcurrency}).");
            await FlushProgressAsync(true, ct);

            var existingStates = await _ledger.LoadStorageObjectStatesAsync(binding.Id, ct);
            var rawItems = new List<PendingStorageItem>();

            if (planeFilter is "BOTH" or "CLINIC_ONLY")
            {
                rawItems.AddRange(await LoadPendingClinicAttachmentsAsync(binding, ct));
                rawItems.AddRange(await LoadPendingClinicPatientAvatarsAsync(binding, ct));
            }
            if (planeFilter is "BOTH" or "PATIENT_ONLY")
            {
                rawItems.AddRange(await LoadPendingPatientFilesAsync(binding, ct));
                rawItems.AddRange(await LoadPendingPatientAvatarsAsync(binding, ct));
            }

            var planned = new List<PlannedStorageItem>(rawItems.Count);
            foreach (var item in rawItems)
            {
                var hasExisting = existingStates.TryGetValue((item.TargetPlane, item.TargetEntityId), out var state);
                var sameUrl = hasExisting && string.Equals(state!.SourceUrl, item.SourceUrl, StringComparison.Ordinal);

                if (retryFailedOnly)
                {
                    if (!hasExisting || state!.Status is not (SyncStorageStatus.Pending or SyncStorageStatus.FailedRetryable))
                    {
                        continue;
                    }
                }
                else if (hasExisting && sameUrl)
                {
                    if (state!.Status is SyncStorageStatus.SkippedDeadLink
                        or SyncStorageStatus.SkippedEmptyBlob
                        or SyncStorageStatus.SkippedAuthRequired
                        or SyncStorageStatus.SkippedLegacyUnsupported
                        or SyncStorageStatus.FailedPermanent)
                    {
                        continue;
                    }
                }

                var cls = LegacyBlobSourceDownloader.ClassifyUrl(item.SourceUrl);
                if (providerFilter == "AZURE_BLOB_1" && cls.Provider != SyncStorageProvider.AzureBlob1)
                {
                    continue;
                }
                if (providerFilter == "VERCEL_BLOB" && cls.Provider != SyncStorageProvider.VercelBlob)
                {
                    continue;
                }

                planned.Add(new PlannedStorageItem(item, cls));
            }

            if (sampleLimit is > 0 && planned.Count > sampleLimit.Value)
            {
                var limit = sampleLimit.Value;
                if (isDryRun)
                {
                    var allMigratable = planned.Where(p => p.Classification.IsMigratable).ToList();
                    var allNonMigratable = planned.Where(p => !p.Classification.IsMigratable).ToList();
                    var nonMigratableReserve = (allMigratable.Count > 0 && allNonMigratable.Count > 0 && limit >= 2) ? 1 : 0;
                    var migratableBudget = Math.Max(0, limit - nonMigratableReserve);
                    var migratableSample = BalanceByPlane(allMigratable, migratableBudget, planeFilter);
                    var remaining = Math.Max(0, limit - migratableSample.Count);
                    var nonMigratableSample = remaining > 0
                        ? BalanceByPlane(allNonMigratable, remaining, planeFilter)
                        : new List<PlannedStorageItem>();

                    var combined = new List<PlannedStorageItem>(migratableSample.Count + nonMigratableSample.Count);
                    combined.AddRange(migratableSample);
                    combined.AddRange(nonMigratableSample);
                    planned = combined;
                }
                else
                {
                    planned = BalanceByPlane(planned, limit, planeFilter);
                }
            }

            var nonMigratable = planned.Where(p => !p.Classification.IsMigratable).ToList();
            var migratable = planned.Where(p => p.Classification.IsMigratable).ToList();
            var urlGroups = migratable
                .GroupBy(p => p.Item.SourceUrl.Trim(), StringComparer.Ordinal)
                .Select(g => g.ToList())
                .ToList();

            var overlapSaved = urlGroups.Sum(g => Math.Max(0, g.Count - 1));
            var clinicPlannedCount = migratable.Count(p => SyncStoragePlane.IsClinicPlane(p.Item.TargetPlane));
            var patientPlannedCount = migratable.Count(p => SyncStoragePlane.IsPatientPlane(p.Item.TargetPlane));

            lock (summaryLock)
            {
                summary.TotalItems = planned.Count;
                summary.OverlapSavedDownloads = overlapSaved;
                summary.Notes.Add($"Planned {planned.Count} items ({migratable.Count} Azure Blob #1 across {urlGroups.Count} unique URLs, {nonMigratable.Count} non-migratable, {overlapSaved} overlap downloads saved).");
            }

            if (planned.Count == 0 &&
                !isDryRun &&
                !isFinalSweep &&
                existingRunId is null &&
                string.Equals(mode, SyncRunMode.Incremental, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(triggeredBy, "AutoSyncWorker", StringComparison.Ordinal))
            {
                await _ledger.TouchCursorPolledAsync(binding.Id, ct);
                sw.Stop();
                summary.DurationMs = sw.ElapsedMilliseconds;
                await _ledger.DeleteRunAsync(runId, ct);
                var nowUtc = DateTimeOffset.UtcNow;
                return new SyncRunRecord(
                    runId, binding.Id, mode, sampleLimit, SyncRunStatus.Completed, triggeredBy,
                    nowUtc.AddMilliseconds(-summary.DurationMs), nowUtc,
                    System.Text.Json.JsonSerializer.SerializeToElement(summary, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)),
                    null);
            }

            LogVerbose($"Inventory complete: {migratable.Count} Azure Blob #1 ({clinicPlannedCount} Clinic, {patientPlannedCount} Patient), {nonMigratable.Count} legacy links, {overlapSaved} overlap saves.");

            if (isDryRun)
            {
                var probeLimit = sampleLimit is > 0 ? Math.Min(sampleLimit.Value, urlGroups.Count) : Math.Min(10, urlGroups.Count);
                var reachableCount = 0;
                var unreachableCount = 0;
                if (probeLimit > 0)
                {
                    await Parallel.ForEachAsync(
                        urlGroups.Take(probeLimit),
                        new ParallelOptions { MaxDegreeOfParallelism = maxConcurrency, CancellationToken = ct },
                        async (grp, token) =>
                        {
                            var probe = await _downloader.ProbeReachableAsync(grp[0].Item.SourceUrl, token);
                            if (probe.Reachable)
                                Interlocked.Increment(ref reachableCount);
                            else
                                Interlocked.Increment(ref unreachableCount);
                        });
                }

                lock (summaryLock)
                {
                    summary.StageIndex = 4;
                    summary.CurrentStage = "Dry-Run Complete";
                    summary.ProcessedItems = planned.Count;
                    summary.PercentComplete = 100;
                    summary.SkippedCount = nonMigratable.Count;
                    summary.DurationMs = sw.ElapsedMilliseconds;
                    summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
                    summary.Notes.Add($"Dry-run sampled {probeLimit} Azure Blob #1 URLs: {reachableCount} reachable, {unreachableCount} unreachable/skipped. Zero R2 or database writes performed.");
                }
                LogVerbose($"Dry-run complete: sampled {probeLimit} URLs ({reachableCount} reachable, {unreachableCount} unreachable). Zero writes performed.");

                var drySnap = SnapshotSummary(summary);
                await _ledger.CompleteRunAsync(runId, drySnap, ct);
                return (await _ledger.GetRunAsync(runId, ct))!;
            }

            // Fail-fast configuration checks before write stages
            if (clinicPlannedCount > 0 && (!_r2Pool.IsClinicConfigured || !_encryptor.IsClinicConfigured))
            {
                throw new InvalidOperationException(
                    "Clinic file migration requires Track3Storage:ClinicR2 and ClinicEncryption:MasterSecret to be configured.");
            }
            if (patientPlannedCount > 0 && (!_r2Pool.IsPatientConfigured || !_encryptor.IsPatientConfigured))
            {
                throw new InvalidOperationException(
                    "Patient file migration requires Track3Storage:PatientR2 and PatientEncryption:MasterSecret to be configured.");
            }

            // Stage 2/4: Classify Non-Migratable Links
            lock (summaryLock)
            {
                summary.StageIndex = 2;
                summary.CurrentStage = "Classify Non-Migratable Links";
                summary.PercentComplete = planned.Count == 0 ? 50 : 15;
            }
            await FlushProgressAsync(true, ct);

            if (nonMigratable.Count > 0)
            {
                foreach (var chunk in nonMigratable.Chunk(effectiveBatch))
                {
                    ct.ThrowIfCancellationRequested();
                    var upserts = chunk.Select(p => new SyncStorageObjectUpsert(
                        BindingId: binding.Id,
                        TargetPlane: p.Item.TargetPlane,
                        TargetEntityId: p.Item.TargetEntityId,
                        OwnerId: p.Item.OwnerId,
                        TenantId: p.Item.TenantId,
                        SourceProvider: p.Classification.Provider,
                        SourceUrl: p.Item.SourceUrl,
                        SourceSizeBytes: p.Item.OriginalSizeBytes,
                        SourceContentType: p.Item.OriginalContentType,
                        SourceContentTypeCaptured: true,
                        SourceSha256: null,
                        TargetBucket: null,
                        TargetR2Key: null,
                        EncryptedSizeBytes: null,
                        EncryptedSha256: null,
                        EncryptionKeyScheme: null,
                        Status: p.Classification.SkipStatus ?? SyncStorageStatus.SkippedLegacyUnsupported,
                        AttemptDelta: 1,
                        LastErrorCode: p.Classification.ErrorCode,
                        LastErrorMessage: p.Classification.ErrorMessage,
                        MigratedAt: null,
                        VerifiedAt: null
                    )).ToList();

                    await _ledger.UpsertStorageObjectsBatchAsync(upserts, ct);

                    lock (summaryLock)
                    {
                        summary.SkippedCount = (summary.SkippedCount ?? 0) + chunk.Length;
                        summary.ProcessedItems += chunk.Length;
                        summary.PercentComplete = planned.Count == 0 ? 50 : Math.Min(90, 15 + (int)Math.Round(summary.ProcessedItems * 70.0 / planned.Count));
                    }
                }
                LogVerbose($"Classified {nonMigratable.Count} non-migratable links as SKIPPED_LEGACY_UNSUPPORTED (original URLs preserved).");
            }

            // Stage 3/4: Migrate Azure Blob #1 (Download-Once, Encrypt-Twice)
            lock (summaryLock)
            {
                summary.StageIndex = 3;
                summary.CurrentStage = "Migrate Azure Blob #1";
            }
            await FlushProgressAsync(true, ct);

            var runMigratedItems = new System.Collections.Concurrent.ConcurrentBag<(string Plane, Guid EntityId)>();

            if (urlGroups.Count > 0)
            {
                await Parallel.ForEachAsync(
                    urlGroups,
                    new ParallelOptions { MaxDegreeOfParallelism = maxConcurrency, CancellationToken = ct },
                    async (group, token) =>
                    {
                        var primary = group[0].Item;
                        BlobDownloadResult dl;
                        try
                        {
                            dl = await _downloader.DownloadAsync(primary.SourceUrl, primary.OriginalContentType, token);
                        }
                        catch (OperationCanceledException) when (token.IsCancellationRequested)
                        {
                            throw;
                        }
                        catch (Exception ex)
                        {
                            var errType = ex.GetType().Name;
                            _logger.LogWarning(
                                "Unexpected download failure for {Plane} group of {Count} items (exception {ExceptionType}).",
                                primary.TargetPlane,
                                group.Count,
                                errType);
                            dl = new BlobDownloadResult(
                                Success: false,
                                Provider: group[0].Classification.Provider,
                                Bytes: null,
                                ContentType: null,
                                SourceSha256: null,
                                SourceSizeBytes: 0,
                                FailureStatus: SyncStorageStatus.FailedRetryable,
                                ErrorCode: errType,
                                ErrorMessage: "Transient error while downloading source object.");
                        }

                        if (!dl.Success || dl.Bytes is null)
                        {
                            var failureStatus = dl.FailureStatus ?? SyncStorageStatus.FailedRetryable;
                            var failUpserts = group.Select(g => new SyncStorageObjectUpsert(
                                BindingId: binding.Id,
                                TargetPlane: g.Item.TargetPlane,
                                TargetEntityId: g.Item.TargetEntityId,
                                OwnerId: g.Item.OwnerId,
                                TenantId: g.Item.TenantId,
                                SourceProvider: dl.Provider,
                                SourceUrl: g.Item.SourceUrl,
                                SourceSizeBytes: g.Item.OriginalSizeBytes,
                                SourceContentType: g.Item.OriginalContentType,
                                SourceContentTypeCaptured: true,
                                SourceSha256: null,
                                TargetBucket: null,
                                TargetR2Key: null,
                                EncryptedSizeBytes: null,
                                EncryptedSha256: null,
                                EncryptionKeyScheme: null,
                                Status: failureStatus,
                                AttemptDelta: 1,
                                LastErrorCode: dl.ErrorCode,
                                LastErrorMessage: dl.ErrorMessage,
                                MigratedAt: null,
                                VerifiedAt: null
                            )).ToList();

                            await _ledger.UpsertStorageObjectsBatchAsync(failUpserts, token);

                            lock (summaryLock)
                            {
                                if (failureStatus.StartsWith("SKIPPED_", StringComparison.Ordinal))
                                {
                                    summary.SkippedCount = (summary.SkippedCount ?? 0) + group.Count;
                                }
                                else
                                {
                                    summary.FailedCount = (summary.FailedCount ?? 0) + group.Count;
                                }
                                summary.ProcessedItems += group.Count;
                                summary.PercentComplete = planned.Count == 0 ? 85 : Math.Min(90, 15 + (int)Math.Round(summary.ProcessedItems * 70.0 / planned.Count));
                            }
                            await FlushProgressAsync(false, token);
                            return;
                        }

                        lock (summaryLock)
                        {
                            summary.BytesDownloaded = (summary.BytesDownloaded ?? 0) + dl.SourceSizeBytes;
                        }

                        var groupUpserts = new List<SyncStorageObjectUpsert>(group.Count);
                        var now = DateTimeOffset.UtcNow;

                        foreach (var entry in group)
                        {
                            var item = entry.Item;
                            try
                            {
                                var entityLock = GetEntityWriteLock(item.TargetPlane, item.TargetEntityId);
                                await entityLock.WaitAsync(token);
                                try
                                {
                                    if (SyncStoragePlane.IsClinicPlane(item.TargetPlane))
                                    {
                                        var isClinicAvatar = item.TargetPlane == SyncStoragePlane.ClinicPatientAvatar;
                                        if (string.IsNullOrWhiteSpace(item.TenantId) || item.OwnerId == Guid.Empty)
                                        {
                                            throw new InvalidOperationException("Clinic storage object is missing TenantId or ClinicId.");
                                        }

                                        var preState = isClinicAvatar
                                            ? await GetClinicPatientAvatarStateAsync(item.TargetEntityId, token)
                                            : await GetClinicAttachmentStateAsync(item.TargetEntityId, token);
                                        if (!preState.Exists || preState.IsDeleted)
                                        {
                                            LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: concurrently deleted or unavailable in target DB.");
                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                            continue;
                                        }

                                        if (!string.Equals(preState.EncryptionAlgorithm ?? "NONE", "NONE", StringComparison.OrdinalIgnoreCase))
                                        {
                                            var existingKey = preState.StorageUri;
                                            long? existingHeadLen = string.IsNullOrWhiteSpace(existingKey)
                                                ? null
                                                : await _r2Pool.HeadObjectLengthAsync(isClinic: true, existingKey, token);

                                            var r2Verified = existingHeadLen.HasValue &&
                                                (!preState.EncryptedSizeBytes.HasValue || existingHeadLen.Value == preState.EncryptedSizeBytes.Value);

                                            if (r2Verified)
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: already encrypted concurrently in target DB.");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: item.TenantId,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: existingKey,
                                                    EncryptedSizeBytes: preState.EncryptedSizeBytes,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "cmk-v1",
                                                    Status: SyncStorageStatus.Verified,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: null,
                                                    LastErrorMessage: null,
                                                    MigratedAt: now,
                                                    VerifiedAt: now));
                                            }
                                            else
                                            {
                                                var errCode = existingHeadLen.HasValue ? "R2SizeMismatch" : "R2ObjectMissing";
                                                LogVerbose($"Flagged {item.TargetPlane} entity {item.TargetEntityId}: already encrypted in target DB but R2 object check failed ({errCode}).");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: item.TenantId,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: existingKey,
                                                    EncryptedSizeBytes: preState.EncryptedSizeBytes,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "cmk-v1",
                                                    Status: SyncStorageStatus.FailedRetryable,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: errCode,
                                                    LastErrorMessage: "Encrypted target object missing or size-mismatched in R2.",
                                                    MigratedAt: null,
                                                    VerifiedAt: null));

                                                lock (summaryLock)
                                                {
                                                    summary.FailedCount = (summary.FailedCount ?? 0) + 1;
                                                }
                                            }

                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                            continue;
                                        }

                                        var encrypted = _encryptor.EncryptForClinic(dl.Bytes, item.TenantId, item.OwnerId);
                                        var key = isClinicAvatar
                                            ? $"tenants/{item.TenantId}/clinics/{item.OwnerId}/patients/{item.TargetEntityId}/avatar.cez"
                                            : $"tenants/{item.TenantId}/clinics/{item.OwnerId}/records/{item.TargetEntityId}.cez";
                                        var normalizedKey = await _r2Pool.PutEncryptedAsync(isClinic: true, key, encrypted.Ciphertext, "cmk-v1", token);

                                        var headLen = await _r2Pool.HeadObjectLengthAsync(isClinic: true, normalizedKey, token);
                                        if (headLen != encrypted.EncryptedSizeBytes)
                                        {
                                            throw new InvalidOperationException("Clinic R2 HEAD size mismatch after upload.");
                                        }

                                        var resolvedContentType = dl.ContentType ?? (isClinicAvatar ? "image/jpeg" : "application/octet-stream");
                                        var updated = isClinicAvatar
                                            ? await UpdateClinicPatientAvatarCryptoAsync(
                                                item.TargetEntityId,
                                                normalizedKey,
                                                resolvedContentType,
                                                encrypted,
                                                token)
                                            : await UpdateClinicAttachmentCryptoAsync(
                                                item.TargetEntityId,
                                                normalizedKey,
                                                dl.SourceSizeBytes,
                                                resolvedContentType,
                                                encrypted,
                                                token);

                                        if (!updated)
                                        {
                                            var current = isClinicAvatar
                                                ? await GetClinicPatientAvatarStateAsync(item.TargetEntityId, token)
                                                : await GetClinicAttachmentStateAsync(item.TargetEntityId, token);
                                            if (current.Exists &&
                                                !current.IsDeleted &&
                                                !string.Equals(current.EncryptionAlgorithm ?? "NONE", "NONE", StringComparison.OrdinalIgnoreCase))
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: already encrypted concurrently in target DB.");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: item.TenantId,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: current.StorageUri,
                                                    EncryptedSizeBytes: null,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "cmk-v1",
                                                    Status: SyncStorageStatus.Verified,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: null,
                                                    LastErrorMessage: null,
                                                    MigratedAt: now,
                                                    VerifiedAt: now));
                                            }
                                            else
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: concurrently deleted or unavailable in target DB.");
                                            }

                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                        }
                                        else
                                        {
                                            groupUpserts.Add(new SyncStorageObjectUpsert(
                                                BindingId: binding.Id,
                                                TargetPlane: item.TargetPlane,
                                                TargetEntityId: item.TargetEntityId,
                                                OwnerId: item.OwnerId,
                                                TenantId: item.TenantId,
                                                SourceProvider: dl.Provider,
                                                SourceUrl: item.SourceUrl,
                                                SourceSizeBytes: isClinicAvatar ? dl.SourceSizeBytes : item.OriginalSizeBytes,
                                                SourceContentType: item.OriginalContentType,
                                                SourceContentTypeCaptured: true,
                                                SourceSha256: dl.SourceSha256,
                                                TargetBucket: _r2Pool.ClinicBucketName,
                                                TargetR2Key: normalizedKey,
                                                EncryptedSizeBytes: encrypted.EncryptedSizeBytes,
                                                EncryptedSha256: encrypted.EncryptedHash,
                                                EncryptionKeyScheme: "cmk-v1",
                                                Status: SyncStorageStatus.Migrated,
                                                AttemptDelta: 1,
                                                LastErrorCode: null,
                                                LastErrorMessage: null,
                                                MigratedAt: now,
                                                VerifiedAt: null));

                                            runMigratedItems.Add((item.TargetPlane, item.TargetEntityId));
                                            lock (summaryLock)
                                            {
                                                summary.BytesUploaded = (summary.BytesUploaded ?? 0) + encrypted.EncryptedSizeBytes;
                                                summary.ClinicCopiesMigrated = (summary.ClinicCopiesMigrated ?? 0) + 1;
                                                summary.ProcessedItems++;
                                            }
                                        }
                                    }
                                    else
                                    {
                                        var isPatientAvatar = item.TargetPlane == SyncStoragePlane.PatientAvatar;
                                        var preState = isPatientAvatar
                                            ? await GetPatientAvatarStateAsync(item.TargetEntityId, token)
                                            : await GetPatientFileStateAsync(item.TargetEntityId, token);
                                        if (!preState.Exists || preState.IsDeleted)
                                        {
                                            LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: concurrently deleted or unavailable in target DB.");
                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                            continue;
                                        }

                                        if (!string.Equals(preState.EncryptionAlgorithm ?? "NONE", "NONE", StringComparison.OrdinalIgnoreCase))
                                        {
                                            var existingKey = preState.StorageKey;
                                            long? existingHeadLen = string.IsNullOrWhiteSpace(existingKey)
                                                ? null
                                                : await _r2Pool.HeadObjectLengthAsync(isClinic: false, existingKey, token);

                                            var r2Verified = existingHeadLen.HasValue &&
                                                (!preState.EncryptedSizeBytes.HasValue || existingHeadLen.Value == preState.EncryptedSizeBytes.Value);

                                            if (r2Verified)
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: already encrypted concurrently in target DB.");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: null,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: existingKey,
                                                    EncryptedSizeBytes: preState.EncryptedSizeBytes,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "pmk-v1",
                                                    Status: SyncStorageStatus.Verified,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: null,
                                                    LastErrorMessage: null,
                                                    MigratedAt: now,
                                                    VerifiedAt: now));
                                            }
                                            else
                                            {
                                                var errCode = existingHeadLen.HasValue ? "R2SizeMismatch" : "R2ObjectMissing";
                                                LogVerbose($"Flagged {item.TargetPlane} entity {item.TargetEntityId}: already encrypted in target DB but R2 object check failed ({errCode}).");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: null,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: existingKey,
                                                    EncryptedSizeBytes: preState.EncryptedSizeBytes,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "pmk-v1",
                                                    Status: SyncStorageStatus.FailedRetryable,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: errCode,
                                                    LastErrorMessage: "Encrypted target object missing or size-mismatched in R2.",
                                                    MigratedAt: null,
                                                    VerifiedAt: null));

                                                lock (summaryLock)
                                                {
                                                    summary.FailedCount = (summary.FailedCount ?? 0) + 1;
                                                }
                                            }

                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                            continue;
                                        }

                                        var encrypted = _encryptor.EncryptForPatient(dl.Bytes, item.OwnerId);
                                        var key = isPatientAvatar
                                            ? $"patients/{item.OwnerId}/avatar/{item.TargetEntityId}.cez"
                                            : $"patients/{item.OwnerId}/records/{item.TargetEntityId}.cez";
                                        var normalizedKey = await _r2Pool.PutEncryptedAsync(isClinic: false, key, encrypted.Ciphertext, "pmk-v1", token);

                                        var headLen = await _r2Pool.HeadObjectLengthAsync(isClinic: false, normalizedKey, token);
                                        if (headLen != encrypted.EncryptedSizeBytes)
                                        {
                                            throw new InvalidOperationException("Patient R2 HEAD size mismatch after upload.");
                                        }

                                        var resolvedContentType = dl.ContentType ?? (isPatientAvatar ? "image/jpeg" : "application/octet-stream");
                                        var updated = isPatientAvatar
                                            ? await UpdatePatientAvatarCryptoAsync(
                                                item.TargetEntityId,
                                                normalizedKey,
                                                resolvedContentType,
                                                encrypted,
                                                token)
                                            : await UpdatePatientFileCryptoAsync(
                                                item.TargetEntityId,
                                                normalizedKey,
                                                dl.SourceSizeBytes,
                                                resolvedContentType,
                                                encrypted,
                                                token);

                                        if (!updated)
                                        {
                                            var current = isPatientAvatar
                                                ? await GetPatientAvatarStateAsync(item.TargetEntityId, token)
                                                : await GetPatientFileStateAsync(item.TargetEntityId, token);
                                            if (current.Exists &&
                                                !current.IsDeleted &&
                                                !string.Equals(current.EncryptionAlgorithm ?? "NONE", "NONE", StringComparison.OrdinalIgnoreCase))
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: already encrypted concurrently in target DB.");
                                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                                    BindingId: binding.Id,
                                                    TargetPlane: item.TargetPlane,
                                                    TargetEntityId: item.TargetEntityId,
                                                    OwnerId: item.OwnerId,
                                                    TenantId: null,
                                                    SourceProvider: dl.Provider,
                                                    SourceUrl: item.SourceUrl,
                                                    SourceSizeBytes: item.OriginalSizeBytes,
                                                    SourceContentType: item.OriginalContentType,
                                                    SourceContentTypeCaptured: true,
                                                    SourceSha256: null,
                                                    TargetBucket: null,
                                                    TargetR2Key: current.StorageKey,
                                                    EncryptedSizeBytes: null,
                                                    EncryptedSha256: null,
                                                    EncryptionKeyScheme: "pmk-v1",
                                                    Status: SyncStorageStatus.Verified,
                                                    AttemptDelta: 1,
                                                    LastErrorCode: null,
                                                    LastErrorMessage: null,
                                                    MigratedAt: now,
                                                    VerifiedAt: now));
                                            }
                                            else
                                            {
                                                LogVerbose($"Skipped {item.TargetPlane} entity {item.TargetEntityId}: concurrently deleted or unavailable in target DB.");
                                            }

                                            lock (summaryLock)
                                            {
                                                summary.ProcessedItems++;
                                            }
                                        }
                                        else
                                        {
                                            groupUpserts.Add(new SyncStorageObjectUpsert(
                                                BindingId: binding.Id,
                                                TargetPlane: item.TargetPlane,
                                                TargetEntityId: item.TargetEntityId,
                                                OwnerId: item.OwnerId,
                                                TenantId: null,
                                                SourceProvider: dl.Provider,
                                                SourceUrl: item.SourceUrl,
                                                SourceSizeBytes: isPatientAvatar ? dl.SourceSizeBytes : item.OriginalSizeBytes,
                                                SourceContentType: item.OriginalContentType,
                                                SourceContentTypeCaptured: true,
                                                SourceSha256: dl.SourceSha256,
                                                TargetBucket: _r2Pool.PatientBucketName,
                                                TargetR2Key: normalizedKey,
                                                EncryptedSizeBytes: encrypted.EncryptedSizeBytes,
                                                EncryptedSha256: encrypted.EncryptedHash,
                                                EncryptionKeyScheme: "pmk-v1",
                                                Status: SyncStorageStatus.Migrated,
                                                AttemptDelta: 1,
                                                LastErrorCode: null,
                                                LastErrorMessage: null,
                                                MigratedAt: now,
                                                VerifiedAt: null));

                                            runMigratedItems.Add((item.TargetPlane, item.TargetEntityId));
                                            lock (summaryLock)
                                            {
                                                summary.BytesUploaded = (summary.BytesUploaded ?? 0) + encrypted.EncryptedSizeBytes;
                                                summary.PatientCopiesMigrated = (summary.PatientCopiesMigrated ?? 0) + 1;
                                                summary.ProcessedItems++;
                                            }
                                        }
                                    }
                                }
                                finally
                                {
                                    entityLock.Release();
                                }
                            }
                            catch (OperationCanceledException) when (token.IsCancellationRequested)
                            {
                                throw;
                            }
                            catch (Exception ex)
                            {
                                var errType = ex.GetType().Name;
                                _logger.LogWarning(ex, "Failed migrating {Plane} entity {EntityId}.", item.TargetPlane, item.TargetEntityId);
                                groupUpserts.Add(new SyncStorageObjectUpsert(
                                    BindingId: binding.Id,
                                    TargetPlane: item.TargetPlane,
                                    TargetEntityId: item.TargetEntityId,
                                    OwnerId: item.OwnerId,
                                    TenantId: item.TenantId,
                                    SourceProvider: entry.Classification.Provider,
                                    SourceUrl: item.SourceUrl,
                                    SourceSizeBytes: item.OriginalSizeBytes,
                                    SourceContentType: item.OriginalContentType,
                                    SourceContentTypeCaptured: true,
                                    SourceSha256: null,
                                    TargetBucket: null,
                                    TargetR2Key: null,
                                    EncryptedSizeBytes: null,
                                    EncryptedSha256: null,
                                    EncryptionKeyScheme: null,
                                    Status: SyncStorageStatus.FailedRetryable,
                                    AttemptDelta: 1,
                                    LastErrorCode: errType,
                                    LastErrorMessage: "Storage encryption or upload failed.",
                                    MigratedAt: null,
                                    VerifiedAt: null));

                                lock (summaryLock)
                                {
                                    summary.FailedCount = (summary.FailedCount ?? 0) + 1;
                                    summary.ProcessedItems++;
                                }
                            }
                        }

                        if (groupUpserts.Count > 0)
                        {
                            await _ledger.UpsertStorageObjectsBatchAsync(groupUpserts, token);
                        }

                        lock (summaryLock)
                        {
                            summary.PercentComplete = planned.Count == 0 ? 85 : Math.Min(90, 15 + (int)Math.Round(summary.ProcessedItems * 70.0 / planned.Count));
                        }
                        await FlushProgressAsync(false, token);
                    });
            }

            // Stage 4/4: Verification & Parity
            lock (summaryLock)
            {
                summary.StageIndex = 4;
                summary.CurrentStage = "Verification & Parity";
                summary.PercentComplete = 92;
            }
            await FlushProgressAsync(true, ct);

            var verifyAll = isFinalSweep || retryFailedOnly;
            var (verifiedCount, verifyFailedCount) = await VerifyMigratedObjectsAsync(
                binding.Id,
                verifyAll ? null : runMigratedItems.ToHashSet(),
                verifyAll,
                planeFilter,
                providerFilter,
                maxConcurrency,
                LogVerbose,
                ct);

            await _ledger.UpdateCursorAsync(binding.Id, 0, ct);

            lock (summaryLock)
            {
                if (verifyFailedCount > 0)
                {
                    summary.FailedCount = (summary.FailedCount ?? 0) + verifyFailedCount;
                }
                summary.PercentComplete = 100;
                summary.CurrentStage = "Completed";
                summary.DurationMs = sw.ElapsedMilliseconds;
                summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
                var secs = Math.Max(0.001, sw.ElapsedMilliseconds / 1000.0);
                var totalBytes = (summary.BytesDownloaded ?? 0) + (summary.BytesUploaded ?? 0);
                summary.TransferRateMbps = Math.Round((totalBytes * 8.0) / (secs * 1_000_000.0), 2);
                summary.Notes.Add($"Verified {verifiedCount} encrypted objects via R2 read-back + AES-256-GCM decrypt parity check ({verifyFailedCount} verification failures).");
            }

            LogVerbose($"Completed {mode}: {summary.ClinicCopiesMigrated ?? 0} Clinic, {summary.PatientCopiesMigrated ?? 0} Patient migrated; {summary.SkippedCount ?? 0} skipped; {summary.FailedCount ?? 0} failed; {verifiedCount} decrypt-verified.");

            var finalSnap = SnapshotSummary(summary);
            await _ledger.CompleteRunAsync(runId, finalSnap, ct);
            return (await _ledger.GetRunAsync(runId, ct))!;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            var snap = SnapshotSummary(summary);
            await _ledger.FailRunAsync(runId, snap, "RunCancelled", CancellationToken.None);
            throw;
        }
        catch (Exception ex)
        {
            var snap = SnapshotSummary(summary);
            await _ledger.FailRunAsync(runId, snap, ex, CancellationToken.None);
            throw;
        }
    }

    public async Task<ParityReportResponse> BuildParityReportAsync(SyncBinding binding, CancellationToken ct = default)
    {
        var (clinicAttTotal, clinicAttEncrypted, clinicAttPendingDb) = await CountClinicAttachmentsScopeAsync(binding, ct);
        var (clinicAvatarTotal, clinicAvatarEncrypted, clinicAvatarPendingDb) = await CountClinicPatientAvatarsScopeAsync(binding, ct);
        var (patientFileTotal, patientFileEncrypted, patientFilePendingDb) = await CountPatientFilesScopeAsync(binding, ct);
        var (patientAvatarTotal, patientAvatarEncrypted, patientAvatarPendingDb) = await CountPatientAvatarsScopeAsync(binding, ct);
        var ledgerCounts = await _ledger.GetStorageObjectCountsByStatusAndProviderAsync(binding.Id, ct);
        var openConflicts = await _ledger.CountOpenConflictsAsync(binding.Id, ct);

        long CountStatus(string status) =>
            ledgerCounts.Where(kv => string.Equals(kv.Key.Status, status, StringComparison.Ordinal))
                        .Sum(kv => kv.Value);

        var deadSkipped = CountStatus(SyncStorageStatus.SkippedDeadLink);
        var emptySkipped = CountStatus(SyncStorageStatus.SkippedEmptyBlob);
        var authSkipped = CountStatus(SyncStorageStatus.SkippedAuthRequired);
        var legacySkipped = CountStatus(SyncStorageStatus.SkippedLegacyUnsupported);
        var failedRetryable = CountStatus(SyncStorageStatus.FailedRetryable);
        var failedPermanent = CountStatus(SyncStorageStatus.FailedPermanent);
        var failedTotal = failedRetryable + failedPermanent;
        var pendingWithR2KeyCount = await _ledger.CountPendingWithTargetR2KeyAsync(binding.Id, ct);

        var states = await _ledger.LoadStorageObjectStatesAsync(binding.Id, ct);
        var clinicAttPendingMigratable = (await LoadPendingClinicAttachmentsAsync(binding, ct))
            .Count(i => IsPendingMigratableItem(i, states));
        var clinicAvatarPendingMigratable = (await LoadPendingClinicPatientAvatarsAsync(binding, ct))
            .Count(i => IsPendingMigratableItem(i, states));
        var patientFilePendingMigratable = (await LoadPendingPatientFilesAsync(binding, ct))
            .Count(i => IsPendingMigratableItem(i, states));
        var patientAvatarPendingMigratable = (await LoadPendingPatientAvatarsAsync(binding, ct))
            .Count(i => IsPendingMigratableItem(i, states));

        var checks = new List<ParityEntityCheck>
        {
            new(
                EntityType: "Clinic RecordAttachments (AES-256-GCM)",
                V1ExpectedCount: Math.Max(clinicAttEncrypted, clinicAttTotal - Math.Max(0, clinicAttPendingDb - clinicAttPendingMigratable)),
                V2ActualCount: clinicAttEncrypted,
                MappedLedgerCount: clinicAttEncrypted,
                IsMatched: clinicAttPendingMigratable == 0,
                Notes: clinicAttPendingMigratable == 0
                    ? $"All {clinicAttEncrypted:N0} reachable Clinic attachments encrypted."
                    : $"{clinicAttPendingMigratable:N0} reachable Clinic attachments still pending."
            ),
            new(
                EntityType: "Clinic Patient Avatars (AES-256-GCM)",
                V1ExpectedCount: Math.Max(clinicAvatarEncrypted, clinicAvatarTotal - Math.Max(0, clinicAvatarPendingDb - clinicAvatarPendingMigratable)),
                V2ActualCount: clinicAvatarEncrypted,
                MappedLedgerCount: clinicAvatarEncrypted,
                IsMatched: clinicAvatarPendingMigratable == 0,
                Notes: clinicAvatarPendingMigratable == 0
                    ? $"All {clinicAvatarEncrypted:N0} reachable Clinic patient avatars encrypted."
                    : $"{clinicAvatarPendingMigratable:N0} reachable Clinic patient avatars still pending."
            ),
            new(
                EntityType: "Patient FileRecords (AES-256-GCM)",
                V1ExpectedCount: Math.Max(patientFileEncrypted, patientFileTotal - Math.Max(0, patientFilePendingDb - patientFilePendingMigratable)),
                V2ActualCount: patientFileEncrypted,
                MappedLedgerCount: patientFileEncrypted,
                IsMatched: patientFilePendingMigratable == 0,
                Notes: patientFilePendingMigratable == 0
                    ? $"All {patientFileEncrypted:N0} reachable Patient files encrypted."
                    : $"{patientFilePendingMigratable:N0} reachable Patient files still pending."
            ),
            new(
                EntityType: "Patient Avatars (AES-256-GCM)",
                V1ExpectedCount: Math.Max(patientAvatarEncrypted, patientAvatarTotal - Math.Max(0, patientAvatarPendingDb - patientAvatarPendingMigratable)),
                V2ActualCount: patientAvatarEncrypted,
                MappedLedgerCount: patientAvatarEncrypted,
                IsMatched: patientAvatarPendingMigratable == 0,
                Notes: patientAvatarPendingMigratable == 0
                    ? $"All {patientAvatarEncrypted:N0} reachable Patient avatars encrypted."
                    : $"{patientAvatarPendingMigratable:N0} reachable Patient avatars still pending."
            ),
            new(
                EntityType: "Skipped Legacy / Dead / Auth-Gated (Kept As-Is)",
                V1ExpectedCount: deadSkipped + emptySkipped + authSkipped + legacySkipped,
                V2ActualCount: deadSkipped + emptySkipped + authSkipped + legacySkipped,
                MappedLedgerCount: deadSkipped + emptySkipped + authSkipped + legacySkipped,
                IsMatched: true,
                Notes: $"Dead={deadSkipped}, Empty={emptySkipped}, Auth={authSkipped}, Legacy={legacySkipped}"
            ),
            new(
                EntityType: "Failed Transfers (Retryable / Permanent)",
                V1ExpectedCount: 0,
                V2ActualCount: failedTotal + pendingWithR2KeyCount,
                MappedLedgerCount: failedTotal + pendingWithR2KeyCount,
                IsMatched: failedTotal == 0 && pendingWithR2KeyCount == 0,
                Notes: failedTotal == 0 && pendingWithR2KeyCount == 0
                    ? "Zero failed storage transfers."
                    : $"Retryable={failedRetryable}, Permanent={failedPermanent}, PendingVerify={pendingWithR2KeyCount}"
            )
        };

        var readyToFreeze = openConflicts == 0 && pendingWithR2KeyCount == 0 && checks.All(c => c.IsMatched);

        return new ParityReportResponse(
            BindingId: binding.Id,
            Track: binding.Track,
            BindingName: binding.Name,
            IsFrozen: binding.IsFrozen,
            ChangelogMaxSeq: 0,
            LastCursorSeq: 0,
            ChangelogLag: 0,
            OpenConflictsCount: openConflicts,
            ReadyToFreeze: readyToFreeze,
            Checks: checks,
            GeneratedAtUtc: DateTimeOffset.UtcNow
        );
    }

    private async Task<(int VerifiedCount, int FailedCount)> VerifyMigratedObjectsAsync(
        Guid bindingId,
        HashSet<(string Plane, Guid EntityId)>? runSet,
        bool verifyAll,
        string planeFilter,
        string providerFilter,
        int maxConcurrency,
        Action<string> logVerbose,
        CancellationToken ct)
    {
        var states = await _ledger.LoadStorageObjectStatesAsync(bindingId, ct);
        var migrated = states.Values
            .Where(s => s.Status == SyncStorageStatus.Migrated &&
                        !string.IsNullOrWhiteSpace(s.TargetR2Key) &&
                        MatchesVerificationFilters(s, planeFilter, providerFilter) &&
                        (verifyAll || runSet is null || runSet.Contains((s.TargetPlane, s.TargetEntityId))))
            .ToList();

        if (migrated.Count == 0) return (0, 0);

        List<SyncStorageObjectState> toVerify;
        if (verifyAll)
        {
            toVerify = migrated;
        }
        else
        {
            var rate = Math.Clamp(EffectiveVerificationSampleRate, 0.0, 1.0);
            var sampleCount = rate <= 0.0 ? 0 : Math.Max(1, (int)Math.Ceiling(migrated.Count * rate));
            toVerify = sampleCount == 0 ? new List<SyncStorageObjectState>() : migrated.Take(sampleCount).ToList();
        }

        var clinicIds = toVerify.Where(v => v.TargetPlane == SyncStoragePlane.ClinicAttachment).Select(v => v.TargetEntityId).ToArray();
        var clinicAvatarIds = toVerify.Where(v => v.TargetPlane == SyncStoragePlane.ClinicPatientAvatar).Select(v => v.TargetEntityId).ToArray();
        var patientIds = toVerify.Where(v => v.TargetPlane == SyncStoragePlane.PatientFile).Select(v => v.TargetEntityId).ToArray();
        var patientAvatarIds = toVerify.Where(v => v.TargetPlane == SyncStoragePlane.PatientAvatar).Select(v => v.TargetEntityId).ToArray();

        var clinicMeta = await LoadClinicCryptoMetadataAsync(clinicIds, ct);
        var clinicAvatarMeta = await LoadClinicPatientAvatarCryptoMetadataAsync(clinicAvatarIds, ct);
        var patientMeta = await LoadPatientCryptoMetadataAsync(patientIds, ct);
        var patientAvatarMeta = await LoadPatientAvatarCryptoMetadataAsync(patientAvatarIds, ct);

        var verifiedCount = 0;
        var failedCount = 0;
        var ledgerUpserts = new System.Collections.Concurrent.ConcurrentBag<SyncStorageObjectUpsert>();

        await Parallel.ForEachAsync(
            toVerify,
            new ParallelOptions { MaxDegreeOfParallelism = maxConcurrency, CancellationToken = ct },
            async (state, token) =>
            {
                Guid ownerId = Guid.Empty;
                string? tenantId = null;

                try
                {
                    if (SyncStoragePlane.IsClinicPlane(state.TargetPlane))
                    {
                        var lookup = state.TargetPlane == SyncStoragePlane.ClinicPatientAvatar ? clinicAvatarMeta : clinicMeta;
                        if (!lookup.TryGetValue(state.TargetEntityId, out var meta))
                        {
                            return;
                        }

                        ownerId = meta.ClinicId;
                        tenantId = meta.TenantId;

                        if (string.IsNullOrWhiteSpace(meta.StorageUri) ||
                            string.IsNullOrWhiteSpace(meta.IvBase64) ||
                            string.IsNullOrWhiteSpace(meta.TagBase64) ||
                            string.IsNullOrWhiteSpace(meta.WrappedKeyJson))
                        {
                            throw new InvalidOperationException($"Encrypted clinic attachment {state.TargetEntityId} is missing storage or envelope metadata.");
                        }

                        var ciphertext = await _r2Pool.GetObjectBytesAsync(isClinic: true, meta.StorageUri, token);
                        var plaintext = _encryptor.DecryptForClinic(ciphertext, meta.IvBase64, meta.TagBase64, meta.WrappedKeyJson, meta.TenantId, meta.ClinicId);
                        var actualSha = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
                        if (!string.IsNullOrWhiteSpace(state.SourceSha256) &&
                            !string.Equals(actualSha, state.SourceSha256, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException($"Decrypt parity SHA-256 mismatch for clinic attachment {state.TargetEntityId}.");
                        }

                        ledgerUpserts.Add(new SyncStorageObjectUpsert(
                            BindingId: bindingId,
                            TargetPlane: state.TargetPlane,
                            TargetEntityId: state.TargetEntityId,
                            OwnerId: meta.ClinicId,
                            TenantId: meta.TenantId,
                            SourceProvider: state.SourceProvider,
                            SourceUrl: state.SourceUrl,
                            SourceSizeBytes: state.SourceSizeBytes,
                            SourceContentType: state.SourceContentType,
                            SourceContentTypeCaptured: state.SourceContentTypeCaptured,
                            SourceSha256: state.SourceSha256,
                            TargetBucket: state.TargetBucket,
                            TargetR2Key: meta.StorageUri,
                            EncryptedSizeBytes: state.EncryptedSizeBytes,
                            EncryptedSha256: null,
                            EncryptionKeyScheme: "cmk-v1",
                            Status: SyncStorageStatus.Verified,
                            AttemptDelta: 0,
                            LastErrorCode: null,
                            LastErrorMessage: null,
                            MigratedAt: null,
                            VerifiedAt: DateTimeOffset.UtcNow));
                        Interlocked.Increment(ref verifiedCount);
                    }
                    else
                    {
                        var lookup = state.TargetPlane == SyncStoragePlane.PatientAvatar ? patientAvatarMeta : patientMeta;
                        if (!lookup.TryGetValue(state.TargetEntityId, out var meta))
                        {
                            return;
                        }

                        ownerId = meta.PatientId;

                        if (string.IsNullOrWhiteSpace(meta.StorageKey) ||
                            string.IsNullOrWhiteSpace(meta.IvBase64) ||
                            string.IsNullOrWhiteSpace(meta.TagBase64) ||
                            string.IsNullOrWhiteSpace(meta.WrappedKeyJson))
                        {
                            throw new InvalidOperationException($"Encrypted patient file {state.TargetEntityId} is missing storage or envelope metadata.");
                        }

                        var ciphertext = await _r2Pool.GetObjectBytesAsync(isClinic: false, meta.StorageKey, token);
                        var plaintext = _encryptor.DecryptForPatient(ciphertext, meta.IvBase64, meta.TagBase64, meta.WrappedKeyJson, meta.PatientId);
                        var actualSha = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
                        if (!string.IsNullOrWhiteSpace(state.SourceSha256) &&
                            !string.Equals(actualSha, state.SourceSha256, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException($"Decrypt parity SHA-256 mismatch for patient file {state.TargetEntityId}.");
                        }

                        ledgerUpserts.Add(new SyncStorageObjectUpsert(
                            BindingId: bindingId,
                            TargetPlane: state.TargetPlane,
                            TargetEntityId: state.TargetEntityId,
                            OwnerId: meta.PatientId,
                            TenantId: null,
                            SourceProvider: state.SourceProvider,
                            SourceUrl: state.SourceUrl,
                            SourceSizeBytes: state.SourceSizeBytes,
                            SourceContentType: state.SourceContentType,
                            SourceContentTypeCaptured: state.SourceContentTypeCaptured,
                            SourceSha256: state.SourceSha256,
                            TargetBucket: state.TargetBucket,
                            TargetR2Key: meta.StorageKey,
                            EncryptedSizeBytes: state.EncryptedSizeBytes,
                            EncryptedSha256: null,
                            EncryptionKeyScheme: "pmk-v1",
                            Status: SyncStorageStatus.Verified,
                            AttemptDelta: 0,
                            LastErrorCode: null,
                            LastErrorMessage: null,
                            MigratedAt: null,
                            VerifiedAt: DateTimeOffset.UtcNow));
                        Interlocked.Increment(ref verifiedCount);
                    }
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    var errType = ex.GetType().Name;
                    _logger.LogWarning(
                        "Encrypted object verification failed for {Plane} entity {EntityId} (exception {ExceptionType}).",
                        state.TargetPlane,
                        state.TargetEntityId,
                        errType);
                    logVerbose($"Verification failed for {state.TargetPlane} entity {state.TargetEntityId}: {errType}.");

                    ledgerUpserts.Add(new SyncStorageObjectUpsert(
                        BindingId: bindingId,
                        TargetPlane: state.TargetPlane,
                        TargetEntityId: state.TargetEntityId,
                        OwnerId: ownerId,
                        TenantId: tenantId,
                        SourceProvider: state.SourceProvider,
                        SourceUrl: state.SourceUrl,
                        SourceSizeBytes: state.SourceSizeBytes,
                        SourceContentType: state.SourceContentType,
                        SourceContentTypeCaptured: state.SourceContentTypeCaptured,
                        SourceSha256: state.SourceSha256,
                        TargetBucket: state.TargetBucket,
                        TargetR2Key: state.TargetR2Key,
                        EncryptedSizeBytes: state.EncryptedSizeBytes,
                        EncryptedSha256: null,
                        EncryptionKeyScheme: state.EncryptionKeyScheme,
                        Status: SyncStorageStatus.FailedRetryable,
                        AttemptDelta: 1,
                        LastErrorCode: errType,
                        LastErrorMessage: "Encrypted object verification failed in cloud storage.",
                        MigratedAt: null,
                        VerifiedAt: null));
                    Interlocked.Increment(ref failedCount);
                }
            });

        if (!ledgerUpserts.IsEmpty)
        {
            await _ledger.UpsertStorageObjectsBatchAsync(ledgerUpserts.ToList(), ct);
        }

        return (verifiedCount, failedCount);
    }

    private async Task<List<PendingStorageItem>> LoadPendingClinicAttachmentsAsync(SyncBinding binding, CancellationToken ct)
    {
        var items = new List<PendingStorageItem>();
        if (!_connections.HasClinicDb) return items;

        var (whereSql, parameters) = BuildClinicScopePredicate(binding);
        if (whereSql is null) return items;

        try
        {
            await using var conn = await _connections.OpenClinicDbAsync(ct);
            var sql = $"""
                SELECT "Id", "ClinicId", "TenantId", "ContentType", "FileSizeBytes", "StorageUri"
                FROM public."RecordAttachments"
                WHERE {whereSql}
                  AND COALESCE("EncryptionAlgorithm", 'NONE') = 'NONE'
                  AND "StorageUri" IS NOT NULL AND trim("StorageUri") <> ''
                ORDER BY "Id" ASC
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            foreach (var p in parameters) cmd.Parameters.Add(p);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                items.Add(new PendingStorageItem(
                    TargetPlane: SyncStoragePlane.ClinicAttachment,
                    TargetEntityId: r.GetGuid(0),
                    OwnerId: r.GetGuid(1),
                    TenantId: r.IsDBNull(2) ? null : r.GetString(2),
                    OriginalContentType: r.IsDBNull(3) ? null : r.GetString(3),
                    OriginalSizeBytes: r.IsDBNull(4) ? 0L : r.GetInt64(4),
                    SourceUrl: r.GetString(5).Trim()));
            }
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01")
        {
            return items;
        }

        return items;
    }

    private async Task<List<PendingStorageItem>> LoadPendingPatientFilesAsync(SyncBinding binding, CancellationToken ct)
    {
        var items = new List<PendingStorageItem>();
        if (!_connections.HasPatientDb) return items;

        var scopedPatientIds = await ResolveScopedPatientIdsAsync(binding, ct);
        if (scopedPatientIds is { Count: 0 }) return items;

        try
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            var sql = scopedPatientIds is null
                ? """
                  SELECT id, patient_id, mime_type, size_bytes, storage_key
                  FROM public.file_records
                  WHERE is_deleted = false
                    AND COALESCE(encryption_algorithm, 'NONE') = 'NONE'
                    AND storage_key IS NOT NULL AND trim(storage_key) <> ''
                  ORDER BY id ASC
                  """
                : """
                  SELECT id, patient_id, mime_type, size_bytes, storage_key
                  FROM public.file_records
                  WHERE is_deleted = false
                    AND patient_id = ANY(@pids)
                    AND COALESCE(encryption_algorithm, 'NONE') = 'NONE'
                    AND storage_key IS NOT NULL AND trim(storage_key) <> ''
                  ORDER BY id ASC
                  """;

            await using var cmd = new NpgsqlCommand(sql, conn);
            if (scopedPatientIds is not null)
            {
                cmd.Parameters.AddWithValue("pids", scopedPatientIds.ToArray());
            }
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                items.Add(new PendingStorageItem(
                    TargetPlane: SyncStoragePlane.PatientFile,
                    TargetEntityId: r.GetGuid(0),
                    OwnerId: r.GetGuid(1),
                    TenantId: null,
                    OriginalContentType: r.IsDBNull(2) ? null : r.GetString(2),
                    OriginalSizeBytes: r.IsDBNull(3) ? 0L : r.GetInt64(3),
                    SourceUrl: r.GetString(4).Trim()));
            }
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01")
        {
            return items;
        }

        return items;
    }

    private async Task<List<PendingStorageItem>> LoadPendingClinicPatientAvatarsAsync(SyncBinding binding, CancellationToken ct)
    {
        var items = new List<PendingStorageItem>();
        if (!_connections.HasClinicDb) return items;

        var (whereSql, parameters) = BuildClinicScopePredicate(binding);
        if (whereSql is null) return items;

        try
        {
            await using var conn = await _connections.OpenClinicDbAsync(ct);
            var sql = $"""
                SELECT "Id", "ClinicId", "TenantId", "AvatarContentType", "AvatarUrl"
                FROM public."Patients"
                WHERE {whereSql}
                  AND COALESCE("AvatarEncryptionAlgorithm", 'NONE') = 'NONE'
                  AND "AvatarUrl" IS NOT NULL AND btrim("AvatarUrl") <> ''
                ORDER BY "Id" ASC
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            foreach (var p in parameters) cmd.Parameters.Add(p);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                items.Add(new PendingStorageItem(
                    TargetPlane: SyncStoragePlane.ClinicPatientAvatar,
                    TargetEntityId: r.GetGuid(0),
                    OwnerId: r.GetGuid(1),
                    TenantId: r.IsDBNull(2) ? null : r.GetString(2),
                    OriginalContentType: r.IsDBNull(3) ? "image/jpeg" : r.GetString(3),
                    OriginalSizeBytes: 0L,
                    SourceUrl: r.GetString(4).Trim()));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            return items;
        }

        return items;
    }

    private async Task<List<PendingStorageItem>> LoadPendingPatientAvatarsAsync(SyncBinding binding, CancellationToken ct)
    {
        var items = new List<PendingStorageItem>();
        if (!_connections.HasPatientDb) return items;

        var scopedPatientIds = await ResolveScopedPatientIdsAsync(binding, ct);
        if (scopedPatientIds is { Count: 0 }) return items;

        try
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            var sql = scopedPatientIds is null
                ? """
                  SELECT id, avatar_content_type, avatar_url
                  FROM public.patients
                  WHERE is_deleted = false
                    AND COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE'
                    AND avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
                  ORDER BY id ASC
                  """
                : """
                  SELECT id, avatar_content_type, avatar_url
                  FROM public.patients
                  WHERE is_deleted = false
                    AND id = ANY(@pids)
                    AND COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE'
                    AND avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
                  ORDER BY id ASC
                  """;

            await using var cmd = new NpgsqlCommand(sql, conn);
            if (scopedPatientIds is not null)
            {
                cmd.Parameters.AddWithValue("pids", scopedPatientIds.ToArray());
            }
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var patientId = r.GetGuid(0);
                items.Add(new PendingStorageItem(
                    TargetPlane: SyncStoragePlane.PatientAvatar,
                    TargetEntityId: patientId,
                    OwnerId: patientId,
                    TenantId: null,
                    OriginalContentType: r.IsDBNull(1) ? "image/jpeg" : r.GetString(1),
                    OriginalSizeBytes: 0L,
                    SourceUrl: r.GetString(2).Trim()));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            return items;
        }

        return items;
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountClinicScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        var att = await CountClinicAttachmentsScopeAsync(binding, ct);
        var av = await CountClinicPatientAvatarsScopeAsync(binding, ct);
        return (att.Total + av.Total, att.Encrypted + av.Encrypted, att.Pending + av.Pending);
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountClinicAttachmentsScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        if (!_connections.HasClinicDb) return (0, 0, 0);
        var (whereSql, parameters) = BuildClinicScopePredicate(binding);
        if (whereSql is null) return (0, 0, 0);

        try
        {
            await using var conn = await _connections.OpenClinicDbAsync(ct);
            var sql = $"""
                SELECT COUNT(*),
                       COUNT(*) FILTER (WHERE "EncryptionAlgorithm" = 'AES-256-GCM'),
                       COUNT(*) FILTER (WHERE COALESCE("EncryptionAlgorithm", 'NONE') = 'NONE')
                FROM public."RecordAttachments"
                WHERE {whereSql}
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            foreach (var p in parameters) cmd.Parameters.Add(p);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                return (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2));
            }
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01")
        {
            return (0, 0, 0);
        }
        return (0, 0, 0);
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountClinicPatientAvatarsScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        if (!_connections.HasClinicDb) return (0, 0, 0);
        var (whereSql, parameters) = BuildClinicScopePredicate(binding);
        if (whereSql is null) return (0, 0, 0);

        try
        {
            await using var conn = await _connections.OpenClinicDbAsync(ct);
            var sql = $"""
                SELECT COUNT(*),
                       COUNT(*) FILTER (WHERE "AvatarEncryptionAlgorithm" = 'AES-256-GCM'),
                       COUNT(*) FILTER (WHERE COALESCE("AvatarEncryptionAlgorithm", 'NONE') = 'NONE')
                FROM public."Patients"
                WHERE {whereSql}
                  AND "AvatarUrl" IS NOT NULL AND btrim("AvatarUrl") <> ''
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            foreach (var p in parameters) cmd.Parameters.Add(p);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                return (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            return (0, 0, 0);
        }
        return (0, 0, 0);
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountPatientScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        var files = await CountPatientFilesScopeAsync(binding, ct);
        var av = await CountPatientAvatarsScopeAsync(binding, ct);
        return (files.Total + av.Total, files.Encrypted + av.Encrypted, files.Pending + av.Pending);
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountPatientFilesScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        if (!_connections.HasPatientDb) return (0, 0, 0);
        var scopedPatientIds = await ResolveScopedPatientIdsAsync(binding, ct);
        if (scopedPatientIds is { Count: 0 }) return (0, 0, 0);

        try
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            var sql = scopedPatientIds is null
                ? """
                  SELECT COUNT(*),
                         COUNT(*) FILTER (WHERE encryption_algorithm = 'AES-256-GCM'),
                         COUNT(*) FILTER (WHERE COALESCE(encryption_algorithm, 'NONE') = 'NONE')
                  FROM public.file_records
                  WHERE is_deleted = false
                  """
                : """
                  SELECT COUNT(*),
                         COUNT(*) FILTER (WHERE encryption_algorithm = 'AES-256-GCM'),
                         COUNT(*) FILTER (WHERE COALESCE(encryption_algorithm, 'NONE') = 'NONE')
                  FROM public.file_records
                  WHERE is_deleted = false AND patient_id = ANY(@pids)
                  """;

            await using var cmd = new NpgsqlCommand(sql, conn);
            if (scopedPatientIds is not null)
            {
                cmd.Parameters.AddWithValue("pids", scopedPatientIds.ToArray());
            }
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                return (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2));
            }
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01")
        {
            return (0, 0, 0);
        }
        return (0, 0, 0);
    }

    private async Task<(long Total, long Encrypted, long Pending)> CountPatientAvatarsScopeAsync(SyncBinding binding, CancellationToken ct)
    {
        if (!_connections.HasPatientDb) return (0, 0, 0);
        var scopedPatientIds = await ResolveScopedPatientIdsAsync(binding, ct);
        if (scopedPatientIds is { Count: 0 }) return (0, 0, 0);

        try
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            var sql = scopedPatientIds is null
                ? """
                  SELECT COUNT(*),
                         COUNT(*) FILTER (WHERE avatar_encryption_algorithm = 'AES-256-GCM'),
                         COUNT(*) FILTER (WHERE COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE')
                  FROM public.patients
                  WHERE is_deleted = false
                    AND avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
                  """
                : """
                  SELECT COUNT(*),
                         COUNT(*) FILTER (WHERE avatar_encryption_algorithm = 'AES-256-GCM'),
                         COUNT(*) FILTER (WHERE COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE')
                  FROM public.patients
                  WHERE is_deleted = false
                    AND id = ANY(@pids)
                    AND avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
                  """;

            await using var cmd = new NpgsqlCommand(sql, conn);
            if (scopedPatientIds is not null)
            {
                cmd.Parameters.AddWithValue("pids", scopedPatientIds.ToArray());
            }
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                return (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            return (0, 0, 0);
        }
        return (0, 0, 0);
    }

    private static List<PlannedStorageItem> BalanceByPlane(
        List<PlannedStorageItem> items,
        int limit,
        string planeFilter)
    {
        if (limit <= 0 || items.Count == 0)
        {
            return new List<PlannedStorageItem>();
        }

        if (items.Count <= limit)
        {
            return items;
        }

        if (planeFilter == "BOTH")
        {
            var clinicItems = items.Where(p => SyncStoragePlane.IsClinicPlane(p.Item.TargetPlane)).ToList();
            var patientItems = items.Where(p => SyncStoragePlane.IsPatientPlane(p.Item.TargetPlane)).ToList();
            if (clinicItems.Count > 0 && patientItems.Count > 0)
            {
                var clinicQuota = (limit + 1) / 2;
                var patientQuota = limit / 2;

                var clinicTake = Math.Min(clinicItems.Count, clinicQuota);
                var patientTake = Math.Min(patientItems.Count, patientQuota);

                var remaining = limit - (clinicTake + patientTake);
                if (remaining > 0)
                {
                    var extraClinic = Math.Min(remaining, clinicItems.Count - clinicTake);
                    clinicTake += extraClinic;
                    remaining -= extraClinic;
                }
                if (remaining > 0)
                {
                    var extraPatient = Math.Min(remaining, patientItems.Count - patientTake);
                    patientTake += extraPatient;
                }

                var balanced = new List<PlannedStorageItem>(clinicTake + patientTake);
                var maxIdx = Math.Max(clinicTake, patientTake);
                for (var i = 0; i < maxIdx; i++)
                {
                    if (i < clinicTake) balanced.Add(clinicItems[i]);
                    if (i < patientTake) balanced.Add(patientItems[i]);
                }
                return balanced;
            }
        }

        return items.Take(limit).ToList();
    }

    private static bool IsPendingMigratableItem(
        PendingStorageItem item,
        IReadOnlyDictionary<(string TargetPlane, Guid TargetEntityId), SyncStorageObjectState> states)
    {
        if (!LegacyBlobSourceDownloader.ClassifyUrl(item.SourceUrl).IsMigratable) return false;
        if (states.TryGetValue((item.TargetPlane, item.TargetEntityId), out var st) &&
            string.Equals(st.SourceUrl, item.SourceUrl, StringComparison.Ordinal) &&
            (st.Status.StartsWith("SKIPPED_", StringComparison.Ordinal) ||
             st.Status == SyncStorageStatus.FailedPermanent))
        {
            return false;
        }
        return true;
    }

    private static (string? WhereSql, List<NpgsqlParameter> Parameters) BuildClinicScopePredicate(SyncBinding binding)
    {
        var parameters = new List<NpgsqlParameter>();
        if (binding.V2ClinicId.HasValue && !string.IsNullOrWhiteSpace(binding.V2TenantId))
        {
            parameters.Add(new NpgsqlParameter("tid", binding.V2TenantId.Trim()));
            parameters.Add(new NpgsqlParameter("cid", binding.V2ClinicId.Value));
            return (""" "IsDeleted" = false AND "TenantId" = @tid AND "ClinicId" = @cid """, parameters);
        }

        if (binding.V2ClinicId.HasValue)
        {
            parameters.Add(new NpgsqlParameter("cid", binding.V2ClinicId.Value));
            return (""" "IsDeleted" = false AND "ClinicId" = @cid """, parameters);
        }

        if (!string.IsNullOrWhiteSpace(binding.V2TenantId))
        {
            parameters.Add(new NpgsqlParameter("tid", binding.V2TenantId.Trim()));
            return (""" "IsDeleted" = false AND "TenantId" = @tid """, parameters);
        }

        if (string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase))
        {
            return (""" "IsDeleted" = false """, parameters);
        }

        return (null, parameters);
    }

    /// <summary>
    /// Returns null for Global (unfiltered) Patient plane, or a distinct list of scoped patient UUIDs.
    /// </summary>
    private async Task<List<Guid>?> ResolveScopedPatientIdsAsync(SyncBinding binding, CancellationToken ct)
    {
        if (string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase) ||
            (!binding.V2ClinicId.HasValue && !binding.V1ClinicId.HasValue && !binding.V1OrgId.HasValue))
        {
            return null;
        }

        var set = new HashSet<Guid>();
        var fromLedger = await _ledger.GetScopedPatientV2IdsForBindingCoordsAsync(
            binding.V1ClinicId, binding.V1OrgId, binding.V2ClinicId, ct);
        foreach (var id in fromLedger) set.Add(id);

        if (binding.V2ClinicId.HasValue && _connections.HasPatientDb)
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            try
            {
                await using var memCmd = new NpgsqlCommand(
                    "SELECT patient_id FROM public.clinic_memberships WHERE clinic_id = @cid AND is_deleted = false", conn);
                memCmd.Parameters.AddWithValue("cid", binding.V2ClinicId.Value);
                await using var mr = await memCmd.ExecuteReaderAsync(ct);
                while (await mr.ReadAsync(ct)) set.Add(mr.GetGuid(0));
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                // clinic_memberships table absent in minimal schema
            }

            try
            {
                await using var frCmd = new NpgsqlCommand(
                    "SELECT DISTINCT patient_id FROM public.file_records WHERE clinic_id = @cid AND is_deleted = false", conn);
                frCmd.Parameters.AddWithValue("cid", binding.V2ClinicId.Value);
                await using var fr = await frCmd.ExecuteReaderAsync(ct);
                while (await fr.ReadAsync(ct)) set.Add(fr.GetGuid(0));
            }
            catch (PostgresException ex) when (ex.SqlState == "42P01")
            {
                // file_records table absent
            }
        }

        return set.ToList();
    }

    private async Task<bool> UpdateClinicAttachmentCryptoAsync(
        Guid attachmentId,
        string storageKey,
        long downloadedSizeBytes,
        string contentType,
        Track3EncryptedPayload encrypted,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenClinicDbAsync(ct);
        const string sql = """
            UPDATE public."RecordAttachments"
            SET "StorageUri" = @key,
                "FileSizeBytes" = CASE WHEN "FileSizeBytes" <= 0 THEN @srcSize ELSE "FileSizeBytes" END,
                "ContentType" = @ctype,
                "EncryptionAlgorithm" = 'AES-256-GCM',
                "EncryptionKeyId" = 'cmk-v1',
                "EncryptionIvBase64" = @iv,
                "EncryptionTagBase64" = @tag,
                "EncryptedSizeBytes" = @encSize,
                "EncryptedHash" = @encHash,
                "WrappedKeyJson" = @wrappedKey,
                "UpdatedAt" = now(),
                "UpdatedBy" = @actor
            WHERE "Id" = @id
              AND "IsDeleted" = false
              AND COALESCE("EncryptionAlgorithm", 'NONE') = 'NONE'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", attachmentId);
        cmd.Parameters.AddWithValue("key", storageKey);
        cmd.Parameters.AddWithValue("srcSize", downloadedSizeBytes);
        cmd.Parameters.AddWithValue("ctype", contentType.Length > 100 ? contentType[..100] : contentType);
        cmd.Parameters.AddWithValue("iv", encrypted.IvBase64);
        cmd.Parameters.AddWithValue("tag", encrypted.TagBase64);
        cmd.Parameters.AddWithValue("encSize", encrypted.EncryptedSizeBytes);
        cmd.Parameters.AddWithValue("encHash", encrypted.EncryptedHash);
        cmd.Parameters.AddWithValue("wrappedKey", encrypted.WrappedKeyJson);
        cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private async Task<bool> UpdatePatientFileCryptoAsync(
        Guid fileId,
        string storageKey,
        long downloadedSizeBytes,
        string contentType,
        Track3EncryptedPayload encrypted,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenPatientDbAsync(ct);
        const string sql = """
            UPDATE public.file_records
            SET storage_key = @key,
                size_bytes = CASE WHEN size_bytes <= 0 THEN @srcSize ELSE size_bytes END,
                mime_type = COALESCE(NULLIF(@ctype, 'application/octet-stream'), mime_type, @ctype),
                encryption_algorithm = 'AES-256-GCM',
                encryption_key_id = 'pmk-v1',
                encryption_iv_base64 = @iv,
                encryption_tag_base64 = @tag,
                encrypted_size_bytes = @encSize,
                encrypted_hash = @encHash,
                wrapped_key_json = @wrappedKey,
                updated_at = now(),
                updated_by = @actor
            WHERE id = @id
              AND is_deleted = false
              AND COALESCE(encryption_algorithm, 'NONE') = 'NONE'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", fileId);
        cmd.Parameters.AddWithValue("key", storageKey);
        cmd.Parameters.AddWithValue("srcSize", downloadedSizeBytes);
        cmd.Parameters.AddWithValue("ctype", contentType.Length > 100 ? contentType[..100] : contentType);
        cmd.Parameters.AddWithValue("iv", encrypted.IvBase64);
        cmd.Parameters.AddWithValue("tag", encrypted.TagBase64);
        cmd.Parameters.AddWithValue("encSize", encrypted.EncryptedSizeBytes);
        cmd.Parameters.AddWithValue("encHash", encrypted.EncryptedHash);
        cmd.Parameters.AddWithValue("wrappedKey", encrypted.WrappedKeyJson);
        cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private async Task<(bool Exists, bool IsDeleted, string? EncryptionAlgorithm, string? StorageUri, long? EncryptedSizeBytes)> GetClinicAttachmentStateAsync(
        Guid attachmentId,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenClinicDbAsync(ct);
        const string sql = """
            SELECT "IsDeleted", "EncryptionAlgorithm", "StorageUri", "EncryptedSizeBytes"
            FROM public."RecordAttachments"
            WHERE "Id" = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", attachmentId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
        {
            return (false, false, null, null, null);
        }
        return (
            true,
            r.GetBoolean(0),
            r.IsDBNull(1) ? null : r.GetString(1),
            r.IsDBNull(2) ? null : r.GetString(2),
            r.IsDBNull(3) ? null : r.GetInt64(3));
    }

    private async Task<(bool Exists, bool IsDeleted, string? EncryptionAlgorithm, string? StorageKey, long? EncryptedSizeBytes)> GetPatientFileStateAsync(
        Guid fileId,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenPatientDbAsync(ct);
        const string sql = """
            SELECT is_deleted, encryption_algorithm, storage_key, encrypted_size_bytes
            FROM public.file_records
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", fileId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
        {
            return (false, false, null, null, null);
        }
        return (
            true,
            r.GetBoolean(0),
            r.IsDBNull(1) ? null : r.GetString(1),
            r.IsDBNull(2) ? null : r.GetString(2),
            r.IsDBNull(3) ? null : r.GetInt64(3));
    }

    private async Task<Dictionary<Guid, ClinicCryptoMeta>> LoadClinicCryptoMetadataAsync(Guid[] ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, ClinicCryptoMeta>();
        if (ids.Length == 0 || !_connections.HasClinicDb) return map;

        await using var conn = await _connections.OpenClinicDbAsync(ct);
        const string sql = """
            SELECT "Id", "TenantId", "ClinicId", "StorageUri",
                   "EncryptionIvBase64", "EncryptionTagBase64", "WrappedKeyJson"
            FROM public."RecordAttachments"
            WHERE "Id" = ANY(@ids)
              AND "IsDeleted" = false
              AND "EncryptionAlgorithm" = 'AES-256-GCM'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("ids", ids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = new ClinicCryptoMeta(
                TenantId: r.GetString(1),
                ClinicId: r.GetGuid(2),
                StorageUri: r.IsDBNull(3) ? null : r.GetString(3),
                IvBase64: r.IsDBNull(4) ? null : r.GetString(4),
                TagBase64: r.IsDBNull(5) ? null : r.GetString(5),
                WrappedKeyJson: r.IsDBNull(6) ? null : r.GetString(6));
        }
        return map;
    }

    private async Task<Dictionary<Guid, PatientCryptoMeta>> LoadPatientCryptoMetadataAsync(Guid[] ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, PatientCryptoMeta>();
        if (ids.Length == 0 || !_connections.HasPatientDb) return map;

        await using var conn = await _connections.OpenPatientDbAsync(ct);
        const string sql = """
            SELECT id, patient_id, storage_key,
                   encryption_iv_base64, encryption_tag_base64, wrapped_key_json
            FROM public.file_records
            WHERE id = ANY(@ids)
              AND is_deleted = false
              AND encryption_algorithm = 'AES-256-GCM'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("ids", ids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = new PatientCryptoMeta(
                PatientId: r.GetGuid(1),
                StorageKey: r.IsDBNull(2) ? null : r.GetString(2),
                IvBase64: r.IsDBNull(3) ? null : r.GetString(3),
                TagBase64: r.IsDBNull(4) ? null : r.GetString(4),
                WrappedKeyJson: r.IsDBNull(5) ? null : r.GetString(5));
        }
        return map;
    }

    private async Task<bool> UpdateClinicPatientAvatarCryptoAsync(
        Guid patientId,
        string storageKey,
        string contentType,
        Track3EncryptedPayload encrypted,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenClinicDbAsync(ct);
        const string sql = """
            UPDATE public."Patients"
            SET "AvatarUrl" = @key,
                "AvatarContentType" = @ctype,
                "AvatarEncryptionAlgorithm" = 'AES-256-GCM',
                "AvatarEncryptionKeyId" = 'cmk-v1',
                "AvatarEncryptionIvBase64" = @iv,
                "AvatarEncryptionTagBase64" = @tag,
                "AvatarEncryptedSizeBytes" = @encSize,
                "AvatarEncryptedHash" = @encHash,
                "AvatarWrappedKeyJson" = @wrappedKey,
                "UpdatedAt" = now(),
                "UpdatedBy" = @actor
            WHERE "Id" = @id
              AND "IsDeleted" = false
              AND "AvatarUrl" IS NOT NULL AND btrim("AvatarUrl") <> ''
              AND COALESCE("AvatarEncryptionAlgorithm", 'NONE') = 'NONE'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", patientId);
        cmd.Parameters.AddWithValue("key", storageKey);
        cmd.Parameters.AddWithValue("ctype", contentType.Length > 100 ? contentType[..100] : contentType);
        cmd.Parameters.AddWithValue("iv", encrypted.IvBase64);
        cmd.Parameters.AddWithValue("tag", encrypted.TagBase64);
        cmd.Parameters.AddWithValue("encSize", encrypted.EncryptedSizeBytes);
        cmd.Parameters.AddWithValue("encHash", encrypted.EncryptedHash);
        cmd.Parameters.AddWithValue("wrappedKey", encrypted.WrappedKeyJson);
        cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private async Task<bool> UpdatePatientAvatarCryptoAsync(
        Guid patientId,
        string storageKey,
        string contentType,
        Track3EncryptedPayload encrypted,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenPatientDbAsync(ct);
        const string sql = """
            UPDATE public.patients
            SET avatar_url = @key,
                avatar_content_type = @ctype,
                avatar_encryption_algorithm = 'AES-256-GCM',
                avatar_encryption_key_id = 'pmk-v1',
                avatar_encryption_iv_base64 = @iv,
                avatar_encryption_tag_base64 = @tag,
                avatar_encrypted_size_bytes = @encSize,
                avatar_encrypted_hash = @encHash,
                avatar_wrapped_key_json = @wrappedKey,
                updated_at = now(),
                updated_by = @actor
            WHERE id = @id
              AND is_deleted = false
              AND avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
              AND COALESCE(avatar_encryption_algorithm, 'NONE') = 'NONE'
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", patientId);
        cmd.Parameters.AddWithValue("key", storageKey);
        cmd.Parameters.AddWithValue("ctype", contentType.Length > 100 ? contentType[..100] : contentType);
        cmd.Parameters.AddWithValue("iv", encrypted.IvBase64);
        cmd.Parameters.AddWithValue("tag", encrypted.TagBase64);
        cmd.Parameters.AddWithValue("encSize", encrypted.EncryptedSizeBytes);
        cmd.Parameters.AddWithValue("encHash", encrypted.EncryptedHash);
        cmd.Parameters.AddWithValue("wrappedKey", encrypted.WrappedKeyJson);
        cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private async Task<(bool Exists, bool IsDeleted, string? EncryptionAlgorithm, string? StorageUri, long? EncryptedSizeBytes)> GetClinicPatientAvatarStateAsync(
        Guid patientId,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenClinicDbAsync(ct);
        const string sql = """
            SELECT "IsDeleted", "AvatarEncryptionAlgorithm", "AvatarUrl", "AvatarEncryptedSizeBytes"
            FROM public."Patients"
            WHERE "Id" = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", patientId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
        {
            return (false, false, null, null, null);
        }
        var url = r.IsDBNull(2) ? null : r.GetString(2);
        return (
            !string.IsNullOrWhiteSpace(url),
            r.GetBoolean(0),
            r.IsDBNull(1) ? null : r.GetString(1),
            url,
            r.IsDBNull(3) ? null : r.GetInt64(3));
    }

    private async Task<(bool Exists, bool IsDeleted, string? EncryptionAlgorithm, string? StorageKey, long? EncryptedSizeBytes)> GetPatientAvatarStateAsync(
        Guid patientId,
        CancellationToken ct)
    {
        await using var conn = await _connections.OpenPatientDbAsync(ct);
        const string sql = """
            SELECT is_deleted, avatar_encryption_algorithm, avatar_url, avatar_encrypted_size_bytes
            FROM public.patients
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", patientId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
        {
            return (false, false, null, null, null);
        }
        var url = r.IsDBNull(2) ? null : r.GetString(2);
        return (
            !string.IsNullOrWhiteSpace(url),
            r.GetBoolean(0),
            r.IsDBNull(1) ? null : r.GetString(1),
            url,
            r.IsDBNull(3) ? null : r.GetInt64(3));
    }

    private async Task<Dictionary<Guid, ClinicCryptoMeta>> LoadClinicPatientAvatarCryptoMetadataAsync(Guid[] ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, ClinicCryptoMeta>();
        if (ids.Length == 0 || !_connections.HasClinicDb) return map;

        try
        {
            await using var conn = await _connections.OpenClinicDbAsync(ct);
            const string sql = """
                SELECT "Id", "TenantId", "ClinicId", "AvatarUrl",
                       "AvatarEncryptionIvBase64", "AvatarEncryptionTagBase64", "AvatarWrappedKeyJson"
                FROM public."Patients"
                WHERE "Id" = ANY(@ids)
                  AND "IsDeleted" = false
                  AND "AvatarEncryptionAlgorithm" = 'AES-256-GCM'
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("ids", ids);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                map[r.GetGuid(0)] = new ClinicCryptoMeta(
                    TenantId: r.GetString(1),
                    ClinicId: r.GetGuid(2),
                    StorageUri: r.IsDBNull(3) ? null : r.GetString(3),
                    IvBase64: r.IsDBNull(4) ? null : r.GetString(4),
                    TagBase64: r.IsDBNull(5) ? null : r.GetString(5),
                    WrappedKeyJson: r.IsDBNull(6) ? null : r.GetString(6));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            // Columns absent
        }
        return map;
    }

    private async Task<Dictionary<Guid, PatientCryptoMeta>> LoadPatientAvatarCryptoMetadataAsync(Guid[] ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, PatientCryptoMeta>();
        if (ids.Length == 0 || !_connections.HasPatientDb) return map;

        try
        {
            await using var conn = await _connections.OpenPatientDbAsync(ct);
            const string sql = """
                SELECT id, avatar_url,
                       avatar_encryption_iv_base64, avatar_encryption_tag_base64, avatar_wrapped_key_json
                FROM public.patients
                WHERE id = ANY(@ids)
                  AND is_deleted = false
                  AND avatar_encryption_algorithm = 'AES-256-GCM'
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("ids", ids);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var pid = r.GetGuid(0);
                map[pid] = new PatientCryptoMeta(
                    PatientId: pid,
                    StorageKey: r.IsDBNull(1) ? null : r.GetString(1),
                    IvBase64: r.IsDBNull(2) ? null : r.GetString(2),
                    TagBase64: r.IsDBNull(3) ? null : r.GetString(3),
                    WrappedKeyJson: r.IsDBNull(4) ? null : r.GetString(4));
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "42703")
        {
            // Columns absent
        }
        return map;
    }

    private static SyncRunSummary SnapshotSummary(SyncRunSummary s) => new()
    {
        Track = s.Track,
        Mode = s.Mode,
        SampleLimit = s.SampleLimit,
        BatchSize = s.BatchSize,
        DurationMs = s.DurationMs,
        CohortPatientCount = s.CohortPatientCount,
        StartChangelogSeq = s.StartChangelogSeq,
        EndChangelogSeq = s.EndChangelogSeq,
        CurrentStage = s.CurrentStage,
        StageIndex = s.StageIndex,
        TotalStages = s.TotalStages,
        ProcessedItems = s.ProcessedItems,
        TotalItems = s.TotalItems,
        PercentComplete = s.PercentComplete,
        LastProgressAtUtc = s.LastProgressAtUtc,
        CustomFieldsProvisioned = new List<string>(s.CustomFieldsProvisioned),
        Entities = new Dictionary<string, EntitySyncCounter>(s.Entities, StringComparer.OrdinalIgnoreCase),
        Notes = new List<string>(s.Notes),
        VerboseLogs = new List<string>(s.VerboseLogs),
        BytesDownloaded = s.BytesDownloaded,
        BytesUploaded = s.BytesUploaded,
        TransferRateMbps = s.TransferRateMbps,
        ClinicCopiesMigrated = s.ClinicCopiesMigrated,
        PatientCopiesMigrated = s.PatientCopiesMigrated,
        SkippedCount = s.SkippedCount,
        FailedCount = s.FailedCount,
        OverlapSavedDownloads = s.OverlapSavedDownloads
    };

    private static string NormalizeProviderFilter(string? raw)
    {
        var norm = raw?.Trim().ToUpperInvariant();
        return norm switch
        {
            "AZURE_BLOB_1" or "AZURE_BLOB" => "AZURE_BLOB_1",
            "VERCEL_BLOB" => "VERCEL_BLOB",
            _ => "ALL"
        };
    }

    private static string NormalizePlaneFilter(string? raw)
    {
        var norm = raw?.Trim().ToUpperInvariant();
        return norm switch
        {
            "CLINIC_ONLY" or "CLINIC" or SyncStoragePlane.ClinicAttachment or SyncStoragePlane.ClinicPatientAvatar => "CLINIC_ONLY",
            "PATIENT_ONLY" or "PATIENT" or SyncStoragePlane.PatientFile or SyncStoragePlane.PatientAvatar => "PATIENT_ONLY",
            _ => "BOTH"
        };
    }

    private static bool MatchesVerificationFilters(SyncStorageObjectState state, string planeFilter, string providerFilter)
    {
        if (planeFilter == "CLINIC_ONLY" && !SyncStoragePlane.IsClinicPlane(state.TargetPlane)) return false;
        if (planeFilter == "PATIENT_ONLY" && !SyncStoragePlane.IsPatientPlane(state.TargetPlane)) return false;
        if (providerFilter == "AZURE_BLOB_1" && state.SourceProvider != SyncStorageProvider.AzureBlob1) return false;
        if (providerFilter == "VERCEL_BLOB" && state.SourceProvider != SyncStorageProvider.VercelBlob) return false;
        return true;
    }

    private sealed record PendingStorageItem(
        string TargetPlane,
        Guid TargetEntityId,
        Guid OwnerId,
        string? TenantId,
        string? OriginalContentType,
        long OriginalSizeBytes,
        string SourceUrl
    );

    private sealed record PlannedStorageItem(
        PendingStorageItem Item,
        UrlClassification Classification
    );

    private sealed record ClinicCryptoMeta(
        string TenantId,
        Guid ClinicId,
        string? StorageUri,
        string? IvBase64,
        string? TagBase64,
        string? WrappedKeyJson
    );

    private sealed record PatientCryptoMeta(
        Guid PatientId,
        string? StorageKey,
        string? IvBase64,
        string? TagBase64,
        string? WrappedKeyJson
    );
}
