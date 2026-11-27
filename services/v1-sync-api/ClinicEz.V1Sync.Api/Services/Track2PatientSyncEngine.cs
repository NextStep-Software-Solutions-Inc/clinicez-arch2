using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Track 2 (patient-api / CLINICEZ-PATIENT_DB) migration & indefinite one-way sync engine.
/// Syncs Group A (self-owned profiles + ALL files including PRIVATE, zero Auth0 schemas,
/// Clerk-first adoption on `user_*`) and Group B (bound-clinic read-only clinical copies
/// reusing the exact deterministic UUIDv5 IDs from Track 1).
/// </summary>
public sealed class Track2PatientSyncEngine
{
    private const int DefaultBatchSize = 200;
    private const int CdcDrainBatchSize = 5000;
    private const int MaxCdcDrainIterations = 1000;
    private static readonly TimeSpan ManilaOffset = TimeSpan.FromHours(8);
    private static readonly JsonSerializerOptions WebJsonOpts = new(JsonSerializerDefaults.Web);
    private static readonly AsyncLocal<RunProgressState?> ActiveRunProgress = new();

    private sealed class RunProgressState
    {
        public Guid RunId { get; init; }
        public int BatchSize { get; init; }
        public Stopwatch Stopwatch { get; init; } = null!;
        public SyncRunSummary Summary { get; init; } = null!;
        public bool TrackLiveProgress { get; init; }
        public int StageIndex { get; set; }
        public int TotalStages { get; set; }
        public string StageName { get; set; } = string.Empty;
        public long LastFlushElapsedMs { get; set; } = -1000;
    }

    private int EffectiveBatchSize => ActiveRunProgress.Value?.BatchSize ?? DefaultBatchSize;

    private async Task BeginStageAsync(
        int stageIndex,
        int totalStages,
        string stageName,
        int totalItems,
        CancellationToken ct)
    {
        var state = ActiveRunProgress.Value;
        if (state is null) return;

        state.StageIndex = stageIndex;
        state.TotalStages = totalStages;
        state.StageName = stageName;
        state.Summary.StageIndex = stageIndex;
        state.Summary.TotalStages = totalStages;
        state.Summary.CurrentStage = stageName;
        state.Summary.ProcessedItems = 0;
        state.Summary.TotalItems = totalItems;
        state.Summary.DurationMs = state.Stopwatch.ElapsedMilliseconds;
        state.Summary.PercentComplete = totalStages > 0
            ? Math.Clamp((int)Math.Floor(((stageIndex - 1) / (double)totalStages) * 100.0), 0, 99)
            : 0;
        state.Summary.LastProgressAtUtc = DateTimeOffset.UtcNow;

        var totalBatches = totalItems > 0 ? (int)Math.Ceiling(totalItems / (double)state.BatchSize) : 0;
        state.Summary.AppendVerboseLog(
            $"Stage {stageIndex}/{totalStages}: {stageName} — starting ({totalItems:N0} account(s), {totalBatches} batch(es) of {state.BatchSize})");

        if (state.TrackLiveProgress)
        {
            state.LastFlushElapsedMs = state.Stopwatch.ElapsedMilliseconds;
            await _ledger.UpdateRunProgressAsync(state.RunId, state.Summary, ct);
        }
    }

    private async Task ReportBatchProgressAsync(
        int processedInStage,
        int totalInStage,
        int batchNumber,
        int totalBatches,
        bool forceFlush,
        CancellationToken ct)
    {
        var state = ActiveRunProgress.Value;
        if (state is null) return;

        state.Summary.ProcessedItems = processedInStage;
        state.Summary.TotalItems = totalInStage;
        state.Summary.DurationMs = state.Stopwatch.ElapsedMilliseconds;
        state.Summary.LastProgressAtUtc = DateTimeOffset.UtcNow;

        if (state.TotalStages > 0)
        {
            var stageFraction = totalInStage > 0 ? Math.Clamp(processedInStage / (double)totalInStage, 0.0, 1.0) : 1.0;
            var overall = ((Math.Max(0, state.StageIndex - 1) + stageFraction) / state.TotalStages) * 100.0;
            state.Summary.PercentComplete = Math.Clamp((int)Math.Floor(overall), 0, 99);
        }

        var totals = state.Summary.Entities.Values;
        var createdSum = totals.Sum(e => e.Created);
        var updatedSum = totals.Sum(e => e.Updated);
        var unchangedSum = totals.Sum(e => e.Unchanged);
        var skippedSum = totals.Sum(e => e.SkippedV2Wins);
        state.Summary.AppendVerboseLog(
            $"Stage {state.StageIndex}/{state.TotalStages} batch {batchNumber}/{totalBatches} ({processedInStage:N0}/{totalInStage:N0}) — +{createdSum:N0} added, {updatedSum:N0} updated, {unchangedSum:N0} unchanged, {skippedSum:N0} kept v2");

        if (state.TrackLiveProgress &&
            (forceFlush || state.Stopwatch.ElapsedMilliseconds - state.LastFlushElapsedMs >= 300))
        {
            state.LastFlushElapsedMs = state.Stopwatch.ElapsedMilliseconds;
            await _ledger.UpdateRunProgressAsync(state.RunId, state.Summary, ct);
        }
    }

    private async IAsyncEnumerable<int[]> EnumerateBatchesAsync(
        IReadOnlyList<int> ids,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var batchSize = EffectiveBatchSize;
        var totalBatches = ids.Count > 0 ? (int)Math.Ceiling(ids.Count / (double)batchSize) : 0;
        var processed = 0;
        var batchNumber = 0;
        foreach (var chunk in ids.Chunk(batchSize))
        {
            ct.ThrowIfCancellationRequested();
            batchNumber++;
            yield return chunk;
            processed += chunk.Length;
            await ReportBatchProgressAsync(processed, ids.Count, batchNumber, totalBatches, processed >= ids.Count, ct);
        }
    }

    private readonly SyncConnectionFactory _connections;
    private readonly SyncLedgerRepository _ledger;
    private readonly ILogger<Track2PatientSyncEngine> _logger;
    private readonly ScopedCdcIdResolver _cdcResolver;

    public Track2PatientSyncEngine(
        SyncConnectionFactory connections,
        SyncLedgerRepository ledger,
        ILogger<Track2PatientSyncEngine> logger,
        ScopedCdcIdResolver? cdcResolver = null)
    {
        _connections = connections;
        _ledger = ledger;
        _logger = logger;
        _cdcResolver = cdcResolver ?? new ScopedCdcIdResolver();
    }

    public async Task<SyncRunRecord> RunAsync(
        SyncBinding binding,
        string mode,
        int? sampleLimit,
        bool forceV1OnConflict,
        string triggeredBy,
        CancellationToken ct,
        Guid? existingRunId = null,
        int? batchSizeOverride = null)
    {
        var isDryRun = string.Equals(mode, SyncRunMode.DryRun, StringComparison.OrdinalIgnoreCase);
        var isIncremental = string.Equals(mode, SyncRunMode.Incremental, StringComparison.OrdinalIgnoreCase);
        var isFinalSweep = string.Equals(mode, SyncRunMode.FinalSweep, StringComparison.OrdinalIgnoreCase);
        var isGlobal = string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase);

        if (!isGlobal && !binding.V1ClinicId.HasValue && !binding.V1OrgId.HasValue)
        {
            throw new InvalidOperationException("Scoped Track 2 binding requires V1ClinicId or V1OrgId (or switch cohort mode to GLOBAL).");
        }

        var effectiveBatchSize = Math.Clamp(batchSizeOverride ?? binding.BatchSize, 10, 1000);
        var totalStages = binding.V1ClinicId.HasValue && binding.V2ClinicId.HasValue ? 3 : 2;
        var summary = new SyncRunSummary
        {
            Track = binding.Track,
            Mode = mode,
            SampleLimit = sampleLimit,
            BatchSize = effectiveBatchSize,
            CurrentStage = "Resolving patient account cohort...",
            StageIndex = 0,
            TotalStages = totalStages,
            PercentComplete = 0,
            LastProgressAtUtc = DateTimeOffset.UtcNow
        };
        summary.AppendVerboseLog($"Initialized Track 2 {mode} (scope: {binding.PatientCohortMode}, batch size: {effectiveBatchSize}, dryRun: {isDryRun})");

        var runId = existingRunId ?? await _ledger.StartRunAsync(binding.Id, mode, sampleLimit, triggeredBy, ct, summary);
        var sw = Stopwatch.StartNew();
        var shieldedInRun = new HashSet<(string EntityType, string V1Id)>();
        var prevProgress = ActiveRunProgress.Value;
        ActiveRunProgress.Value = new RunProgressState
        {
            RunId = runId,
            BatchSize = effectiveBatchSize,
            Stopwatch = sw,
            Summary = summary,
            TrackLiveProgress = !isIncremental
        };

        try
        {
            if (!isIncremental)
            {
                await _ledger.UpdateRunProgressAsync(runId, summary, ct);
            }
            await using var v1 = await _connections.OpenV1SourceAsync(ct);
            await using var v2 = await _connections.OpenPatientDbAsync(ct);

            var startSeq = await _ledger.GetCursorAsync(binding.Id, ct);
            var (changelogExists, rawMaxSeq, safeMaxSeq) = await ReadV1ChangelogBoundsAsync(v1, ct);
            if (changelogExists && startSeq > rawMaxSeq)
            {
                _logger.LogWarning(
                    "Track 2 detected v1 changelog sequence reset for binding {BindingId} (cursor #{StartSeq} > max #{RawMaxSeq}); resetting cursor to 0.",
                    binding.Id, startSeq, rawMaxSeq);
                startSeq = 0;
                if (!isDryRun)
                {
                    await _ledger.UpdateCursorAsync(binding.Id, 0, ct, allowReset: true);
                }
            }
            var maxSeq = safeMaxSeq;
            summary.StartChangelogSeq = startSeq;
            summary.EndChangelogSeq = maxSeq;

            var fileTypes = await LoadLookupAsync(v1, """SELECT id, name FROM public."FileType" """, ct);
            var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
            string? resolvedFacilityName = null;
            if (binding.V1ClinicId.HasValue && binding.V2ClinicId.HasValue)
            {
                resolvedFacilityName = await EnsureTargetClinicRowAsync(v1, v2, binding, isDryRun, ct);
            }

            if (isIncremental)
            {
                var (affectedUsers, endSeq, rawEvents, deletedEventsCount) = changelogExists
                    ? await RunIncrementalCdcLoopAsync(
                        v1, v2, binding, runId, isGlobal, startSeq, fileTypes, clinicians, resolvedFacilityName,
                        isDryRun, forceV1OnConflict, summary, shieldedInRun, ct)
                    : (0, startSeq, 0, 0);

                summary.EndChangelogSeq = endSeq;
                summary.CohortPatientCount = affectedUsers;
                if (rawEvents == 0 || (affectedUsers == 0 && deletedEventsCount == 0))
                {
                    if (!isDryRun && changelogExists)
                    {
                        await _ledger.UpdateCursorAsync(binding.Id, Math.Max(startSeq, endSeq), ct);
                    }
                    summary.Notes.Add(changelogExists
                        ? "No Track 2 changes since last changelog cursor."
                        : "Live change tracking is not enabled on Classic Clinic EZ (v1); skipped incremental changelog poll. Install Live Tracking SQL or run Full Migration / Final Sweep.");
                    if (deletedEventsCount == 0 &&
                        existingRunId is null &&
                        string.Equals(triggeredBy, "AutoSyncWorker", StringComparison.Ordinal))
                    {
                        sw.Stop();
                        summary.DurationMs = sw.ElapsedMilliseconds;
                        // Avoid burying real migrations in `sync_runs` with idle 0-change AutoSyncWorker polls
                        await _ledger.DeleteRunAsync(runId, ct);
                        var nowUtc = DateTimeOffset.UtcNow;
                        return new SyncRunRecord(
                            runId, binding.Id, mode, sampleLimit, SyncRunStatus.Completed, triggeredBy,
                            nowUtc.AddMilliseconds(-summary.DurationMs), nowUtc,
                            JsonSerializer.SerializeToElement(summary, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
                            null);
                    }
                }
            }
            else if (isFinalSweep)
            {
                // 1. Pre-drain CDC backlog in bounded batches, advancing cursor per batch (skipped cleanly if tracking is not installed)
                long preSeq;
                if (changelogExists)
                {
                    preSeq = await PreDrainChangelogAsync(v1, v2, binding, runId, isGlobal, startSeq, isDryRun, summary, shieldedInRun, ct);
                }
                else
                {
                    preSeq = startSeq;
                    summary.Notes.Add("Live change tracking is not enabled on Classic Clinic EZ (v1); running full-cohort Final Verification Sweep without changelog drain.");
                    summary.AppendVerboseLog("Live change tracking not installed on v1; skipping pre-sweep changelog drain.");
                }

                // 2. Full active cohort sweep + Deletion Shield for previously mapped out-of-scope/deleted patients
                var cohortUserIds = await LoadCohortUsersAsync(v1, binding, isGlobal, ct);
                await ApplyMappedPatientsDeletionShieldAsync(v2, binding, runId, cohortUserIds, isDryRun, summary, shieldedInRun, ct);

                summary.CohortPatientCount = cohortUserIds.Count;
                _logger.LogInformation(
                    "Track 2 {Mode} starting for binding {BindingId} (cohort={CohortMode}, count={Count}, dryRun={DryRun}).",
                    mode, binding.Id, binding.PatientCohortMode, cohortUserIds.Count, isDryRun);

                if (cohortUserIds.Count > 0)
                {
                    await ExecuteTrack2PipelineAsync(
                        v1, v2, binding, runId, cohortUserIds, fileTypes, clinicians, resolvedFacilityName,
                        isDryRun, forceV1OnConflict, summary, shieldedInRun, ct);
                }

                // 3. Post-drain CDC backlog that arrived during the full sweep
                if (changelogExists)
                {
                    var (_, postEndSeq, _, _) = await RunIncrementalCdcLoopAsync(
                        v1, v2, binding, runId, isGlobal, preSeq, fileTypes, clinicians, resolvedFacilityName,
                        isDryRun, forceV1OnConflict, summary, shieldedInRun, ct);
                    summary.EndChangelogSeq = Math.Max(preSeq, postEndSeq);
                }
                else
                {
                    summary.EndChangelogSeq = preSeq;
                }
            }
            else
            {
                var cohortUserIds = sampleLimit is > 0
                    ? await SelectDiversePatientSampleAsync(v1, binding, isGlobal, sampleLimit.Value, ct)
                    : await LoadCohortUsersAsync(v1, binding, isGlobal, ct);

                if (sampleLimit is not > 0)
                {
                    await ApplyMappedPatientsDeletionShieldAsync(v2, binding, runId, cohortUserIds, isDryRun, summary, shieldedInRun, ct);
                }

                summary.CohortPatientCount = cohortUserIds.Count;
                _logger.LogInformation(
                    "Track 2 {Mode} starting for binding {BindingId} (cohort={CohortMode}, count={Count}, dryRun={DryRun}).",
                    mode, binding.Id, binding.PatientCohortMode, cohortUserIds.Count, isDryRun);

                if (cohortUserIds.Count > 0)
                {
                    await ExecuteTrack2PipelineAsync(
                        v1, v2, binding, runId, cohortUserIds, fileTypes, clinicians, resolvedFacilityName,
                        isDryRun, forceV1OnConflict, summary, shieldedInRun, ct);
                }

                if (!isDryRun && summary.EndChangelogSeq >= startSeq)
                {
                    await _ledger.UpdateCursorAsync(binding.Id, summary.EndChangelogSeq, ct);
                }
            }

            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            summary.CurrentStage = "Completed";
            summary.StageIndex = summary.TotalStages;
            summary.PercentComplete = 100;
            summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
            summary.AppendVerboseLog($"Completed Track 2 {mode} in {summary.DurationMs:N0} ms (cursor #{summary.EndChangelogSeq:N0})");
            await _ledger.CompleteRunAsync(runId, summary, ct);
            await _ledger.AppendAuditAsync(binding.Id, $"TRACK2_{mode}_COMPLETED", triggeredBy, new
            {
                runId,
                cohortMode = binding.PatientCohortMode,
                cohortCount = summary.CohortPatientCount,
                durationMs = summary.DurationMs,
                batchSize = effectiveBatchSize,
                isDryRun
            }, ct);

            return (await _ledger.ListRunsAsync(binding.Id, 1, ct)).First();
        }
        catch (Exception ex)
        {
            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            summary.CurrentStage = "Failed";
            summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
            summary.AppendVerboseLog($"Failed: {SyncTransforms.SanitizeErrorMessage(ex)}");
            _logger.LogError(
                "Track 2 {Mode} failed for binding {BindingId}: {SanitizedError}",
                mode, binding.Id, SyncTransforms.SanitizeErrorMessage(ex));
            await _ledger.FailRunAsync(runId, summary, ex, ct);
            throw;
        }
        finally
        {
            ActiveRunProgress.Value = prevProgress;
        }
    }

    private async Task<long> PreDrainChangelogAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        bool isGlobal,
        long afterSeq,
        bool isDryRun,
        SyncRunSummary summary,
        HashSet<(string EntityType, string V1Id)> shieldedInRun,
        CancellationToken ct)
    {
        var cursor = afterSeq;
        for (var iter = 0; iter < MaxCdcDrainIterations; iter++)
        {
            var batch = await _cdcResolver.ResolveBatchAsync(
                v1, cursor, binding.V1ClinicId, binding.V1OrgId, isGlobal, CdcDrainBatchSize, ct);

            if (batch.RawEventCount == 0)
            {
                break;
            }

            if (batch.DeletedEvents.Count > 0)
            {
                await ApplyCdcDeletionShieldAsync(v1, v2, binding, runId, batch.DeletedEvents, isGlobal, isDryRun, summary, shieldedInRun, ct);
            }

            if (batch.MaxSeq > cursor)
            {
                cursor = batch.MaxSeq;
                if (!isDryRun)
                {
                    await _ledger.UpdateCursorAsync(binding.Id, cursor, ct);
                }
            }
            else
            {
                break;
            }

            if (!batch.HasMore)
            {
                break;
            }
        }

        return cursor;
    }

    private async Task<(int UniqueUsersCount, long EndSeq, int RawEventCount, int DeletedEventCount)> RunIncrementalCdcLoopAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        bool isGlobal,
        long afterSeq,
        Dictionary<int, string> fileTypes,
        Dictionary<int, ClinicianSnapshot> clinicians,
        string? resolvedFacilityName,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        HashSet<(string EntityType, string V1Id)> shieldedInRun,
        CancellationToken ct)
    {
        var cursor = afterSeq;
        var uniqueUsers = new HashSet<int>();
        var rawTotal = 0;
        var deletedTotal = 0;

        for (var iter = 0; iter < MaxCdcDrainIterations; iter++)
        {
            var batch = await _cdcResolver.ResolveBatchAsync(
                v1, cursor, binding.V1ClinicId, binding.V1OrgId, isGlobal, CdcDrainBatchSize, ct);

            if (batch.RawEventCount == 0)
            {
                break;
            }

            rawTotal += batch.RawEventCount;
            deletedTotal += batch.DeletedEvents.Count;

            if (batch.DeletedEvents.Count > 0)
            {
                await ApplyCdcDeletionShieldAsync(v1, v2, binding, runId, batch.DeletedEvents, isGlobal, isDryRun, summary, shieldedInRun, ct);
            }

            if (batch.ScopedUserIds.Count > 0)
            {
                foreach (var uid in batch.ScopedUserIds) uniqueUsers.Add(uid);
                await ExecuteTrack2PipelineAsync(
                    v1, v2, binding, runId, batch.ScopedUserIds, fileTypes, clinicians, resolvedFacilityName,
                    isDryRun, forceV1OnConflict, summary, shieldedInRun, ct);
            }

            if (batch.MaxSeq > cursor)
            {
                cursor = batch.MaxSeq;
                if (!isDryRun)
                {
                    await _ledger.UpdateCursorAsync(binding.Id, cursor, ct);
                }
            }
            else
            {
                break;
            }

            if (!batch.HasMore)
            {
                break;
            }
        }

        return (uniqueUsers.Count, cursor, rawTotal, deletedTotal);
    }

    private async Task ExecuteTrack2PipelineAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> fileTypes,
        Dictionary<int, ClinicianSnapshot> clinicians,
        string? resolvedFacilityName,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        HashSet<(string EntityType, string V1Id)> shieldedInRun,
        CancellationToken ct)
    {
        var hasBoundClinic = binding.V1ClinicId.HasValue && binding.V2ClinicId.HasValue;
        var totalStages = hasBoundClinic ? 3 : 2;

        await BeginStageAsync(1, totalStages, "Patient Accounts & Sign-In Identities", cohortUserIds.Count, ct);
        var (resolvedPatientIds, activeCohortUserIds) = await SyncPatientAccountsAsync(
            v1, v2, binding, runId, cohortUserIds, isDryRun, forceV1OnConflict, summary, ct, shieldedInRun);

        if (activeCohortUserIds.Count == 0)
        {
            return;
        }

        await BeginStageAsync(2, totalStages, "Self-Owned Health Profiles & Files", activeCohortUserIds.Count, ct);
        await SyncSelfOwnedProfileAndFilesAsync(
            v1, v2, binding, runId, activeCohortUserIds, resolvedPatientIds, fileTypes, clinicians,
            isDryRun, forceV1OnConflict, summary, ct, shieldedInRun: shieldedInRun);

        if (hasBoundClinic)
        {
            await BeginStageAsync(3, totalStages, "Clinic Memberships & Visit Copies", activeCohortUserIds.Count, ct);
            await SyncBoundClinicCopiesAsync(
                v1, v2, binding, runId, activeCohortUserIds, resolvedPatientIds, clinicians,
                resolvedFacilityName ?? binding.Name, isDryRun, forceV1OnConflict, summary, ct, shieldedInRun: shieldedInRun);
        }
    }

    public async Task<SyncRunRecord> ForceSyncEntityAsync(
        SyncBinding binding,
        string entityType,
        string v1Id,
        Guid v2Id,
        string triggeredBy,
        CancellationToken ct)
    {
        var isGlobal = string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase);
        if (!isGlobal && !binding.V1ClinicId.HasValue && !binding.V1OrgId.HasValue)
        {
            throw new InvalidOperationException("Scoped Track 2 binding requires V1ClinicId or V1OrgId (or switch cohort mode to GLOBAL).");
        }

        var runId = await _ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, triggeredBy, ct);
        var sw = Stopwatch.StartNew();
        var summary = new SyncRunSummary
        {
            Track = binding.Track,
            Mode = SyncRunMode.Incremental,
            SampleLimit = 1
        };

        try
        {
            await using var v1 = await _connections.OpenV1SourceAsync(ct);
            await using var v2 = await _connections.OpenPatientDbAsync(ct);

            var v1UserId = await ResolveForceSyncOwnerUserIdAsync(v1, binding, entityType, v1Id, ct);
            if (!v1UserId.HasValue ||
                !await IsUserActiveInV1Async(v1, v1UserId.Value, ct) ||
                (!isGlobal && !await IsUserInBindingScopeAsync(v1, v1UserId.Value, binding.V1ClinicId, binding.V1OrgId, ct)))
            {
                throw new InvalidOperationException(
                    "Cannot FORCE_V1 because the v1 source record is deleted or out of scope for this binding; Deletion Shield preserved the v2 record.");
            }

            summary.CohortPatientCount = 1;
            var cohort = new List<int> { v1UserId.Value };
            var shieldedInRun = new HashSet<(string EntityType, string V1Id)>();

            switch (entityType)
            {
                case "PatientAccount":
                {
                    await SyncPatientAccountsAsync(
                        v1, v2, binding, runId, cohort,
                        isDryRun: false, forceV1OnConflict: true, summary, ct, shieldedInRun);
                    break;
                }

                case "PatientAddress":
                case "EmergencyContact":
                case "PatientAllergy":
                case "PatientChronicCondition":
                case "PatientPastIllness":
                case "PatientFamilyHistory":
                case "PatientSocialHistory":
                case "PatientObstetricProfile":
                case "PatientSurgicalHistory":
                case "PatientDisability":
                case "PatientImmunizationSelf":
                case "PatientMedication":
                case "PatientGovernmentId":
                case "FileRecord":
                {
                    var resolved = await LoadResolvedPatientIdMapAsync(v2, binding.Id, cohort, ct);
                    var fileTypes = string.Equals(entityType, "FileRecord", StringComparison.Ordinal)
                        ? await LoadLookupAsync(v1, """SELECT id, name FROM public."FileType" """, ct)
                        : new Dictionary<int, string>();
                    var clinicians = string.Equals(entityType, "PatientMedication", StringComparison.Ordinal)
                        ? await LoadV1ClinicianSnapshotsAsync(v1, ct)
                        : new Dictionary<int, ClinicianSnapshot>();

                    await SyncSelfOwnedProfileAndFilesAsync(
                        v1, v2, binding, runId, cohort, resolved, fileTypes, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: entityType, targetV1IdFilter: v1Id, shieldedInRun: shieldedInRun);
                    break;
                }

                case "ClinicMembership":
                case "PatientAppointment":
                case "PatientConsultation":
                case "PatientVitalSign":
                case "PatientPrescriptionDocument":
                case "PatientPrescription":
                case "PatientMedicalCertificate":
                case "PatientLabRequestSlip":
                case "VaccinationAdministered":
                {
                    if (!binding.V1ClinicId.HasValue || !binding.V2ClinicId.HasValue)
                    {
                        throw new InvalidOperationException($"Track 2 entity '{entityType}' requires V1ClinicId and V2ClinicId.");
                    }

                    var resolved = await LoadResolvedPatientIdMapAsync(v2, binding.Id, cohort, ct);
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    var facilityName = await EnsureTargetClinicRowAsync(v1, v2, binding, isDryRun: false, ct);

                    await SyncBoundClinicCopiesAsync(
                        v1, v2, binding, runId, cohort, resolved, clinicians, facilityName,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: entityType, targetV1IdFilter: v1Id, shieldedInRun: shieldedInRun);
                    break;
                }

                default:
                    throw new InvalidOperationException(
                        $"Single-entity FORCE_V1 is not supported for Track 2 entity '{entityType}'.");
            }

            var entityCounter = summary.For(entityType);
            if (entityCounter.ShieldedDeletes > 0 || (entityCounter.Updated == 0 && entityCounter.Created == 0))
            {
                throw new InvalidOperationException(
                    "Cannot FORCE_V1 because the v1 source record is deleted or missing; Deletion Shield preserved the v2 record.");
            }

            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            await _ledger.CompleteRunAsync(runId, summary, ct);
            await _ledger.AppendAuditAsync(binding.Id, "TRACK2_FORCE_V1_COMPLETED", triggeredBy, new
            {
                runId,
                entityType,
                v1Id,
                v2Id,
                durationMs = summary.DurationMs
            }, ct);

            return (await _ledger.ListRunsAsync(binding.Id, 1, ct)).First();
        }
        catch (Exception ex)
        {
            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            _logger.LogError(
                "Track 2 FORCE_V1 failed for binding {BindingId} entity {EntityType}: {SanitizedError}",
                binding.Id, entityType, SyncTransforms.SanitizeErrorMessage(ex));
            await _ledger.FailRunAsync(runId, summary, ex, ct);
            throw;
        }
    }

    public async Task<ParityReportResponse> BuildParityReportAsync(SyncBinding binding, CancellationToken ct)
    {
        await using var v1 = await _connections.OpenV1SourceAsync(ct);
        await using var v2 = await _connections.OpenPatientDbAsync(ct);

        var maxSeq = await ReadV1MaxChangelogSeqAsync(v1, ct);
        var lastSeq = await _ledger.GetCursorAsync(binding.Id, ct);
        var openConflicts = await _ledger.CountOpenConflictsAsync(binding.Id, ct);
        var mapped = await _ledger.GetMappedCountsByEntityAsync(binding.Id, ct);
        var isGlobal = string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase);

        const string scopedActiveUserFilter = """
            u."isActive" = true AND u."deletedAt" IS NULL
            AND (
                (@cid IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL))
                OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid))
            )
            """;

        var userFilter = isGlobal
            ? """u."isActive" = true AND u."deletedAt" IS NULL"""
            : scopedActiveUserFilter;

        var scopeParams = isGlobal
            ? Array.Empty<(string Key, object? Value, NpgsqlDbType? DbType)>()
            : new (string Key, object? Value, NpgsqlDbType? DbType)[]
            {
                ("cid", (object?)binding.V1ClinicId ?? DBNull.Value, NpgsqlDbType.Integer),
                ("oid", (object?)binding.V1OrgId ?? DBNull.Value, NpgsqlDbType.Integer)
            };

        var hasFolderActiveCols = await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                  await ColumnExistsAsync(v1, "Folder", "isActive", ct);
        var folderActiveFilter = hasFolderActiveCols
            ? """AND fo."deletedAt" IS NULL AND fo."isActive" = true"""
            : string.Empty;

        var hasDisabilityTable = await TableExistsAsync(v1, "UserDisability", ct);
        var hasMedicationTable = await TableExistsAsync(v1, "Medication", ct);
        var hasMedDrugTable = await TableExistsAsync(v1, "MedicationDrug", ct);
        var hasVaccinationTable = await TableExistsAsync(v1, "UserVaccination", ct);
        var hasPatientImmunizationTable = !hasVaccinationTable && await TableExistsAsync(v1, "PatientImmunization", ct);

        long v1Users = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT u.id) FROM public."User" u WHERE {userFilter}
            """, scopeParams, ct);

        long v1Addresses = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserAddress" ua
            JOIN public."User" u ON u.id = ua."userId"
            WHERE ua."deletedAt" IS NULL AND ua."isActive" = true AND {userFilter}
            """, scopeParams, ct);

        long v1Contacts = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserEmergencyContact" ec
            JOIN public."User" u ON u.id = ec."userId"
            WHERE ec."deletedAt" IS NULL AND ec."isActive" = true AND {userFilter}
            """, scopeParams, ct);

        long v1Allergies = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserAllergy" ua
            JOIN public."User" u ON u.id = ua."userId"
            WHERE {userFilter}
            """, scopeParams, ct);

        long v1Chronic = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserHealthCondition" uhc
            JOIN public."User" u ON u.id = uhc."userId"
            WHERE {userFilter}
            """, scopeParams, ct);

        long v1PastIllness = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."MedicalHistory" mh
            JOIN public."User" u ON u.id = mh."userId"
            WHERE {userFilter}
            """, scopeParams, ct);

        long v1FamHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."FamilyMedicalHistory" fmh
            JOIN public."User" u ON u.id = fmh."userId"
            WHERE fmh."deletedAt" IS NULL AND {userFilter}
            """, scopeParams, ct);

        long v1SocialHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT ph."userId") FROM public."PersonalHistory" ph
            JOIN public."User" u ON u.id = ph."userId"
            WHERE ph."deletedAt" IS NULL AND {userFilter}
            """, scopeParams, ct);

        long v1Obstetric = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT og."userId") FROM public."ObGyneHistory" og
            JOIN public."User" u ON u.id = og."userId"
            WHERE og."deletedAt" IS NULL AND {userFilter}
            """, scopeParams, ct);

        long v1Surgical = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."SurgicalHistory" sh
            JOIN public."User" u ON u.id = sh."userId"
            WHERE sh."deletedAt" IS NULL AND {userFilter}
            """, scopeParams, ct);

        long v1Disabilities = hasDisabilityTable
            ? await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."UserDisability" ud
                JOIN public."User" u ON u.id = ud."userId"
                WHERE {userFilter}
                """, scopeParams, ct)
            : 0;

        long v1ImmunSelf = hasVaccinationTable
            ? await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."UserVaccination" uv
                JOIN public."User" u ON u.id = uv."userId"
                WHERE uv."deletedAt" IS NULL AND uv."isActive" = true AND uv."hpId" IS NULL AND {userFilter}
                """, scopeParams, ct)
            : hasPatientImmunizationTable
                ? await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."PatientImmunization" pi
                    JOIN public."User" u ON u.id = pi."userId"
                    WHERE pi."deletedAt" IS NULL AND pi."isActive" = true AND {userFilter}
                    """, scopeParams, ct)
                : 0;

        long v1Meds = hasMedicationTable
            ? (hasMedDrugTable
                ? await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."Medication" m
                    JOIN public."User" u ON u.id = m."patientId"
                    LEFT JOIN public."MedicationDrug" md ON md."medicationId" = m.id
                    WHERE {userFilter}
                    """, scopeParams, ct)
                : await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."Medication" m
                    JOIN public."User" u ON u.id = m."patientId"
                    WHERE {userFilter}
                    """, scopeParams, ct))
            : 0;

        long v1GovIds = await ScalarInt64Async(v1, $"""
            SELECT
                COUNT(*) FILTER (WHERE pr.pin IS NOT NULL AND trim(pr.pin) <> '') +
                COUNT(*) FILTER (WHERE pr.tin IS NOT NULL AND trim(pr.tin) <> '') +
                COUNT(*) FILTER (WHERE pr."philSysId" IS NOT NULL AND trim(pr."philSysId") <> '')
            FROM public."PhilHealthRecord" pr
            JOIN public."User" u ON u.id = pr."userId"
            WHERE pr."deletedAt" IS NULL AND pr."isActive" = true AND {userFilter}
            """, scopeParams, ct);

        long v1Files = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."File" f
            JOIN public."Folder" fo ON fo.id = f."folderId"
            JOIN public."User" u ON u.id = fo."userId"
            WHERE f."isActive" = true AND f."deletedAt" IS NULL
              {folderActiveFilter}
              AND f.url IS NOT NULL AND trim(f.url) <> ''
              AND {userFilter}
            """, scopeParams, ct);

        // V2 Group A counts (scoped to mapped PatientAccount V2 IDs when !isGlobal)
        Guid[] scopedPatientV2Ids = Array.Empty<Guid>();
        if (!isGlobal)
        {
            var mappedAccounts = await _ledger.GetAllIdMappingsForEntityAsync(binding.Id, "PatientAccount", ct);
            scopedPatientV2Ids = mappedAccounts.Values.Distinct().ToArray();
        }

        async Task<long> CountV2GroupAAsync(string tableName, string idColumn = "patient_id", string extraWhere = "")
        {
            if (isGlobal)
            {
                return await ScalarInt64Async(v2, $"SELECT COUNT(*) FROM public.{tableName} WHERE is_deleted = false {extraWhere}", Array.Empty<(string, object)>(), ct);
            }
            if (scopedPatientV2Ids.Length == 0)
            {
                return 0;
            }
            return await ScalarInt64Async(
                v2,
                $"SELECT COUNT(*) FROM public.{tableName} WHERE is_deleted = false AND {idColumn} = ANY(@pids) {extraWhere}",
                new[] { ("pids", (object)scopedPatientV2Ids) },
                ct);
        }

        long v2Patients = await CountV2GroupAAsync("patients", "id");
        long v2ClerkLinked = await CountV2GroupAAsync("patients", "id", "AND clerk_user_id IS NOT NULL");
        long v2LegacyUnlinked = await CountV2GroupAAsync("patients", "id", "AND clerk_user_id IS NULL");
        long v2Addresses = await CountV2GroupAAsync("patient_addresses");
        long v2Contacts = await CountV2GroupAAsync("emergency_contacts");
        long v2Allergies = await CountV2GroupAAsync("patient_allergies");
        long v2Chronic = await CountV2GroupAAsync("patient_chronic_conditions");
        long v2PastIllness = await CountV2GroupAAsync("patient_past_illnesses");
        long v2FamHist = await CountV2GroupAAsync("patient_family_histories");
        long v2SocialHist = await CountV2GroupAAsync("patient_social_histories");
        long v2Obstetric = await CountV2GroupAAsync("patient_obstetric_profiles");
        long v2Surgical = await CountV2GroupAAsync("patient_surgical_histories");
        long v2Disabilities = await CountV2GroupAAsync("patient_disabilities");
        long v2ImmunSelf = await CountV2GroupAAsync("patient_immunizations_self");
        long v2Meds = await CountV2GroupAAsync("patient_medications");
        long v2GovIds = await CountV2GroupAAsync("patient_government_ids");
        long v2Files = await CountV2GroupAAsync("file_records");

        long MapCnt(string key) => mapped.TryGetValue(key, out var c) ? c : 0;

        var checks = new List<ParityEntityCheck>
        {
            new("Patients", v1Users, v2Patients, MapCnt("PatientAccount"), v2Patients >= v1Users,
                $"Clerk Linked: {v2ClerkLinked:N0} | Legacy Unlinked (awaiting Clerk sign-up): {v2LegacyUnlinked:N0}"),
            new("PatientAddresses", v1Addresses, v2Addresses, MapCnt("PatientAddress"), v2Addresses >= v1Addresses),
            new("EmergencyContacts", v1Contacts, v2Contacts, MapCnt("EmergencyContact"), v2Contacts >= v1Contacts),
            new("PatientAllergies", v1Allergies, v2Allergies, MapCnt("PatientAllergy"), v2Allergies >= v1Allergies),
            new("PatientChronicConditions", v1Chronic, v2Chronic, MapCnt("PatientChronicCondition"), v2Chronic >= v1Chronic),
            new("PatientPastIllnesses", v1PastIllness, v2PastIllness, MapCnt("PatientPastIllness"), v2PastIllness >= v1PastIllness),
            new("PatientFamilyHistories", v1FamHist, v2FamHist, MapCnt("PatientFamilyHistory"), v2FamHist >= v1FamHist),
            new("PatientSocialHistories", v1SocialHist, v2SocialHist, MapCnt("PatientSocialHistory"), v2SocialHist >= v1SocialHist),
            new("PatientObstetricProfiles", v1Obstetric, v2Obstetric, MapCnt("PatientObstetricProfile"), v2Obstetric >= v1Obstetric),
            new("PatientSurgicalHistories", v1Surgical, v2Surgical, MapCnt("PatientSurgicalHistory"), v2Surgical >= v1Surgical),
            new("PatientDisabilities", v1Disabilities, v2Disabilities, MapCnt("PatientDisability"), v2Disabilities >= v1Disabilities),
            new("PatientImmunizationsSelf", v1ImmunSelf, v2ImmunSelf, MapCnt("PatientImmunizationSelf"), v2ImmunSelf >= v1ImmunSelf),
            new("PatientMedications", v1Meds, v2Meds, MapCnt("PatientMedication"), v2Meds >= v1Meds),
            new("PatientGovernmentIds", v1GovIds, v2GovIds, MapCnt("PatientGovernmentId"), v2GovIds >= v1GovIds),
            new("FileRecords (Incl. PRIVATE)", v1Files, v2Files, MapCnt("FileRecord"), v2Files >= v1Files,
                "Includes all PRIVATE & clinic files with EncryptionAlgorithm='NONE' in active folders")
        };

        // Group B checks (only when bound to a specific V1ClinicId + V2ClinicId)
        if (binding.V1ClinicId.HasValue && binding.V2ClinicId.HasValue)
        {
            var v1Cid = binding.V1ClinicId.Value;
            var v2Cid = binding.V2ClinicId.Value;
            var v2CidStr = v2Cid.ToString("D");

            var clinicCohortParams = isGlobal
                ? new (string Key, object? Value, NpgsqlDbType? DbType)[] { ("cid", v1Cid, NpgsqlDbType.Integer) }
                : new (string Key, object? Value, NpgsqlDbType? DbType)[]
                {
                    ("cid", v1Cid, NpgsqlDbType.Integer),
                    ("oid", (object?)binding.V1OrgId ?? DBNull.Value, NpgsqlDbType.Integer)
                };

            long v1Memberships = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."ClinicPatient" cp
                JOIN public."User" u ON u.id = cp."patientId"
                WHERE cp."clinicId" = @cid AND cp."deletedAt" IS NULL AND {userFilter}
                """, clinicCohortParams, ct);

            long v1Appts = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."Appointment" a
                JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
                JOIN public."User" u ON u.id = ar."userId"
                WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL AND {userFilter}
                """, clinicCohortParams, ct);

            long v1Consults = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."ConsultationTicket" t
                LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId"
                LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                JOIN public."User" u ON u.id = COALESCE(cp."patientId", ar."userId")
                WHERE t."clinicId" = @cid AND t."isActive" = true AND {userFilter}
                """, clinicCohortParams, ct);

            long v1Vitals = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."VitalSign" vs
                JOIN public."User" u ON u.id = vs."userId"
                WHERE vs."deletedAt" IS NULL AND vs."isActive" = true
                  AND (vs."consultationTicketId" IS NULL OR EXISTS (
                      SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = vs."consultationTicketId" AND ct."clinicId" = @cid AND ct."isActive" = true
                  ))
                  AND {userFilter}
                """, clinicCohortParams, ct);

            long v1RxDocs = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."Prescription" p
                JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                JOIN public."User" u ON u.id = cp."patientId"
                JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
                WHERE p."clinicId" = @cid AND p."isActive" = true AND {userFilter}
                """, clinicCohortParams, ct);

            long v1RxLines = await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."Medicine" m
                JOIN public."Prescription" p ON p.id = m."prescriptionId"
                JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                JOIN public."User" u ON u.id = cp."patientId"
                JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
                WHERE p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true AND {userFilter}
                """, clinicCohortParams, ct);

            var hasMedCertTable = await TableExistsAsync(v1, "ClinicMedicalCertificate", ct);
            long v1MedCerts = hasMedCertTable
                ? await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."ClinicMedicalCertificate" mc
                    JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId"
                    JOIN public."User" u ON u.id = cp."patientId"
                    WHERE mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true AND {userFilter}
                    """, clinicCohortParams, ct)
                : 0;

            long v1LabSlips = await ScalarInt64Async(v1, $"""
                SELECT
                    (SELECT COUNT(*) FROM public."ClinicLaboratoryRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {userFilter}) +
                    (SELECT COUNT(*) FROM public."ClinicImagingRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {userFilter}) +
                    (SELECT COUNT(*) FROM public."ClinicHeartStationRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {userFilter})
                """, clinicCohortParams, ct);

            long v1VaxAdmin = hasVaccinationTable
                ? await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."UserVaccination" uv
                    JOIN public."User" u ON u.id = uv."userId"
                    WHERE uv."deletedAt" IS NULL AND uv."isActive" = true AND uv."hpId" IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = uv."userId" AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                      AND {userFilter}
                    """, clinicCohortParams, ct)
                : 0;

            var v2ClinicParams = new[] { ("cid", (object)v2Cid) };
            var v2FacilityParams = new[] { ("fid", (object)v2CidStr) };

            long v2Memberships = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.clinic_memberships WHERE is_deleted = false AND clinic_id = @cid", v2ClinicParams, ct);
            long v2Appts = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.appointments WHERE is_deleted = false AND clinic_id = @cid", v2ClinicParams, ct);
            long v2Consults = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.consultations WHERE is_deleted = false AND clinic_id = @cid", v2ClinicParams, ct);

            long v2Vitals = isGlobal
                ? await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.vital_signs WHERE is_deleted = false AND (clinic_id = @cid OR clinic_id = @empty)",
                    new[] { ("cid", (object)v2Cid), ("empty", Guid.Empty) }, ct)
                : (scopedPatientV2Ids.Length == 0
                    ? 0
                    : await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.vital_signs WHERE is_deleted = false AND patient_id = ANY(@pids) AND (clinic_id = @cid OR clinic_id = @empty)",
                        new[] { ("pids", (object)scopedPatientV2Ids), ("cid", v2Cid), ("empty", Guid.Empty) }, ct));

            long v2RxDocs = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.prescription_documents WHERE is_deleted = false AND ordering_facility_id = @fid", v2FacilityParams, ct);
            long v2RxLines = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.prescriptions WHERE is_deleted = false AND clinic_id = @cid", v2ClinicParams, ct);
            long v2MedCerts = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.medical_certificates WHERE is_deleted = false AND issuer_facility_id = @fid", v2FacilityParams, ct);
            long v2LabSlips = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.lab_request_slips WHERE is_deleted = false AND ordering_facility_id = @fid", v2FacilityParams, ct);
            long v2VaxAdmin = await ScalarInt64Async(v2, "SELECT COUNT(*) FROM public.vaccinations_administered WHERE is_deleted = false AND clinic_id = @cid", v2ClinicParams, ct);

            checks.Add(new("ClinicMemberships", v1Memberships, v2Memberships, MapCnt("ClinicMembership"), v2Memberships >= v1Memberships));
            checks.Add(new("BoundClinicAppointments", v1Appts, v2Appts, MapCnt("PatientAppointment"), v2Appts >= v1Appts));
            checks.Add(new("BoundClinicConsultations", v1Consults, v2Consults, MapCnt("PatientConsultation"), v2Consults >= v1Consults));
            checks.Add(new("VitalSigns", v1Vitals, v2Vitals, MapCnt("PatientVitalSign"), v2Vitals >= v1Vitals));
            checks.Add(new("PrescriptionDocuments", v1RxDocs, v2RxDocs, MapCnt("PatientPrescriptionDocument"), v2RxDocs >= v1RxDocs));
            checks.Add(new("Prescriptions", v1RxLines, v2RxLines, MapCnt("PatientPrescription"), v2RxLines >= v1RxLines));
            checks.Add(new("MedicalCertificates", v1MedCerts, v2MedCerts, MapCnt("PatientMedicalCertificate"), v2MedCerts >= v1MedCerts));
            checks.Add(new("LabRequestSlips", v1LabSlips, v2LabSlips, MapCnt("PatientLabRequestSlip"), v2LabSlips >= v1LabSlips));
            checks.Add(new("VaccinationsAdministered", v1VaxAdmin, v2VaxAdmin, MapCnt("VaccinationAdministered"), v2VaxAdmin >= v1VaxAdmin));
        }

        var effectiveLastSeq = lastSeq > maxSeq ? 0 : lastSeq;
        var lag = Math.Max(0, maxSeq - effectiveLastSeq);
        var readyToFreeze = lag == 0 && openConflicts == 0 && checks.All(c => c.IsMatched);

        return new ParityReportResponse(
            binding.Id,
            binding.Track,
            binding.Name,
            binding.IsFrozen,
            maxSeq,
            lastSeq,
            lag,
            openConflicts,
            readyToFreeze,
            checks,
            DateTimeOffset.UtcNow
        );
    }

    // -------------------------------------------------------------------------
    // Deletion Shield Helpers (Active Cohort + CDC op='D' + Child Shield)
    // -------------------------------------------------------------------------
    private async Task ApplyCdcDeletionShieldAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        IReadOnlyList<DeletedCdcEvent> deletedEvents,
        bool isGlobal,
        bool isDryRun,
        SyncRunSummary summary,
        HashSet<(string EntityType, string V1Id)> shieldedInRun,
        CancellationToken ct)
    {
        if (deletedEvents.Count == 0) return;

        var candidatesByEntity = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var evt in deletedEvents)
        {
            foreach (var (entityType, v1Id) in ScopedCdcIdResolver.GetTrack2DeleteMapKeys(evt))
            {
                if (!candidatesByEntity.TryGetValue(entityType, out var set))
                {
                    set = new HashSet<string>(StringComparer.Ordinal);
                    candidatesByEntity[entityType] = set;
                }
                set.Add(v1Id);
            }
        }

        if (candidatesByEntity.Count == 0) return;

        HashSet<string>? activePatientIdsInScope = null;
        if (candidatesByEntity.TryGetValue("PatientAccount", out var patientCandidateIds) && patientCandidateIds.Count > 0)
        {
            activePatientIdsInScope = await LoadActiveScopedPatientIdStringsAsync(v1, binding, isGlobal, patientCandidateIds, ct);
        }

        var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
        foreach (var (entityType, v1Ids) in candidatesByEntity)
        {
            var mappings = await _ledger.GetIdMappingsByV1IdsAsync(binding.Id, entityType, v1Ids, ct);
            if (string.Equals(entityType, "PatientMedication", StringComparison.Ordinal))
            {
                foreach (var baseId in v1Ids)
                {
                    if (baseId.Contains(':', StringComparison.Ordinal)) continue;
                    var prefixed = await _ledger.GetIdMappingsByV1IdPrefixAsync(binding.Id, entityType, baseId + ":", ct);
                    foreach (var kv in prefixed) mappings[kv.Key] = kv.Value;
                }
            }
            if (mappings.Count == 0) continue;

            var existingActiveV2 = await FilterExistingV2IdsForEntityAsync(v2, entityType, mappings.Values.ToArray(), ct);
            foreach (var (v1Id, v2Id) in mappings)
            {
                if (!existingActiveV2.Contains(v2Id)) continue;
                if (string.Equals(entityType, "PatientAccount", StringComparison.Ordinal) &&
                    activePatientIdsInScope is not null &&
                    activePatientIdsInScope.Contains(v1Id))
                {
                    continue;
                }
                await RecordShieldedDeleteAsync(binding, runId, entityType, v1Id, v2Id, isDryRun, summary, diffBatch, ct, shieldedInRun);
            }
        }

        if (diffBatch.Count > 0)
        {
            await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
        }
    }

    private static async Task<HashSet<string>> LoadActiveScopedPatientIdStringsAsync(
        NpgsqlConnection v1,
        SyncBinding binding,
        bool isGlobal,
        HashSet<string> candidateV1Ids,
        CancellationToken ct)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        var numericIds = new List<int>(candidateV1Ids.Count);
        foreach (var raw in candidateV1Ids)
        {
            if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var uid))
            {
                numericIds.Add(uid);
            }
        }
        if (numericIds.Count == 0) return result;

        var sql = isGlobal
            ? """
              SELECT u.id FROM public."User" u
              WHERE u.id = ANY(@ids) AND u."isActive" = true AND u."deletedAt" IS NULL
              """
            : """
              SELECT u.id FROM public."User" u
              WHERE u.id = ANY(@ids) AND u."isActive" = true AND u."deletedAt" IS NULL
                AND (
                    (@cid IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL))
                    OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid))
                )
              """;

        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("ids", numericIds.ToArray());
        if (!isGlobal)
        {
            cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)binding.V1ClinicId ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
        }
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            result.Add(r.GetInt32(0).ToString(CultureInfo.InvariantCulture));
        }
        return result;
    }

    private async Task ApplyMappedPatientsDeletionShieldAsync(
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        IReadOnlyCollection<int> activeCohortUserIds,
        bool isDryRun,
        SyncRunSummary summary,
        HashSet<(string EntityType, string V1Id)> shieldedInRun,
        CancellationToken ct)
    {
        var mappedPatients = await _ledger.GetAllIdMappingsForEntityAsync(binding.Id, "PatientAccount", ct);
        if (mappedPatients.Count == 0) return;

        var activeSet = activeCohortUserIds as HashSet<int> ?? new HashSet<int>(activeCohortUserIds);
        var missingOrInactive = new List<(string V1Id, Guid V2Id)>();
        foreach (var (v1Id, v2Id) in mappedPatients)
        {
            if (!int.TryParse(v1Id, out var uid) || !activeSet.Contains(uid))
            {
                missingOrInactive.Add((v1Id, v2Id));
            }
        }

        if (missingOrInactive.Count == 0) return;

        var existingV2 = await FilterExistingV2IdsForEntityAsync(
            v2, "PatientAccount", missingOrInactive.Select(x => x.V2Id).ToArray(), ct);
        if (existingV2.Count == 0) return;

        var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
        foreach (var (v1Id, v2Id) in missingOrInactive)
        {
            if (!existingV2.Contains(v2Id)) continue;
            await RecordShieldedDeleteAsync(binding, runId, "PatientAccount", v1Id, v2Id, isDryRun, summary, diffBatch, ct, shieldedInRun);
        }

        if (diffBatch.Count > 0)
        {
            await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
        }
    }

    private async Task RecordShieldedDeleteAsync(
        SyncBinding binding,
        Guid runId,
        string entityType,
        string v1Id,
        Guid v2Id,
        bool isDryRun,
        SyncRunSummary summary,
        List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)> diffBatch,
        CancellationToken ct,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        if (shieldedInRun is not null && !shieldedInRun.Add((entityType, v1Id)))
        {
            return;
        }
        summary.For(entityType).ShieldedDeletes++;
        diffBatch.Add((entityType, v1Id, v2Id, SyncDiffAction.ShieldDelete, new[] { "is_deleted" }));
        if (!isDryRun)
        {
            await _ledger.RecordConflictAsync(
                binding.Id, runId, entityType, v1Id, v2Id,
                SyncConflictType.V1SoftDeletedShielded, new[] { "is_deleted" }, ct);
        }
    }

    private async Task ApplyChildDeletionShieldAsync(
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        string entityType,
        Guid[] v2PatientIds,
        IReadOnlySet<string> activeV1IdsForChunk,
        bool isDryRun,
        SyncRunSummary summary,
        List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)> diffBatch,
        CancellationToken ct,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        if (v2PatientIds.Length == 0) return;
        var tableName = GetV2TableNameForEntity(entityType);
        if (tableName is null) return;

        var activeV2Rows = new List<Guid>();
        string sql;
        if (entityType is "ClinicMembership" or "PatientAppointment" or "PatientConsultation" or "PatientPrescription" or "VaccinationAdministered")
        {
            sql = $"""
                SELECT id FROM public.{tableName}
                WHERE patient_id = ANY(@pids) AND clinic_id = @cid AND is_deleted = false
                """;
        }
        else if (entityType == "PatientVitalSign")
        {
            sql = """
                SELECT id FROM public.vital_signs
                WHERE patient_id = ANY(@pids) AND (clinic_id = @cid OR clinic_id = @emptyCid) AND is_deleted = false
                """;
        }
        else if (entityType is "PatientPrescriptionDocument" or "PatientLabRequestSlip")
        {
            sql = $"""
                SELECT id FROM public.{tableName}
                WHERE patient_id = ANY(@pids) AND ordering_facility_id = @fid AND is_deleted = false
                """;
        }
        else if (entityType == "PatientMedicalCertificate")
        {
            sql = """
                SELECT id FROM public.medical_certificates
                WHERE patient_id = ANY(@pids) AND issuer_facility_id = @fid AND is_deleted = false
                """;
        }
        else
        {
            sql = $"""
                SELECT id FROM public.{tableName}
                WHERE patient_id = ANY(@pids) AND is_deleted = false
                """;
        }

        await using (var cmd = new NpgsqlCommand(sql, v2))
        {
            cmd.Parameters.AddWithValue("pids", v2PatientIds);
            if (sql.Contains("@cid", StringComparison.Ordinal))
            {
                cmd.Parameters.AddWithValue("cid", binding.V2ClinicId ?? Guid.Empty);
            }
            if (sql.Contains("@emptyCid", StringComparison.Ordinal))
            {
                cmd.Parameters.AddWithValue("emptyCid", Guid.Empty);
            }
            if (sql.Contains("@fid", StringComparison.Ordinal))
            {
                cmd.Parameters.AddWithValue("fid", (binding.V2ClinicId ?? Guid.Empty).ToString("D"));
            }
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) activeV2Rows.Add(r.GetGuid(0));
        }

        if (activeV2Rows.Count == 0) return;

        var v2Set = new HashSet<Guid>(activeV2Rows);
        var mapped = await _ledger.GetAllIdMappingsForEntityAsync(binding.Id, entityType, ct);
        foreach (var (v1Id, v2Id) in mapped)
        {
            if (!v2Set.Contains(v2Id)) continue;
            if (activeV1IdsForChunk.Contains(v1Id)) continue;
            await RecordShieldedDeleteAsync(binding, runId, entityType, v1Id, v2Id, isDryRun, summary, diffBatch, ct, shieldedInRun);
        }
    }

    // -------------------------------------------------------------------------
    // Group A.1: Sync `patients` (Clerk-First Adoption + Auth0 -> NULL + Collision Salt + v2-wins)
    // -------------------------------------------------------------------------
    private async Task<(Dictionary<int, Guid> ResolvedPatientIds, List<int> ActiveCohortUserIds)> SyncPatientAccountsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        var resolvedIds = new Dictionary<int, Guid>(cohortUserIds.Count);
        var activeCohortUserIds = new List<int>(cohortUserIds.Count);
        var counter = summary.For("PatientAccount");
        var storedHashes = await _ledger.LoadRowHashesAsync(binding.Id, "PatientAccount", ct);
        var existingIdMap = await _ledger.GetAllIdMappingsForEntityAsync(binding.Id, "PatientAccount", ct);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var chunkIds = chunk.ToArray();

            const string sql = """
                SELECT id, "userId", email, picture, "firstName", "middleName", "lastName", suffix,
                       gender::text, dob, "placeOfBirth", "bloodType"::text, "civilStatus"::text,
                       nationality, religion, mobile, telephone, "createdAt", "updatedAt", "deletedAt", "isActive"
                FROM public."User"
                WHERE id = ANY(@ids)
                ORDER BY id ASC
                """;

            var rows = new List<V1UserRow>();
            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("ids", chunkIds);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    DateOnly? dob = r.IsDBNull(9) ? null : r.GetFieldValue<DateOnly>(9);
                    if (dob.HasValue && (dob.Value.Year < 1900 || dob.Value > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))))
                        dob = null;

                    // Pre-truncate to exact CLINICEZ-PATIENT_DB column widths BEFORE building canonical map/hash
                    rows.Add(new V1UserRow(
                        Id: r.GetInt32(0),
                        V1UserIdStr: GetStr(r, 1),
                        Email: SyncTransforms.Clean(GetStr(r, 2), 254),
                        AvatarUrl: SyncTransforms.Clean(GetStr(r, 3), 500),
                        FirstName: SyncTransforms.CleanRequired(GetStr(r, 4), "Unknown", 100),
                        MiddleName: SyncTransforms.Clean(GetStr(r, 5), 100),
                        LastName: SyncTransforms.CleanRequired(GetStr(r, 6), "Patient", 100),
                        Suffix: SyncTransforms.Clean(GetStr(r, 7), 20),
                        Sex: SyncTransforms.MapPatientSex(GetStr(r, 8)),
                        Dob: dob,
                        PlaceOfBirth: SyncTransforms.Clean(GetStr(r, 10), 250),
                        BloodType: SyncTransforms.MapBloodType(GetStr(r, 11)),
                        CivilStatus: SyncTransforms.MapPatientCivilStatus(GetStr(r, 12)),
                        Nationality: SyncTransforms.Clean(GetStr(r, 13), 80),
                        Religion: SyncTransforms.Clean(GetStr(r, 14), 80),
                        Mobile: SyncTransforms.Clean(GetStr(r, 15), 20),
                        AltPhone: SyncTransforms.Clean(GetStr(r, 16), 20),
                        CreatedAt: GetUtc(r, 17) ?? TruncateUtcNow(),
                        UpdatedAt: GetUtc(r, 18) ?? TruncateUtcNow(),
                        IsDeleted: !r.IsDBNull(19) || (!r.IsDBNull(20) && !r.GetBoolean(20))
                    ));
                }
            }

            var clerkIds = rows.Select(x => SyncTransforms.ExtractClerkUserId(x.V1UserIdStr))
                .Where(c => c is not null).Cast<string>().Distinct().ToArray();
            var detIds = rows.Select(x => DeterministicUuid.PatientAccountId(x.Id)).ToArray();

            var existingByClerk = new Dictionary<string, (Guid Id, string ClinicEzId, Dictionary<string, string?> Fields)>(StringComparer.Ordinal);
            var existingById = new Dictionary<Guid, (string? ClerkUserId, string ClinicEzId, Dictionary<string, string?> Fields)>();

            const string v2LookupSql = """
                SELECT id, clerk_user_id, clinic_ez_id, first_name, middle_name, last_name, suffix,
                       sex, date_of_birth, place_of_birth, civil_status, blood_type,
                       nationality, religion, mobile, alt_phone, email
                FROM public.patients
                WHERE id = ANY(@ids) OR (clerk_user_id IS NOT NULL AND clerk_user_id = ANY(@clerks))
                """;
            await using (var cmd = new NpgsqlCommand(v2LookupSql, v2))
            {
                cmd.Parameters.AddWithValue("ids", detIds);
                cmd.Parameters.AddWithValue("clerks", clerkIds);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var id = r.GetGuid(0);
                    var clerk = GetStr(r, 1);
                    var ezId = r.GetString(2);
                    var dob = r.IsDBNull(8) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(8);
                    var fields = BuildPatientCanonicalMap(
                        SyncTransforms.CleanRequired(GetStr(r, 3), "Unknown", 100),
                        SyncTransforms.Clean(GetStr(r, 4), 100),
                        SyncTransforms.CleanRequired(GetStr(r, 5), "Patient", 100),
                        SyncTransforms.Clean(GetStr(r, 6), 20),
                        GetStr(r, 7), dob,
                        SyncTransforms.Clean(GetStr(r, 9), 250),
                        GetStr(r, 10), GetStr(r, 11),
                        SyncTransforms.Clean(GetStr(r, 12), 80),
                        SyncTransforms.Clean(GetStr(r, 13), 80),
                        SyncTransforms.Clean(GetStr(r, 14), 20),
                        SyncTransforms.Clean(GetStr(r, 15), 20),
                        SyncTransforms.Clean(GetStr(r, 16), 254));
                    existingById[id] = (clerk, ezId, fields);
                    if (clerk is not null) existingByClerk[clerk] = (id, ezId, fields);
                }
            }

            // Pre-resolve collision-free clinic_ez_id values for any new patient inserts
            var resolvedEzIds = await ResolveUniqueClinicEzIdsAsync(v2, rows, existingByClerk, existingById, ct);

            var ledgerUpdates = new List<(string, Guid, string, string)>();
            var diffBatch = new List<(string, string, Guid?, string, IReadOnlyList<string>)>();
            await using var batch = new NpgsqlBatch(v2);

            foreach (var u in rows)
            {
                var v1Key = u.Id.ToString(CultureInfo.InvariantCulture);
                var clerkId = SyncTransforms.ExtractClerkUserId(u.V1UserIdStr); // NULL for auth0|*!
                var detId = DeterministicUuid.PatientAccountId(u.Id);
                var targetId = detId;
                var targetEzId = resolvedEzIds.TryGetValue(u.Id, out var ez) ? ez : SyncTransforms.GenerateClinicEzId(u.Id);
                Dictionary<string, string?>? currentFields = null;
                var existsInV2 = false;
                var adopted = false;

                if (clerkId is not null && existingByClerk.TryGetValue(clerkId, out var foundByClerk))
                {
                    targetId = foundByClerk.Id;
                    targetEzId = foundByClerk.ClinicEzId;
                    currentFields = foundByClerk.Fields;
                    existsInV2 = true;
                    if (targetId != detId) adopted = true;
                }
                else if (existingById.TryGetValue(detId, out var foundById))
                {
                    targetEzId = foundById.ClinicEzId;
                    currentFields = foundById.Fields;
                    existsInV2 = true;
                    // Preserve reclaimed clerk_user_id if user already claimed via Clerk email reclaim!
                    if (clerkId is null && foundById.ClerkUserId is not null)
                    {
                        clerkId = foundById.ClerkUserId;
                    }
                }

                resolvedIds[u.Id] = targetId;

                if (u.IsDeleted)
                {
                    if (existsInV2 && (shieldedInRun is null || shieldedInRun.Add(("PatientAccount", v1Key))))
                    {
                        counter.ShieldedDeletes++;
                        diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.ShieldDelete, new[] { "is_deleted" }));
                        if (!isDryRun)
                        {
                            await _ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", v1Key, targetId,
                                SyncConflictType.V1SoftDeletedShielded, new[] { "is_deleted" }, ct);
                        }
                    }
                    continue;
                }

                activeCohortUserIds.Add(u.Id);

                var canonical = BuildPatientCanonicalMap(
                    u.FirstName, u.MiddleName, u.LastName, u.Suffix,
                    u.Sex, u.Dob, u.PlaceOfBirth, u.CivilStatus, u.BloodType,
                    u.Nationality, u.Religion, u.Mobile, u.AltPhone, u.Email);
                var v1Hash = DeterministicUuid.ComputeCanonicalHash(canonical);

                if (existsInV2 && storedHashes.TryGetValue(v1Key, out var prevHash))
                {
                    if (!forceV1OnConflict && string.Equals(prevHash.V1PayloadHash, v1Hash, StringComparison.Ordinal))
                    {
                        counter.Unchanged++;
                        if (!isDryRun && (!existingIdMap.TryGetValue(v1Key, out var mappedId) || mappedId != targetId))
                        {
                            ledgerUpdates.Add((v1Key, targetId, prevHash.V1PayloadHash, prevHash.V2ExpectedHash));
                        }
                        continue;
                    }
                    var liveHash = DeterministicUuid.ComputeCanonicalHash(currentFields!);
                    var changed = DeterministicUuid.ComputeChangedFieldNames(currentFields!, canonical);
                    if (!forceV1OnConflict && !string.Equals(liveHash, prevHash.V2ExpectedHash, StringComparison.Ordinal))
                    {
                        counter.SkippedV2Wins++;
                        diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.SkipV2Wins, changed));
                        if (!isDryRun)
                        {
                            await _ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", v1Key, targetId,
                                SyncConflictType.V2Modified, changed, ct, v1Hash, liveHash);
                        }
                        continue;
                    }
                    counter.Updated++;
                    if (diffBatch.Count < 500)
                        diffBatch.Add(("PatientAccount", v1Key, targetId, forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update, changed));
                }
                else if (adopted)
                {
                    var liveHash = DeterministicUuid.ComputeCanonicalHash(currentFields!);
                    var changed = DeterministicUuid.ComputeChangedFieldNames(currentFields!, canonical);
                    if (!forceV1OnConflict)
                    {
                        // First-time adoption of a pre-existing Clerk-created patient record: bind & protect live v2 profile
                        counter.AdoptedExisting++;
                        if (!isDryRun) ledgerUpdates.Add((v1Key, targetId, v1Hash, liveHash));
                        continue;
                    }

                    counter.Updated++;
                    if (diffBatch.Count < 500) diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.ForceV1, changed));
                }
                else if (existsInV2)
                {
                    // Un-hashed existing v2 row: protect via v2-wins unless identical or forceV1OnConflict
                    var changed = DeterministicUuid.ComputeChangedFieldNames(currentFields!, canonical);
                    if (!forceV1OnConflict && changed.Count == 0)
                    {
                        counter.Unchanged++;
                        if (!isDryRun) ledgerUpdates.Add((v1Key, targetId, v1Hash, v1Hash));
                        continue;
                    }
                    if (!forceV1OnConflict)
                    {
                        var liveHash = DeterministicUuid.ComputeCanonicalHash(currentFields!);
                        counter.SkippedV2Wins++;
                        diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.SkipV2Wins, changed));
                        if (!isDryRun)
                        {
                            await _ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", v1Key, targetId,
                                SyncConflictType.V2Modified, changed, ct, v1Hash, liveHash);
                        }
                        continue;
                    }
                    counter.Updated++;
                    if (diffBatch.Count < 500) diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.ForceV1, changed));
                }
                else
                {
                    counter.Created++;
                    if (diffBatch.Count < 500) diffBatch.Add(("PatientAccount", v1Key, targetId, SyncDiffAction.Create, canonical.Keys.ToList()));
                }

                if (!isDryRun)
                {
                    var pCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public.patients (
                            id, client_id, clerk_user_id, clinic_ez_id,
                            first_name, middle_name, last_name, suffix,
                            sex, date_of_birth, place_of_birth, civil_status, blood_type,
                            nationality, religion, avatar_url, mobile, alt_phone, email,
                            consent_to_share_info, created_at, created_by, updated_at, updated_by, is_deleted
                        ) VALUES (
                            @id, @id, @clerk, @ezId,
                            @fn, @mn, @ln, @suf,
                            @sex, @dob, @pob, @civil, @blood,
                            @nat, @rel, @avatar, @mob, @alt, @email,
                            true, @cat, @actor, @uat, @actor, false
                        ) ON CONFLICT (id) DO UPDATE SET
                            clerk_user_id = COALESCE(public.patients.clerk_user_id, EXCLUDED.clerk_user_id),
                            first_name = EXCLUDED.first_name,
                            middle_name = EXCLUDED.middle_name,
                            last_name = EXCLUDED.last_name,
                            suffix = EXCLUDED.suffix,
                            sex = EXCLUDED.sex,
                            date_of_birth = EXCLUDED.date_of_birth,
                            place_of_birth = EXCLUDED.place_of_birth,
                            civil_status = EXCLUDED.civil_status,
                            blood_type = EXCLUDED.blood_type,
                            nationality = EXCLUDED.nationality,
                            religion = EXCLUDED.religion,
                            avatar_url = EXCLUDED.avatar_url,
                            mobile = EXCLUDED.mobile,
                            alt_phone = EXCLUDED.alt_phone,
                            email = EXCLUDED.email,
                            updated_at = now(),
                            updated_by = @actor
                        """);
                    pCmd.Parameters.AddWithValue("id", targetId);
                    pCmd.Parameters.AddWithValue("clerk", (object?)clerkId ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("ezId", targetEzId);
                    pCmd.Parameters.AddWithValue("fn", u.FirstName);
                    pCmd.Parameters.AddWithValue("mn", (object?)u.MiddleName ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("ln", u.LastName);
                    pCmd.Parameters.AddWithValue("suf", (object?)u.Suffix ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("sex", (object?)u.Sex ?? DBNull.Value);
                    pCmd.Parameters.Add(new NpgsqlParameter("dob", NpgsqlDbType.Date) { Value = u.Dob.HasValue ? u.Dob.Value : DBNull.Value });
                    pCmd.Parameters.AddWithValue("pob", (object?)u.PlaceOfBirth ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("civil", (object?)u.CivilStatus ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("blood", (object?)u.BloodType ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("nat", (object?)u.Nationality ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("rel", (object?)u.Religion ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("avatar", (object?)u.AvatarUrl ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("mob", (object?)u.Mobile ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("alt", (object?)u.AltPhone ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("email", (object?)u.Email ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("cat", u.CreatedAt);
                    pCmd.Parameters.AddWithValue("uat", u.UpdatedAt);
                    pCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    batch.BatchCommands.Add(pCmd);
                    ledgerUpdates.Add((v1Key, targetId, v1Hash, v1Hash));
                }
            }

            if (!isDryRun && batch.BatchCommands.Count > 0) await batch.ExecuteNonQueryAsync(ct);
            if (!isDryRun && ledgerUpdates.Count > 0) await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "PatientAccount", ledgerUpdates, ct);
            if (diffBatch.Count > 0) await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
        }

        return (resolvedIds, activeCohortUserIds);
    }

    private static async Task<Dictionary<int, string>> ResolveUniqueClinicEzIdsAsync(
        NpgsqlConnection v2,
        List<V1UserRow> rows,
        Dictionary<string, (Guid Id, string ClinicEzId, Dictionary<string, string?> Fields)> existingByClerk,
        Dictionary<Guid, (string? ClerkUserId, string ClinicEzId, Dictionary<string, string?> Fields)> existingById,
        CancellationToken ct)
    {
        var result = new Dictionary<int, string>();
        var pending = new List<(int UserId, Guid DetId)>();
        foreach (var u in rows)
        {
            if (u.IsDeleted) continue;
            var clerkId = SyncTransforms.ExtractClerkUserId(u.V1UserIdStr);
            var detId = DeterministicUuid.PatientAccountId(u.Id);
            if ((clerkId is not null && existingByClerk.ContainsKey(clerkId)) || existingById.ContainsKey(detId))
            {
                continue;
            }
            pending.Add((u.Id, detId));
        }

        if (pending.Count == 0) return result;

        var usedInChunk = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var salts = pending.ToDictionary(x => x.UserId, _ => 0);

        for (var round = 0; round < 15 && result.Count < pending.Count; round++)
        {
            var unresolved = pending.Where(x => !result.ContainsKey(x.UserId)).ToList();
            var candidates = new Dictionary<int, string>(unresolved.Count);
            foreach (var (uid, _) in unresolved)
            {
                var candidate = SyncTransforms.GenerateClinicEzId(uid, salts[uid]);
                while (usedInChunk.Contains(candidate) && salts[uid] < 20)
                {
                    salts[uid]++;
                    candidate = SyncTransforms.GenerateClinicEzId(uid, salts[uid]);
                }
                candidates[uid] = candidate;
            }

            var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using (var cmd = new NpgsqlCommand("SELECT clinic_ez_id FROM public.patients WHERE clinic_ez_id = ANY(@ezs)", v2))
            {
                cmd.Parameters.AddWithValue("ezs", candidates.Values.Distinct(StringComparer.OrdinalIgnoreCase).ToArray());
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    taken.Add(r.GetString(0));
                }
            }

            foreach (var (uid, _) in unresolved)
            {
                var cand = candidates[uid];
                if (!taken.Contains(cand) && usedInChunk.Add(cand))
                {
                    result[uid] = cand;
                }
                else
                {
                    salts[uid]++;
                }
            }
        }

        foreach (var (uid, _) in pending)
        {
            if (!result.ContainsKey(uid))
            {
                result[uid] = SyncTransforms.GenerateClinicEzId(uid, salts[uid]);
            }
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // Group A.2: Self-Owned Profile Tables & ALL Files (INCLUDING PRIVATE!)
    // -------------------------------------------------------------------------
    private async Task SyncSelfOwnedProfileAndFilesAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, Guid> resolvedPatientIds,
        Dictionary<int, string> fileTypes,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        Guid Pid(int uid) => resolvedPatientIds.TryGetValue(uid, out var g) ? g : DeterministicUuid.PatientAccountId(uid);
        bool RunSection(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        var hasUserVaccinationTable = RunSection("PatientImmunizationSelf") && await TableExistsAsync(v1, "UserVaccination", ct);
        var hasVaccineTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Vaccine", ct);
        var hasDoseTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Dose", ct);
        var hasVaccineType = hasVaccineTable && await ColumnExistsAsync(v1, "Vaccine", "type", ct);
        var hasPatientImmunizationTable = RunSection("PatientImmunizationSelf") && !hasUserVaccinationTable && await TableExistsAsync(v1, "PatientImmunization", ct);
        var hasPhilHealthImmunLibTable = hasPatientImmunizationTable && await TableExistsAsync(v1, "PhilHealthImmunizationLibrary", ct);
        var hasDisabilityTable = RunSection("PatientDisability") && await TableExistsAsync(v1, "UserDisability", ct);
        var hasMedicationTable = RunSection("PatientMedication") && await TableExistsAsync(v1, "Medication", ct);
        var hasMedDrugTable = hasMedicationTable && await TableExistsAsync(v1, "MedicationDrug", ct);
        var hasDrugTable = hasMedicationTable && await TableExistsAsync(v1, "Drug", ct);
        var hasPhilHealthMemberType = RunSection("PatientGovernmentId") && await ColumnExistsAsync(v1, "PhilHealthRecord", "memberType", ct);
        var hasPhilHealthPrincipalPin = RunSection("PatientGovernmentId") && await ColumnExistsAsync(v1, "PhilHealthRecord", "principalMemberPin", ct);
        var hasFolderActiveCols = RunSection("FileRecord") &&
                                  await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                  await ColumnExistsAsync(v1, "Folder", "isActive", ct);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(Pid).Distinct().ToArray();

            // 1. patient_addresses
            if (RunSection("PatientAddress"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "userId", "isPrimary",
                           COALESCE(NULLIF(trim("addressLine"),''), NULLIF(trim(street),''), NULLIF(trim(address),'')),
                           barangay, city, COALESCE(NULLIF(trim(state),''), region), region, "zipCode", country,
                           "createdAt", "updatedAt"
                    FROM public."UserAddress"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL AND "isActive" = true
                    ORDER BY id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_addr:{v1Id}");
                        var isPrimary = r.GetBoolean(2);
                        var street = SyncTransforms.Clean(GetStr(r, 3), 200);
                        var brgy = SyncTransforms.Clean(GetStr(r, 4), 100);
                        var brgyName = SyncTransforms.Clean(GetStr(r, 4), 150);
                        var city = SyncTransforms.Clean(GetStr(r, 5), 100);
                        var cityName = SyncTransforms.Clean(GetStr(r, 5), 150);
                        var prov = SyncTransforms.Clean(GetStr(r, 6), 100);
                        var provName = SyncTransforms.Clean(GetStr(r, 6), 150);
                        var reg = SyncTransforms.Clean(GetStr(r, 7), 100);
                        var regName = SyncTransforms.Clean(GetStr(r, 7), 150);
                        var zip = SyncTransforms.Clean(GetStr(r, 8), 10);
                        var ctry = SyncTransforms.Clean(GetStr(r, 9), 80) ?? "Philippines";
                        var cat = GetUtc(r, 10) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 11) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["house_street"] = street,
                            ["barangay"] = brgy,
                            ["city_municipality"] = city,
                            ["province"] = prov,
                            ["region"] = reg,
                            ["zip_code"] = zip,
                            ["country"] = ctry,
                            ["is_primary"] = FmtBool(isPrimary)
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_addresses (
                                    id, client_id, patient_id, type, house_street, street_address,
                                    barangay, barangay_name, city_municipality, city_municipality_name,
                                    province, province_name, region, region_name,
                                    zip_code, country, is_primary, created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, 'Home', @st, @st,
                                    @brgy, @brgyN, @city, @cityN,
                                    @prov, @provN, @reg, @regN,
                                    @zip, @ctry, @prim, @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    house_street = EXCLUDED.house_street,
                                    street_address = EXCLUDED.street_address,
                                    barangay = EXCLUDED.barangay,
                                    barangay_name = EXCLUDED.barangay_name,
                                    city_municipality = EXCLUDED.city_municipality,
                                    city_municipality_name = EXCLUDED.city_municipality_name,
                                    province = EXCLUDED.province,
                                    province_name = EXCLUDED.province_name,
                                    region = EXCLUDED.region,
                                    region_name = EXCLUDED.region_name,
                                    zip_code = EXCLUDED.zip_code,
                                    country = EXCLUDED.country,
                                    is_primary = EXCLUDED.is_primary,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("st", (object?)street ?? DBNull.Value);
                            c.Parameters.AddWithValue("brgy", (object?)brgy ?? DBNull.Value);
                            c.Parameters.AddWithValue("brgyN", (object?)brgyName ?? DBNull.Value);
                            c.Parameters.AddWithValue("city", (object?)city ?? DBNull.Value);
                            c.Parameters.AddWithValue("cityN", (object?)cityName ?? DBNull.Value);
                            c.Parameters.AddWithValue("prov", (object?)prov ?? DBNull.Value);
                            c.Parameters.AddWithValue("provN", (object?)provName ?? DBNull.Value);
                            c.Parameters.AddWithValue("reg", (object?)reg ?? DBNull.Value);
                            c.Parameters.AddWithValue("regN", (object?)regName ?? DBNull.Value);
                            c.Parameters.AddWithValue("zip", (object?)zip ?? DBNull.Value);
                            c.Parameters.AddWithValue("ctry", ctry);
                            c.Parameters.AddWithValue("prim", isPrimary);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAddress", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, house_street, barangay, city_municipality, province, region, zip_code, country, is_primary
                        FROM public.patient_addresses
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["house_street"] = GetStr(r, 1),
                            ["barangay"] = GetStr(r, 2),
                            ["city_municipality"] = GetStr(r, 3),
                            ["province"] = GetStr(r, 4),
                            ["region"] = GetStr(r, 5),
                            ["zip_code"] = GetStr(r, 6),
                            ["country"] = GetStr(r, 7),
                            ["is_primary"] = FmtBool(r.GetBoolean(8))
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 2. emergency_contacts (NOT patient_emergency_contacts!)
            if (RunSection("EmergencyContact"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "userId", "isPrimary",
                           COALESCE(NULLIF(trim(name),''), trim(concat_ws(' ', "firstName", "middleName", "lastName", suffix))),
                           relationship, phone, "createdAt", "updatedAt"
                    FROM public."UserEmergencyContact"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL AND "isActive" = true
                    ORDER BY id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_ec:{v1Id}");
                        var isPrimary = r.GetBoolean(2);
                        var fullName = SyncTransforms.CleanRequired(GetStr(r, 3), "Emergency Contact", 200);
                        var rel = SyncTransforms.Clean(GetStr(r, 4), 80);
                        var mob = SyncTransforms.Clean(GetStr(r, 5), 20);
                        var cat = GetUtc(r, 6) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 7) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["full_name"] = fullName,
                            ["relationship"] = rel,
                            ["mobile"] = mob,
                            ["is_primary"] = FmtBool(isPrimary)
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.emergency_contacts (
                                    id, client_id, patient_id, full_name, relationship, mobile, is_primary,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @name, @rel, @mob, @prim,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    full_name = EXCLUDED.full_name,
                                    relationship = EXCLUDED.relationship,
                                    mobile = EXCLUDED.mobile,
                                    is_primary = EXCLUDED.is_primary,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("name", fullName);
                            c.Parameters.AddWithValue("rel", (object?)rel ?? DBNull.Value);
                            c.Parameters.AddWithValue("mob", (object?)mob ?? DBNull.Value);
                            c.Parameters.AddWithValue("prim", isPrimary);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "EmergencyContact", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, full_name, relationship, mobile, is_primary
                        FROM public.emergency_contacts
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["full_name"] = GetStr(r, 1),
                            ["relationship"] = GetStr(r, 2),
                            ["mobile"] = GetStr(r, 3),
                            ["is_primary"] = FmtBool(r.GetBoolean(4))
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 3. patient_allergies
            if (RunSection("PatientAllergy"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT ua.id, ua."userId", COALESCE(a.name, 'Unspecified Allergen'), ua.reaction, ua.notes
                    FROM public."UserAllergy" ua
                    LEFT JOIN public."Allergen" a ON a.id = ua."allergenId"
                    WHERE ua."userId" = ANY(@ids)
                    ORDER BY ua.id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_allergy:{v1Id}");
                        var name = SyncTransforms.CleanRequired(GetStr(r, 2), "Unspecified Allergen", 200);
                        var atype = SyncTransforms.MapPatientAllergyType(name);
                        var react = SyncTransforms.Clean(GetStr(r, 3), 500);
                        var notes = SyncTransforms.Clean(GetStr(r, 4), 1000);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["allergen_name"] = name,
                            ["allergy_type"] = atype,
                            ["reaction"] = react,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_allergies (
                                    id, client_id, patient_id, allergen_name, allergy_type, severity, reaction, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @name, @atype, 'Moderate', @react, @notes,
                                    now(), @actor, now(), @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    allergen_name = EXCLUDED.allergen_name,
                                    allergy_type = EXCLUDED.allergy_type,
                                    reaction = EXCLUDED.reaction,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("name", name);
                            c.Parameters.AddWithValue("atype", atype);
                            c.Parameters.AddWithValue("react", (object?)react ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAllergy", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, allergen_name, allergy_type, reaction, notes
                        FROM public.patient_allergies
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["allergen_name"] = GetStr(r, 1),
                            ["allergy_type"] = GetStr(r, 2),
                            ["reaction"] = GetStr(r, 3),
                            ["notes"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 4. patient_chronic_conditions (UserHealthCondition)
            if (RunSection("PatientChronicCondition"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT uhc.id, uhc."userId", COALESCE(hc.name, 'Health Condition'), uhc."dateDiagnosed", uhc.status, uhc.notes
                    FROM public."UserHealthCondition" uhc
                    LEFT JOIN public."HealthCondition" hc ON hc.id = uhc."healthConditionId"
                    WHERE uhc."userId" = ANY(@ids)
                    ORDER BY uhc.id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_hc:{v1Id}");
                        var cname = SyncTransforms.CleanRequired(GetStr(r, 2), "Health Condition", 300);
                        var diag = r.IsDBNull(3) ? null : SyncTransforms.ToSafeDateOnly(r.GetDateTime(3));
                        var controlled = string.Equals(GetStr(r, 4), "RESOLVED", StringComparison.OrdinalIgnoreCase);
                        var notes = SyncTransforms.Clean(GetStr(r, 5), 1000);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["condition_name"] = cname,
                            ["diagnosed_at"] = FmtDate(diag),
                            ["is_controlled"] = FmtBool(controlled),
                            ["treatment_notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_chronic_conditions (
                                    id, client_id, patient_id, condition_name, diagnosed_at, is_controlled, treatment_notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @cname, @diag, @ctrl, @notes,
                                    now(), @actor, now(), @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    condition_name = EXCLUDED.condition_name,
                                    diagnosed_at = EXCLUDED.diagnosed_at,
                                    is_controlled = EXCLUDED.is_controlled,
                                    treatment_notes = EXCLUDED.treatment_notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cname", cname);
                            c.Parameters.Add(new NpgsqlParameter("diag", NpgsqlDbType.Date) { Value = diag.HasValue ? diag.Value : DBNull.Value });
                            c.Parameters.AddWithValue("ctrl", controlled);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientChronicCondition", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, condition_name, diagnosed_at, is_controlled, treatment_notes
                        FROM public.patient_chronic_conditions
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["condition_name"] = GetStr(r, 1),
                            ["diagnosed_at"] = r.IsDBNull(2) ? null : FmtDate(r.GetFieldValue<DateOnly>(2)),
                            ["is_controlled"] = FmtBool(r.GetBoolean(3)),
                            ["treatment_notes"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 5. patient_past_illnesses (MedicalHistory)
            if (RunSection("PatientPastIllness"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT mh.id, mh."userId", COALESCE(hc.name, 'Past Illness'), mh.details, mh."createdAt", mh."updatedAt"
                    FROM public."MedicalHistory" mh
                    LEFT JOIN public."HealthCondition" hc ON hc.id = mh."conditionId"
                    WHERE mh."userId" = ANY(@ids)
                    ORDER BY mh.id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_mh:{v1Id}");
                        var name = SyncTransforms.CleanRequired(GetStr(r, 2), "Past Illness", 300);
                        var notes = SyncTransforms.Clean(GetStr(r, 3), 1000);
                        var cat = GetUtc(r, 4) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 5) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["illness_name"] = name,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_past_illnesses (
                                    id, client_id, patient_id, illness_name, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @name, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    illness_name = EXCLUDED.illness_name,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("name", name);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientPastIllness", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, illness_name, notes
                        FROM public.patient_past_illnesses
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["illness_name"] = GetStr(r, 1),
                            ["notes"] = GetStr(r, 2)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 6. patient_family_histories (FamilyRelation enum: 'Other', never 'Relative'!)
            if (RunSection("PatientFamilyHistory"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT fmh.id, fmh."userId", COALESCE(hc.name, 'Family Condition'), fmh.details, fmh."createdAt", fmh."updatedAt"
                    FROM public."FamilyMedicalHistory" fmh
                    LEFT JOIN public."HealthCondition" hc ON hc.id = fmh."conditionId"
                    WHERE fmh."userId" = ANY(@ids) AND fmh."deletedAt" IS NULL
                    ORDER BY fmh.id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_fmh:{v1Id}");
                        var name = SyncTransforms.CleanRequired(GetStr(r, 2), "Family Condition", 300);
                        var notes = SyncTransforms.Clean(GetStr(r, 3), 1000);
                        var relation = MapFamilyRelation(notes);
                        var cat = GetUtc(r, 4) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 5) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["relation"] = relation,
                            ["condition_name"] = name,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_family_histories (
                                    id, client_id, patient_id, relation, condition_name, is_deceased, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @rel, @name, false, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    relation = EXCLUDED.relation,
                                    condition_name = EXCLUDED.condition_name,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("rel", relation);
                            c.Parameters.AddWithValue("name", name);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientFamilyHistory", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, relation, condition_name, notes
                        FROM public.patient_family_histories
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["relation"] = GetStr(r, 1),
                            ["condition_name"] = GetStr(r, 2),
                            ["notes"] = GetStr(r, 3)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 7. patient_social_histories (1:1 per patient_id — natural key adoption + SmokingStatus/AlcoholUse enums + numeric(5,1))
            if (RunSection("PatientSocialHistory"))
            {
                var existingSocialByPatient = await LoadExistingByPatientKeyAsync(
                    v2, "SELECT patient_id, id FROM public.patient_social_histories WHERE patient_id = ANY(@pids) AND is_deleted = false", v2Pids, ct);

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT DISTINCT ON (ph."userId") ph.id, ph."userId", ph."smokingStatus", ph."numberOfPacksPerYear",
                           ph."alcoholStatus", ph."numberOfBottlesPerDay", ph."illicitDrugUse", ph."sexuallyActive", ph."createdAt", ph."updatedAt"
                    FROM public."PersonalHistory" ph
                    WHERE ph."userId" = ANY(@ids) AND ph."deletedAt" IS NULL
                    ORDER BY ph."userId", ph."updatedAt" DESC NULLS LAST, ph.id DESC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_social_user:{uid}");
                        Guid? adoptedId = existingSocialByPatient.TryGetValue(pid, out var exId) ? exId : null;

                        var smoke = SyncTransforms.MapPatientSmokingStatus(GetStr(r, 2));
                        var packYears = SyncTransforms.SanitizePatientPackYears(GetDecNullable(r, 3));
                        var alc = SyncTransforms.MapPatientAlcoholUse(GetStr(r, 4));
                        var usesSub = SyncTransforms.IsYesStatus(GetStr(r, 6));
                        var sexActive = SyncTransforms.IsYesStatus(GetStr(r, 7));
                        var cat = GetUtc(r, 8) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 9) ?? cat;

                        var canonical = BuildPatientSocialHistoryCanonicalMap(
                            smoke, packYears, alc, usesSub, sexActive);

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_social_histories (
                                    id, client_id, patient_id, smoking_status, pack_years, alcohol_use,
                                    uses_substances, is_sexually_active, created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @smoke, @py, @alc,
                                    @sub, @sex, @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id) DO UPDATE SET
                                    smoking_status = EXCLUDED.smoking_status,
                                    pack_years = EXCLUDED.pack_years,
                                    alcohol_use = EXCLUDED.alcohol_use,
                                    uses_substances = EXCLUDED.uses_substances,
                                    is_sexually_active = EXCLUDED.is_sexually_active,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("smoke", (object?)smoke ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("py", NpgsqlDbType.Numeric) { Value = packYears.HasValue ? packYears.Value : DBNull.Value });
                            c.Parameters.AddWithValue("alc", (object?)alc ?? DBNull.Value);
                            c.Parameters.AddWithValue("sub", usesSub);
                            c.Parameters.AddWithValue("sex", sexActive);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientSocialHistory", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, smoking_status, pack_years, alcohol_use, uses_substances, is_sexually_active
                        FROM public.patient_social_histories
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => BuildPatientSocialHistoryCanonicalMap(
                            GetStr(r, 1), GetDecNullable(r, 2), GetStr(r, 3), r.GetBoolean(4), r.IsDBNull(5) ? null : r.GetBoolean(5)), ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 8. patient_obstetric_profiles (1:1 per patient_id — natural key adoption)
            if (RunSection("PatientObstetricProfile"))
            {
                var existingObByPatient = await LoadExistingByPatientKeyAsync(
                    v2, "SELECT patient_id, id FROM public.patient_obstetric_profiles WHERE patient_id = ANY(@pids) AND is_deleted = false", v2Pids, ct);

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT DISTINCT ON (og."userId") og.id, og."userId", og.gravidity, og.parity, og.abortion, og."livingChildren",
                           og."lastMenstrualPeriod", og.menarche, og."menstrualCycleInterval", og."createdAt", og."updatedAt"
                    FROM public."ObGyneHistory" og
                    WHERE og."userId" = ANY(@ids) AND og."deletedAt" IS NULL
                    ORDER BY og."userId", og."updatedAt" DESC NULLS LAST, og.id DESC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_ob_user:{uid}");
                        Guid? adoptedId = existingObByPatient.TryGetValue(pid, out var exId) ? exId : null;

                        var g = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var p = r.IsDBNull(3) ? (int?)null : r.GetInt32(3);
                        var a = r.IsDBNull(4) ? (int?)null : r.GetInt32(4);
                        var l = r.IsDBNull(5) ? (int?)null : r.GetInt32(5);
                        DateOnly? lmp = r.IsDBNull(6) ? null : r.GetFieldValue<DateOnly>(6);
                        var cyc = r.IsDBNull(8) ? (int?)null : r.GetInt32(8);
                        var menarcheNote = r.IsDBNull(7) ? null : $"Menarche age: {r.GetInt32(7)}";
                        var cat = GetUtc(r, 9) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 10) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["gravida"] = g?.ToString(CultureInfo.InvariantCulture),
                            ["para"] = p?.ToString(CultureInfo.InvariantCulture),
                            ["abortus_count"] = a?.ToString(CultureInfo.InvariantCulture),
                            ["living_children"] = l?.ToString(CultureInfo.InvariantCulture),
                            ["last_menstrual_period"] = FmtDate(lmp),
                            ["menstrual_cycle_length_days"] = cyc?.ToString(CultureInfo.InvariantCulture),
                            ["notes"] = menarcheNote
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_obstetric_profiles (
                                    id, client_id, patient_id, gravida, para, abortus_count, living_children,
                                    last_menstrual_period, is_pregnant, menstrual_cycle_length_days, has_dysmenorrhea, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @g, @p, @a, @l,
                                    @lmp, false, @cyc, false, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id) DO UPDATE SET
                                    gravida = EXCLUDED.gravida,
                                    para = EXCLUDED.para,
                                    abortus_count = EXCLUDED.abortus_count,
                                    living_children = EXCLUDED.living_children,
                                    last_menstrual_period = EXCLUDED.last_menstrual_period,
                                    menstrual_cycle_length_days = EXCLUDED.menstrual_cycle_length_days,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("g", (object?)g ?? DBNull.Value);
                            c.Parameters.AddWithValue("p", (object?)p ?? DBNull.Value);
                            c.Parameters.AddWithValue("a", (object?)a ?? DBNull.Value);
                            c.Parameters.AddWithValue("l", (object?)l ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("lmp", NpgsqlDbType.Date) { Value = lmp.HasValue ? lmp.Value : DBNull.Value });
                            c.Parameters.AddWithValue("cyc", (object?)cyc ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)menarcheNote ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientObstetricProfile", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, gravida, para, abortus_count, living_children, last_menstrual_period, menstrual_cycle_length_days, notes
                        FROM public.patient_obstetric_profiles
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["gravida"] = r.IsDBNull(1) ? null : r.GetInt32(1).ToString(CultureInfo.InvariantCulture),
                            ["para"] = r.IsDBNull(2) ? null : r.GetInt32(2).ToString(CultureInfo.InvariantCulture),
                            ["abortus_count"] = r.IsDBNull(3) ? null : r.GetInt32(3).ToString(CultureInfo.InvariantCulture),
                            ["living_children"] = r.IsDBNull(4) ? null : r.GetInt32(4).ToString(CultureInfo.InvariantCulture),
                            ["last_menstrual_period"] = r.IsDBNull(5) ? null : FmtDate(r.GetFieldValue<DateOnly>(5)),
                            ["menstrual_cycle_length_days"] = r.IsDBNull(6) ? null : r.GetInt32(6).ToString(CultureInfo.InvariantCulture),
                            ["notes"] = GetStr(r, 7)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 9. patient_surgical_histories
            if (RunSection("PatientSurgicalHistory"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "userId", "operationName", "operationDate", notes, "createdAt", "updatedAt"
                    FROM public."SurgicalHistory"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL
                    ORDER BY id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_surg:{v1Id}");
                        var name = SyncTransforms.CleanRequired(GetStr(r, 2), "Surgery", 300);
                        DateOnly? sdate = r.IsDBNull(3) ? null : r.GetFieldValue<DateOnly>(3);
                        var notes = SyncTransforms.Clean(GetStr(r, 4), 1000);
                        var cat = GetUtc(r, 5) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 6) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["procedure_name"] = name,
                            ["surgery_date"] = FmtDate(sdate),
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_surgical_histories (
                                    id, client_id, patient_id, procedure_name, surgery_date, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @name, @sdate, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    procedure_name = EXCLUDED.procedure_name,
                                    surgery_date = EXCLUDED.surgery_date,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("name", name);
                            c.Parameters.Add(new NpgsqlParameter("sdate", NpgsqlDbType.Date) { Value = sdate.HasValue ? sdate.Value : DBNull.Value });
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientSurgicalHistory", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, procedure_name, surgery_date, notes
                        FROM public.patient_surgical_histories
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["procedure_name"] = GetStr(r, 1),
                            ["surgery_date"] = r.IsDBNull(2) ? null : FmtDate(r.GetFieldValue<DateOnly>(2)),
                            ["notes"] = GetStr(r, 3)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 10. patient_disabilities (only body_part varchar(100), classification varchar(200), is_pwd_certified bool exist in CLINICEZ-PATIENT_DB)
            if (RunSection("PatientDisability") && hasDisabilityTable)
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT ud.id, ud."userId", COALESCE(d.name, 'Disability'), ud.severity::text, ud.reason, ud.notes
                    FROM public."UserDisability" ud
                    LEFT JOIN public."Disability" d ON d.id = ud."disabilityId"
                    WHERE ud."userId" = ANY(@ids)
                    ORDER BY ud.id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_dis:{v1Id}");
                        var baseName = SyncTransforms.CleanRequired(GetStr(r, 2), "Disability", 200);
                        var sev = SyncTransforms.Clean(GetStr(r, 3));
                        var reason = SyncTransforms.Clean(GetStr(r, 4));
                        var notes = SyncTransforms.Clean(GetStr(r, 5));

                        var clsParts = new List<string> { baseName };
                        if (!string.IsNullOrWhiteSpace(sev) && !string.Equals(sev, "UNKNOWN", StringComparison.OrdinalIgnoreCase))
                        {
                            clsParts.Add($"Severity: {sev}");
                        }
                        if (!string.IsNullOrWhiteSpace(reason))
                        {
                            clsParts.Add(reason);
                        }
                        else if (!string.IsNullOrWhiteSpace(notes))
                        {
                            clsParts.Add(notes);
                        }
                        var classification = SyncTransforms.CleanRequired(string.Join(" | ", clsParts), "Disability", 200);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["classification"] = classification,
                            ["body_part"] = null,
                            ["is_pwd_certified"] = "false"
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_disabilities (
                                    id, client_id, patient_id, body_part, classification, is_pwd_certified,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, NULL, @cls, false,
                                    now(), @actor, now(), @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    classification = EXCLUDED.classification,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cls", classification);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientDisability", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, classification, body_part, is_pwd_certified
                        FROM public.patient_disabilities
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["classification"] = GetStr(r, 1),
                            ["body_part"] = GetStr(r, 2),
                            ["is_pwd_certified"] = FmtBool(r.GetBoolean(3))
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 11. patient_immunizations_self (legacy UserVaccination where hpId IS NULL OR modern PatientImmunization; dose_number clamped to 20; ImmunizationCategory enum)
            if (RunSection("PatientImmunizationSelf") && (hasUserVaccinationTable || hasPatientImmunizationTable))
            {
                var candidates = new List<ChildSyncCandidate>();
                var vaxSql = hasUserVaccinationTable
                    ? $"""
                        SELECT uv.id, uv."userId",
                               {(hasVaccineTable ? "COALESCE(v.name, 'Vaccine')" : "'Vaccine'::text")},
                               {(hasDoseTable ? "d.dose" : "NULL::text")},
                               uv."dateGiven", uv."administeredBy", uv."createdAt", uv."updatedAt",
                               {(hasVaccineType ? "v.type" : "NULL::text")} AS vtype
                        FROM public."UserVaccination" uv
                        {(hasVaccineTable ? "LEFT JOIN public.\"Vaccine\" v ON v.id = uv.\"vaccineId\"" : string.Empty)}
                        {(hasDoseTable ? "LEFT JOIN public.\"Dose\" d ON d.id = uv.\"doseId\"" : string.Empty)}
                        WHERE uv."userId" = ANY(@ids) AND uv."deletedAt" IS NULL AND uv."isActive" = true AND uv."hpId" IS NULL
                        ORDER BY uv.id ASC
                        """
                    : $"""
                        SELECT pi.id, pi."userId",
                               COALESCE(NULLIF(trim(pi."vaccineName"), ''), {(hasPhilHealthImmunLibTable ? "NULLIF(trim(lib.name), ''), " : string.Empty)}'Vaccine'),
                               COALESCE(NULLIF(trim(pi."doseNumber"), ''), {(hasPhilHealthImmunLibTable ? "NULLIF(trim(lib.\"defaultDoseLabel\"), ''), " : string.Empty)}NULL::text),
                               pi."dateGiven", pi."administeredBy", pi."createdAt", pi."updatedAt",
                               COALESCE(pi.category::text, {(hasPhilHealthImmunLibTable ? "lib.category::text, " : string.Empty)}'OTHER') AS vtype
                        FROM public."PatientImmunization" pi
                        {(hasPhilHealthImmunLibTable ? "LEFT JOIN public.\"PhilHealthImmunizationLibrary\" lib ON lib.id = pi.\"immunizationLibId\"" : string.Empty)}
                        WHERE pi."userId" = ANY(@ids) AND pi."deletedAt" IS NULL AND pi."isActive" = true
                        ORDER BY pi.id ASC
                        """;
                await using (var cmd = new NpgsqlCommand(vaxSql, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_imm:{v1Id}");
                        var vname = SyncTransforms.CleanRequired(GetStr(r, 2), "Vaccine", 200);
                        var dose = SyncTransforms.Clean(GetStr(r, 3), 20);
                        var dateGiven = r.IsDBNull(4) ? null : SyncTransforms.ToSafeDateOnly(r.GetDateTime(4));
                        var adminBy = SyncTransforms.Clean(GetStr(r, 5), 200);
                        var cat = GetUtc(r, 6) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 7) ?? cat;
                        var immCat = MapImmunizationCategory(GetStr(r, 8));

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["immunization_category"] = immCat,
                            ["vaccine_name"] = vname,
                            ["dose_number"] = dose,
                            ["date"] = FmtDate(dateGiven),
                            ["administered_by"] = adminBy
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_immunizations_self (
                                    id, client_id, patient_id, immunization_category, vaccine_name, dose_number, date, administered_by,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @icat, @vname, @dose, @dt, @aby,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    immunization_category = EXCLUDED.immunization_category,
                                    vaccine_name = EXCLUDED.vaccine_name,
                                    dose_number = EXCLUDED.dose_number,
                                    date = EXCLUDED.date,
                                    administered_by = EXCLUDED.administered_by,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("icat", immCat);
                            c.Parameters.AddWithValue("vname", vname);
                            c.Parameters.AddWithValue("dose", (object?)dose ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("dt", NpgsqlDbType.Date) { Value = dateGiven.HasValue ? dateGiven.Value : DBNull.Value });
                            c.Parameters.AddWithValue("aby", (object?)adminBy ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientImmunizationSelf", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, immunization_category, vaccine_name, dose_number, date, administered_by
                        FROM public.patient_immunizations_self
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["immunization_category"] = GetStr(r, 1),
                            ["vaccine_name"] = GetStr(r, 2),
                            ["dose_number"] = GetStr(r, 3),
                            ["date"] = r.IsDBNull(4) ? null : FmtDate(r.GetFieldValue<DateOnly>(4)),
                            ["administered_by"] = GetStr(r, 5)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 12. patient_medications (Medication + LEFT JOIN MedicationDrug + LEFT JOIN Drug)
            if (RunSection("PatientMedication") && hasMedicationTable)
            {
                var candidates = new List<ChildSyncCandidate>();
                var mdSelect = hasMedDrugTable
                    ? "md.id AS md_id, md.dosage, md.frequency, md.unit, md.notes, md.duration"
                    : "NULL::int AS md_id, NULL::text AS dosage, NULL::text AS frequency, NULL::text AS unit, NULL::text AS notes, NULL::int AS duration";
                var mdJoin = hasMedDrugTable
                    ? """LEFT JOIN public."MedicationDrug" md ON md."medicationId" = m.id"""
                    : string.Empty;
                var drugSelect = hasDrugTable && hasMedDrugTable
                    ? """d."genericName", d."brandName" """
                    : """NULL::text AS "genericName", NULL::text AS "brandName" """;
                var drugJoin = hasDrugTable && hasMedDrugTable
                    ? """LEFT JOIN public."Drug" d ON d.id = md."drugId" """
                    : string.Empty;

                var medSql = $"""
                    SELECT m.id, m."patientId", m."hpId", m.name, m."createdAt", m."updatedAt", m."completedAt",
                           {mdSelect}, {drugSelect}
                    FROM public."Medication" m
                    {mdJoin}
                    {drugJoin}
                    WHERE m."patientId" = ANY(@ids)
                    ORDER BY m.id ASC, md_id ASC NULLS LAST
                    """;

                await using (var cmd = new NpgsqlCommand(medSql, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var medId = r.GetInt32(0);
                        var uid = r.GetInt32(1);
                        var hpId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var medNameRaw = SyncTransforms.Clean(GetStr(r, 3));
                        var createdAt = GetUtc(r, 4) ?? TruncateUtcNow();
                        var updatedAt = GetUtc(r, 5) ?? createdAt;
                        var completedAt = GetUtc(r, 6);
                        var mdId = r.IsDBNull(7) ? (int?)null : r.GetInt32(7);
                        var dosage = SyncTransforms.Clean(GetStr(r, 8), 100);
                        var freq = SyncTransforms.Clean(GetStr(r, 9), 100);
                        var unit = SyncTransforms.Clean(GetStr(r, 10));
                        var rawNotes = SyncTransforms.Clean(GetStr(r, 11));
                        var durationDays = r.IsDBNull(12) ? (int?)null : r.GetInt32(12);
                        var drugGeneric = SyncTransforms.Clean(GetStr(r, 13), 200);
                        var drugBrand = SyncTransforms.Clean(GetStr(r, 14), 200);

                        var v1Key = mdId.HasValue
                            ? $"{medId}:{mdId.Value}"
                            : medId.ToString(CultureInfo.InvariantCulture);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_med:{v1Key}");

                        var medicationName = SyncTransforms.CleanRequired(drugBrand ?? medNameRaw ?? drugGeneric, "Medication", 200);
                        var genericName = SyncTransforms.Clean(drugGeneric ?? medNameRaw, 200);
                        var startDate = DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime);
                        DateOnly? endDate = completedAt.HasValue ? DateOnly.FromDateTime(completedAt.Value.ToOffset(ManilaOffset).DateTime) : null;
                        var isTaking = !completedAt.HasValue;
                        var prescribedBy = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var doc)
                            ? SyncTransforms.Clean(doc.Name, 200)
                            : null;
                        var noteParts = new[]
                        {
                            unit is not null ? $"Unit: {unit}" : null,
                            durationDays.HasValue ? $"Duration: {durationDays.Value} days" : null,
                            rawNotes
                        }.Where(x => !string.IsNullOrWhiteSpace(x));
                        var notes = SyncTransforms.Clean(string.Join(" | ", noteParts), 1000);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["medication_name"] = medicationName,
                            ["generic_name"] = genericName,
                            ["dosage"] = dosage,
                            ["frequency"] = freq,
                            ["start_date"] = FmtDate(startDate),
                            ["end_date"] = FmtDate(endDate),
                            ["is_currently_taking"] = FmtBool(isTaking),
                            ["prescribed_by"] = prescribedBy,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.patient_medications (
                                    id, client_id, patient_id, medication_name, generic_name, dosage, frequency,
                                    start_date, end_date, is_currently_taking, prescribed_by, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @mname, @gname, @dos, @freq,
                                    @sdate, @edate, @taking, @presc, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    medication_name = EXCLUDED.medication_name,
                                    generic_name = EXCLUDED.generic_name,
                                    dosage = EXCLUDED.dosage,
                                    frequency = EXCLUDED.frequency,
                                    start_date = EXCLUDED.start_date,
                                    end_date = EXCLUDED.end_date,
                                    is_currently_taking = EXCLUDED.is_currently_taking,
                                    prescribed_by = EXCLUDED.prescribed_by,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("mname", medicationName);
                            c.Parameters.AddWithValue("gname", (object?)genericName ?? DBNull.Value);
                            c.Parameters.AddWithValue("dos", (object?)dosage ?? DBNull.Value);
                            c.Parameters.AddWithValue("freq", (object?)freq ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("sdate", NpgsqlDbType.Date) { Value = startDate });
                            c.Parameters.Add(new NpgsqlParameter("edate", NpgsqlDbType.Date) { Value = endDate.HasValue ? endDate.Value : DBNull.Value });
                            c.Parameters.AddWithValue("taking", isTaking);
                            c.Parameters.AddWithValue("presc", (object?)prescribedBy ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", createdAt);
                            c.Parameters.AddWithValue("uat", updatedAt);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientMedication", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, medication_name, generic_name, dosage, frequency, start_date, end_date, is_currently_taking, prescribed_by, notes
                        FROM public.patient_medications
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["medication_name"] = GetStr(r, 1),
                            ["generic_name"] = GetStr(r, 2),
                            ["dosage"] = GetStr(r, 3),
                            ["frequency"] = GetStr(r, 4),
                            ["start_date"] = r.IsDBNull(5) ? null : FmtDate(r.GetFieldValue<DateOnly>(5)),
                            ["end_date"] = r.IsDBNull(6) ? null : FmtDate(r.GetFieldValue<DateOnly>(6)),
                            ["is_currently_taking"] = FmtBool(r.GetBoolean(7)),
                            ["prescribed_by"] = GetStr(r, 8),
                            ["notes"] = GetStr(r, 9)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 13. patient_government_ids (PhilHealth PIN + TIN + PhilSys PSN)
            if (RunSection("PatientGovernmentId"))
            {
                var candidates = new List<ChildSyncCandidate>();
                var govSql = $"""
                    SELECT id, "userId", pin, tin, "philSysId",
                           {(hasPhilHealthMemberType ? "\"memberType\"" : "NULL::text")} AS member_type,
                           {(hasPhilHealthPrincipalPin ? "\"principalMemberPin\"" : "NULL::text")} AS principal_pin,
                           "createdAt", "updatedAt"
                    FROM public."PhilHealthRecord"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL AND "isActive" = true
                    ORDER BY id ASC
                    """;
                await using (var cmd = new NpgsqlCommand(govSql, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var memberType = GetStr(r, 5);
                        var principalPin = GetStr(r, 6);
                        var cat = GetUtc(r, 7) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 8) ?? cat;

                        void EmitGovId(string suffix, string idType, string? val, string? phCategory = null, string? sponsorPin = null)
                        {
                            var clean = SyncTransforms.Clean(val, 100);
                            if (clean is null) return;
                            var v1Key = $"{v1Id}:{suffix}";
                            var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_govid:{v1Id}:{suffix}");
                            var cleanSponsor = SyncTransforms.Clean(sponsorPin, 50);

                            var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                            {
                                ["id_type"] = idType,
                                ["id_number"] = clean,
                                ["philhealth_category"] = phCategory,
                                ["sponsor_pin"] = cleanSponsor
                            };

                            candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                            {
                                var c = new NpgsqlBatchCommand("""
                                    INSERT INTO public.patient_government_ids (
                                        id, client_id, patient_id, id_type, id_number, philhealth_category, sponsor_pin,
                                        created_at, created_by, updated_at, updated_by, is_deleted
                                    ) VALUES (
                                        @id, @id, @pid, @itype, @inum, @pcat, @spin,
                                        @cat, @actor, @uat, @actor, false
                                    ) ON CONFLICT (id) DO UPDATE SET
                                        id_number = EXCLUDED.id_number,
                                        philhealth_category = EXCLUDED.philhealth_category,
                                        sponsor_pin = EXCLUDED.sponsor_pin,
                                        updated_at = now(),
                                        updated_by = @actor
                                    """);
                                c.Parameters.AddWithValue("id", targetId);
                                c.Parameters.AddWithValue("pid", pid);
                                c.Parameters.AddWithValue("itype", idType);
                                c.Parameters.AddWithValue("inum", clean);
                                c.Parameters.AddWithValue("pcat", (object?)phCategory ?? DBNull.Value);
                                c.Parameters.AddWithValue("spin", (object?)cleanSponsor ?? DBNull.Value);
                                c.Parameters.AddWithValue("cat", cat);
                                c.Parameters.AddWithValue("uat", uat);
                                c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                                return c;
                            }));
                        }

                        var phCat = SyncTransforms.MapClinicPhilHealthMemberType(memberType);
                        EmitGovId("pin", "PhilHealth", GetStr(r, 2), phCat, principalPin);
                        EmitGovId("tin", "TIN", GetStr(r, 3));
                        EmitGovId("psn", "PhilSys", GetStr(r, 4));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientGovernmentId", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, id_type, id_number, philhealth_category, sponsor_pin
                        FROM public.patient_government_ids
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["id_type"] = GetStr(r, 1),
                            ["id_number"] = GetStr(r, 2),
                            ["philhealth_category"] = GetStr(r, 3),
                            ["sponsor_pin"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // 14. file_records — ALL active patient files (incl. PRIVATE) in active folders!
            if (RunSection("FileRecord"))
            {
                var candidates = new List<ChildSyncCandidate>();
                var folderActiveFilter = hasFolderActiveCols
                    ? """AND fo."deletedAt" IS NULL AND fo."isActive" = true"""
                    : string.Empty;

                var fileSql = $"""
                    SELECT f.id, fo."userId", f."fileTypeId", f.name, f.size, f.url, f."mimeType", f."dateTaken",
                           f."createdAt", f."updatedAt", fs.privacy::text, fo.name AS folder_name
                    FROM public."File" f
                    JOIN public."Folder" fo ON fo.id = f."folderId"
                    LEFT JOIN public."FileSetting" fs ON fs."fileId" = f.id
                    WHERE fo."userId" = ANY(@ids) AND f."isActive" = true AND f."deletedAt" IS NULL
                      {folderActiveFilter}
                      AND f.url IS NOT NULL AND trim(f.url) <> ''
                    ORDER BY f.id ASC
                    """;

                await using (var cmd = new NpgsqlCommand(fileSql, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var fileId = r.GetInt32(0);
                        var v1Key = fileId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var ftId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var ftName = ftId.HasValue && fileTypes.TryGetValue(ftId.Value, out var n) ? n : null;
                        var detId = DeterministicUuid.PatientFileRecordId(fileId);
                        var fname = SyncTransforms.CleanRequired(GetStr(r, 3), $"file-{fileId}", 255);
                        var url = SyncTransforms.CleanRequired(GetStr(r, 5), "", 500);
                        if (string.IsNullOrEmpty(url)) continue;
                        var mime = SyncTransforms.Clean(GetStr(r, 6), 100);
                        var ext = SyncTransforms.Clean(SyncTransforms.ExtractFileExtension(fname, mime), 20);
                        var sizeBytes = r.IsDBNull(4) ? 0L : Math.Max(0L, r.GetInt64(4));
                        var docTypeId = SyncTransforms.MapPatientDocumentTypeId(ftName, fname);
                        var createdAt = GetUtc(r, 8) ?? TruncateUtcNow();
                        var updatedAt = GetUtc(r, 9) ?? createdAt;
                        var docDate = r.IsDBNull(7) ? DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime)
                            : SyncTransforms.ToSafeDateOnly(r.GetDateTime(7));
                        var folderName = SyncTransforms.Clean(GetStr(r, 11), 120);
                        var privacy = SyncTransforms.Clean(GetStr(r, 10), 20);
                        var notesRaw = string.Join(" | ", new[]
                        {
                            ftName is not null ? $"v1 Type: {ftName}" : null,
                            folderName is not null ? $"Folder: {folderName}" : null,
                            privacy is not null ? $"v1 Privacy: {privacy}" : null
                        }.Where(x => x is not null));
                        var notes = SyncTransforms.Clean(notesRaw, 1000);
                        var title = SyncTransforms.CleanRequired(ftName is not null ? $"{ftName} - {fname}" : fname, fname, 200);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["file_name"] = fname,
                            ["mime_type"] = mime,
                            ["extension"] = ext,
                            ["size_bytes"] = sizeBytes.ToString(CultureInfo.InvariantCulture),
                            ["storage_key"] = url,
                            ["document_type_id"] = docTypeId.ToString("D"),
                            ["document_date"] = FmtDate(docDate),
                            ["title"] = title,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.file_records (
                                    id, client_id, patient_id, file_name, mime_type, extension, size_bytes,
                                    storage_key, document_type_id, sync_status, uploaded_at, encryption_algorithm,
                                    document_date, notes, title, created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @fname, @mime, @ext, @size,
                                    @url, @docType, 'Synced', @cat, 'NONE',
                                    @ddate, @notes, @title, @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    file_name = EXCLUDED.file_name,
                                    mime_type = CASE WHEN COALESCE(public.file_records.encryption_algorithm, 'NONE') = 'NONE' THEN EXCLUDED.mime_type ELSE public.file_records.mime_type END,
                                    extension = EXCLUDED.extension,
                                    size_bytes = CASE WHEN COALESCE(public.file_records.encryption_algorithm, 'NONE') = 'NONE' THEN EXCLUDED.size_bytes ELSE public.file_records.size_bytes END,
                                    storage_key = CASE WHEN COALESCE(public.file_records.encryption_algorithm, 'NONE') = 'NONE' THEN EXCLUDED.storage_key ELSE public.file_records.storage_key END,
                                    document_type_id = EXCLUDED.document_type_id,
                                    sync_status = 'Synced',
                                    document_date = EXCLUDED.document_date,
                                    notes = EXCLUDED.notes,
                                    title = EXCLUDED.title,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("fname", fname);
                            c.Parameters.AddWithValue("mime", (object?)mime ?? DBNull.Value);
                            c.Parameters.AddWithValue("ext", (object?)ext ?? DBNull.Value);
                            c.Parameters.AddWithValue("size", sizeBytes);
                            c.Parameters.AddWithValue("url", url);
                            c.Parameters.AddWithValue("docType", docTypeId);
                            c.Parameters.AddWithValue("cat", createdAt);
                            c.Parameters.Add(new NpgsqlParameter("ddate", NpgsqlDbType.Date) { Value = docDate.HasValue ? docDate.Value : DBNull.Value });
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("title", title);
                            c.Parameters.AddWithValue("uat", updatedAt);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                var encryptedFileIds = new HashSet<Guid>();
                var writtenFileV1Ids = await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "FileRecord", v2Pids, candidates,
                    tIds => LoadFileRecordStatesAsync(v2, tIds, encryptedFileIds, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);

                if (!isDryRun && writtenFileV1Ids.Count > 0 && encryptedFileIds.Count > 0)
                {
                    var baselineUpdates = candidates
                        .Where(c => writtenFileV1Ids.Contains(c.V1Id) &&
                                    encryptedFileIds.Contains(c.AdoptedV2Id ?? c.DeterministicV2Id))
                        .Select(c => new MigratedStorageBaselineUpdate(
                            TargetEntityId: c.AdoptedV2Id ?? c.DeterministicV2Id,
                            SourceUrl: c.CanonicalFields.GetValueOrDefault("storage_key") ?? string.Empty,
                            SourceContentType: c.CanonicalFields.GetValueOrDefault("mime_type"),
                            SourceSizeBytes: long.TryParse(
                                c.CanonicalFields.GetValueOrDefault("size_bytes"),
                                NumberStyles.Integer,
                                CultureInfo.InvariantCulture,
                                out var sz) ? sz : 0L))
                        .ToList();
                    if (baselineUpdates.Count > 0)
                    {
                        await _ledger.RefreshMigratedSourceBaselineAsync(
                            SyncStoragePlane.PatientFile, baselineUpdates, ct);
                    }
                }
            }
        }
    }

    private async Task<Dictionary<Guid, Dictionary<string, string?>>> LoadFileRecordStatesAsync(
        NpgsqlConnection v2,
        Guid[] ids,
        HashSet<Guid> encryptedIdsOut,
        CancellationToken ct)
    {
        var map = new Dictionary<Guid, Dictionary<string, string?>>();
        if (ids.Length == 0) return map;

        var encryptedIds = new List<Guid>();
        const string sql = """
            SELECT id, file_name, mime_type, extension, size_bytes, storage_key,
                   document_type_id, document_date, title, notes, encryption_algorithm
            FROM public.file_records
            WHERE id = ANY(@ids) AND is_deleted = false
            """;

        await using (var cmd = new NpgsqlCommand(sql, v2))
        {
            cmd.Parameters.AddWithValue("ids", ids);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var id = r.GetGuid(0);
                var encAlg = r.IsDBNull(10) ? null : r.GetString(10);
                if (!string.Equals(encAlg ?? SyncTransforms.LegacyUnencryptedAlgorithm, SyncTransforms.LegacyUnencryptedAlgorithm, StringComparison.OrdinalIgnoreCase))
                {
                    encryptedIds.Add(id);
                    encryptedIdsOut.Add(id);
                }

                map[id] = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["file_name"] = GetStr(r, 1),
                    ["mime_type"] = GetStr(r, 2),
                    ["extension"] = GetStr(r, 3),
                    ["size_bytes"] = r.GetInt64(4).ToString(CultureInfo.InvariantCulture),
                    ["storage_key"] = GetStr(r, 5),
                    ["document_type_id"] = r.GetGuid(6).ToString("D"),
                    ["document_date"] = r.IsDBNull(7) ? null : FmtDate(r.GetFieldValue<DateOnly>(7)),
                    ["title"] = GetStr(r, 8),
                    ["notes"] = GetStr(r, 9)
                };
            }
        }

        if (encryptedIds.Count > 0)
        {
            var sources = await _ledger.LoadMigratedSourceInfoByPlaneAsync(
                SyncStoragePlane.PatientFile, encryptedIds, ct);
            foreach (var (id, src) in sources)
            {
                if (!map.TryGetValue(id, out var fields)) continue;
                fields["storage_key"] = src.SourceUrl;
                fields["size_bytes"] = src.SourceSizeBytes.ToString(CultureInfo.InvariantCulture);
                if (src.SourceContentTypeCaptured)
                {
                    fields["mime_type"] = src.SourceContentType;
                }
            }
        }

        return map;
    }

    // -------------------------------------------------------------------------
    // Group B: Bound-Clinic Read-Only Clinical Copies (Shared Track 1 UUIDv5s!)
    // -------------------------------------------------------------------------
    private async Task<string> EnsureTargetClinicRowAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        bool isDryRun,
        CancellationToken ct)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;

        string clinicName = binding.Name;
        if (await TableExistsAsync(v1, "Clinic", ct))
        {
            await using var cmd = new NpgsqlCommand("""SELECT name FROM public."Clinic" WHERE id = @cid""", v1);
            cmd.Parameters.AddWithValue("cid", v1ClinicId);
            var res = await cmd.ExecuteScalarAsync(ct);
            if (res is string s && !string.IsNullOrWhiteSpace(s)) clinicName = s.Trim();
        }
        clinicName = SyncTransforms.CleanRequired(clinicName, "Clinic", 200);

        if (!isDryRun)
        {
            const string sql = """
                INSERT INTO public.clinics (
                    id, name, tenant_id, is_workspace_eligible, is_directory_published, is_public,
                    supports_appointments, is_gated, specialties_json, required_share_fields_json,
                    featured_score, active_member_count, created_at, updated_at, is_platform_verified
                ) VALUES (
                    @id, @name, @tid, true, true, true,
                    true, false, '[]', '[]',
                    0, 0, now(), now(), true
                ) ON CONFLICT (id) DO NOTHING
                """;
            await using var upsert = new NpgsqlCommand(sql, v2);
            upsert.Parameters.AddWithValue("id", v2ClinicId);
            upsert.Parameters.AddWithValue("name", clinicName);
            upsert.Parameters.AddWithValue("tid", (object?)SyncTransforms.Clean(binding.V2TenantId, 100) ?? DBNull.Value);
            await upsert.ExecuteNonQueryAsync(ct);
        }

        return clinicName;
    }

    private async Task SyncBoundClinicCopiesAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, Guid> resolvedPatientIds,
        Dictionary<int, ClinicianSnapshot> clinicians,
        string facilityName,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = SyncTransforms.CleanRequired(binding.V2TenantId, "ustp-cdo", 100);
        var cleanFacility = SyncTransforms.CleanRequired(facilityName, "Clinic", 200);
        var facilityIdStr = v2ClinicId.ToString("D");

        Guid Pid(int uid) => resolvedPatientIds.TryGetValue(uid, out var g) ? g : DeterministicUuid.PatientAccountId(uid);
        bool RunSection(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        var hasServiceTable = RunSection("PatientAppointment") && await TableExistsAsync(v1, "Service", ct);
        var hasPreferredAppointee = RunSection("PatientAppointment") && await ColumnExistsAsync(v1, "AppointmentAttribute", "preferredAppointee", ct);
        var hasApptRouting = RunSection("PatientAppointment") && await TableExistsAsync(v1, "AppointmentRouting", ct) &&
                             await ColumnExistsAsync(v1, "AppointmentRouting", "routedTo", ct);
        var hasApptTag = RunSection("PatientAppointment") && await TableExistsAsync(v1, "AppointmentTag", ct) &&
                         await ColumnExistsAsync(v1, "AppointmentTag", "healthcareProviderId", ct);
        var hasApptCaseNumber = RunSection("PatientAppointment") && await ColumnExistsAsync(v1, "Appointment", "caseNumber", ct);
        var hasApptReceivedAt = RunSection("PatientAppointment") && await ColumnExistsAsync(v1, "AppointmentAttribute", "receivedAt", ct);

        var hasConsultHp = RunSection("PatientConsultation") && await TableExistsAsync(v1, "ConsultationTicketHP", ct);
        var hasConsultNote = RunSection("PatientConsultation") && await TableExistsAsync(v1, "ConsultationNote", ct);
        var hasConsultDiag = (RunSection("PatientConsultation") || RunSection("PatientPrescriptionDocument")) &&
                             await TableExistsAsync(v1, "ConsultationDiagnosis", ct);
        var hasMedPhilHealth = RunSection("PatientPrescription") && await TableExistsAsync(v1, "MedicinePhilHealthData", ct);
        var hasMedCertTable = RunSection("PatientMedicalCertificate") && await TableExistsAsync(v1, "ClinicMedicalCertificate", ct);
        var hasMedCertReason = hasMedCertTable && await TableExistsAsync(v1, "MedicalCertificateReason", ct);
        var hasUserVaccinationTable = RunSection("VaccinationAdministered") && await TableExistsAsync(v1, "UserVaccination", ct);
        var hasVaccineTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Vaccine", ct);
        var hasDoseTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Dose", ct);
        var hasRouteTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Route", ct);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(Pid).Distinct().ToArray();

            // B1. clinic_memberships (natural key adoption on (patient_id, clinic_id))
            if (RunSection("ClinicMembership"))
            {
                var existingMemberships = await LoadExistingByPatientKeyAsync(
                    v2,
                    "SELECT patient_id, id FROM public.clinic_memberships WHERE clinic_id = @cid AND patient_id = ANY(@pids) AND is_deleted = false",
                    v2Pids, ct, ("cid", v2ClinicId));

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "patientId", "createdAt", "updatedAt"
                    FROM public."ClinicPatient"
                    WHERE "clinicId" = @cid AND "deletedAt" IS NULL AND "patientId" = ANY(@ids)
                    ORDER BY id ASC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var cpId = r.GetInt32(0);
                        var v1Key = cpId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"clinic:{v2ClinicId:D}:membership:{uid}");
                        Guid? adoptedId = existingMemberships.TryGetValue(pid, out var exId) ? exId : null;
                        var cat = GetUtc(r, 2) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 3) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["status"] = "Active"
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.clinic_memberships (
                                    id, client_id, patient_id, clinic_id, status,
                                    consent_privacy_policy, consent_terms_and_conditions, consent_data_sharing, consented_at,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @id, @pid, @cid, 'Active',
                                    true, true, true, @cat,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id, clinic_id) DO UPDATE SET
                                    status = 'Active',
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "ClinicMembership", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, status
                        FROM public.clinic_memberships
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["status"] = GetStr(r, 1)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B2. appointments (SharedAppointmentId + resolved provider_id + service_type + notes + checked_in_at)
            if (RunSection("PatientAppointment"))
            {
                var hpCoalesceParts = new List<string>();
                if (hasPreferredAppointee) hpCoalesceParts.Add("aa.\"preferredAppointee\"");
                if (hasApptRouting)
                    hpCoalesceParts.Add("""(SELECT ar2."routedTo" FROM public."AppointmentRouting" ar2 WHERE ar2."appointmentId" = a.id AND ar2.status = 'ACCEPTED' AND ar2."routedTo" IS NOT NULL ORDER BY ar2.id DESC LIMIT 1)""");
                if (hasApptTag)
                    hpCoalesceParts.Add("""(SELECT at2."healthcareProviderId" FROM public."AppointmentTag" at2 WHERE at2."appointmentId" = a.id AND at2."healthcareProviderId" IS NOT NULL ORDER BY at2.id DESC LIMIT 1)""");
                var hpExpr = hpCoalesceParts.Count > 0 ? $"COALESCE({string.Join(", ", hpCoalesceParts)})" : "NULL::int";

                var apptSql = $"""
                    SELECT a.id, ar."userId", a.subject, a.complaint, a."createdAt", a."updatedAt",
                           {(hasApptCaseNumber ? "a.\"caseNumber\"" : "NULL::text")} AS case_num,
                           aa.date, aa."timeStart", aa."maxDuration", aa.status,
                           {(hasApptReceivedAt ? "aa.\"receivedAt\"" : "NULL::timestamptz")} AS received_at,
                           {(hasServiceTable ? "svc.name" : "NULL::text")} AS service_name,
                           {hpExpr} AS resolved_hp_id
                    FROM public."Appointment" a
                    JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
                    LEFT JOIN public."AppointmentAttribute" aa ON aa."appointmentId" = a.id
                    {(hasServiceTable ? "LEFT JOIN public.\"Service\" svc ON svc.id = aa.\"serviceId\"" : string.Empty)}
                    WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL AND ar."userId" = ANY(@ids)
                    ORDER BY a.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(apptSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var apptId = r.GetInt32(0);
                        var v1Key = apptId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.SharedAppointmentId(v2ClinicId, apptId);
                        var subject = SyncTransforms.Clean(GetStr(r, 2), 250);
                        var complaint = SyncTransforms.Clean(GetStr(r, 3), 500);
                        var createdAt = GetUtc(r, 4) ?? TruncateUtcNow();
                        var updatedAt = GetUtc(r, 5) ?? createdAt;
                        var caseNum = SyncTransforms.Clean(GetStr(r, 6));
                        DateOnly? d = r.IsDBNull(7) ? null : r.GetFieldValue<DateOnly>(7);
                        var schedAt = CombineManilaDateTime(d, GetStr(r, 8), createdAt);
                        var dur = r.IsDBNull(9) ? 15 : Math.Clamp(r.GetInt32(9), 5, 240);
                        var status = SyncTransforms.MapPatientAppointmentStatus(GetStr(r, 10));
                        var checkedInAt = GetUtc(r, 11);
                        var serviceType = SyncTransforms.Clean(GetStr(r, 12) ?? subject, 200);
                        var resolvedHpId = r.IsDBNull(13) ? (int?)null : r.GetInt32(13);
                        var providerId = resolvedHpId.HasValue
                            ? DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"v1_hp:{resolvedHpId.Value}")
                            : Guid.Empty;
                        var notes = caseNum is not null ? SyncTransforms.Clean($"Legacy Case #: {caseNum}", 1000) : null;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["provider_id"] = FmtGuid(providerId),
                            ["subject"] = subject,
                            ["chief_complaint"] = complaint,
                            ["service_type"] = serviceType,
                            ["notes"] = notes,
                            ["scheduled_at"] = FmtUtc(schedAt),
                            ["duration_minutes"] = dur.ToString(CultureInfo.InvariantCulture),
                            ["status"] = status,
                            ["checked_in_at"] = FmtUtc(checkedInAt)
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.appointments (
                                    id, patient_id, clinic_id, provider_id, subject, chief_complaint,
                                    notes, attached_file_ids_json, service_type, scheduled_at, duration_minutes,
                                    status, cached_at, raw_json, checked_in_at,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @cid, @prov, @subj, @cc,
                                    @notes, '[]', @svc, @sched, @dur,
                                    @status, now(), '{}', @chkin,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    provider_id = EXCLUDED.provider_id,
                                    subject = EXCLUDED.subject,
                                    chief_complaint = EXCLUDED.chief_complaint,
                                    notes = EXCLUDED.notes,
                                    service_type = EXCLUDED.service_type,
                                    scheduled_at = EXCLUDED.scheduled_at,
                                    duration_minutes = EXCLUDED.duration_minutes,
                                    status = EXCLUDED.status,
                                    checked_in_at = EXCLUDED.checked_in_at,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            c.Parameters.AddWithValue("prov", providerId);
                            c.Parameters.AddWithValue("subj", (object?)subject ?? DBNull.Value);
                            c.Parameters.AddWithValue("cc", (object?)complaint ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("svc", (object?)serviceType ?? DBNull.Value);
                            c.Parameters.AddWithValue("sched", schedAt);
                            c.Parameters.AddWithValue("dur", dur);
                            c.Parameters.AddWithValue("status", status);
                            c.Parameters.Add(new NpgsqlParameter("chkin", NpgsqlDbType.TimestampTz) { Value = checkedInAt.HasValue ? checkedInAt.Value : DBNull.Value });
                            c.Parameters.AddWithValue("cat", createdAt);
                            c.Parameters.AddWithValue("uat", updatedAt);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAppointment", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, provider_id, subject, chief_complaint, service_type, notes, scheduled_at, duration_minutes, status, checked_in_at
                        FROM public.appointments
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["provider_id"] = FmtGuid(r.GetGuid(1)),
                            ["subject"] = GetStr(r, 2),
                            ["chief_complaint"] = GetStr(r, 3),
                            ["service_type"] = GetStr(r, 4),
                            ["notes"] = GetStr(r, 5),
                            ["scheduled_at"] = FmtUtc(GetUtc(r, 6)),
                            ["duration_minutes"] = r.GetInt32(7).ToString(CultureInfo.InvariantCulture),
                            ["status"] = GetStr(r, 8),
                            ["checked_in_at"] = FmtUtc(GetUtc(r, 9))
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B3. consultations (SharedConsultationId + provider_id + ConsultationNote + ConsultationDiagnosis)
            if (RunSection("PatientConsultation"))
            {
                var consultSql = $"""
                    SELECT t.id, COALESCE(cp."patientId", ar."userId") AS resolved_uid, t.subject, t."createdAt", t."updatedAt",
                           {(hasConsultHp ? """(SELECT thp."hpId" FROM public."ConsultationTicketHP" thp WHERE thp."consultationTicketId" = t.id ORDER BY thp.id ASC LIMIT 1)""" : "NULL::int")} AS hp_id,
                           {(hasConsultNote ? """(SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('subjective','s','chief_complaint','history'))""" : "NULL::text")} AS subj,
                           {(hasConsultNote ? """(SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('assessment','a','diagnosis','impression'))""" : "NULL::text")} AS assess,
                           {(hasConsultNote ? """(SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('plan','p','management','treatment','notes'))""" : "NULL::text")} AS plan_txt,
                           {(hasConsultNote ? """(SELECT string_agg(cn.section || ': ' || cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) NOT IN ('subjective','s','chief_complaint','history','assessment','a','diagnosis','impression','plan','p','management','treatment','notes'))""" : "NULL::text")} AS other_notes,
                           {(hasConsultDiag ? """(SELECT cd.description FROM public."ConsultationDiagnosis" cd WHERE cd."consultationTicketId" = t.id ORDER BY CASE WHEN upper(cd.type) = 'PRIMARY' THEN 0 ELSE 1 END, cd.id ASC LIMIT 1)""" : "NULL::text")} AS diag_desc,
                           {(hasConsultDiag ? """(SELECT cd."icd10Code" FROM public."ConsultationDiagnosis" cd WHERE cd."consultationTicketId" = t.id ORDER BY CASE WHEN upper(cd.type) = 'PRIMARY' THEN 0 ELSE 1 END, cd.id ASC LIMIT 1)""" : "NULL::text")} AS diag_icd10
                    FROM public."ConsultationTicket" t
                    LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId"
                    LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                    WHERE t."clinicId" = @cid AND t."isActive" = true AND COALESCE(cp."patientId", ar."userId") = ANY(@ids)
                    ORDER BY t.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(consultSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var ticketId = r.GetInt32(0);
                        var v1Key = ticketId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.SharedConsultationId(v2ClinicId, ticketId);
                        var cat = GetUtc(r, 3) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 4) ?? cat;
                        var hpId = r.IsDBNull(5) ? (int?)null : r.GetInt32(5);
                        var providerId = hpId.HasValue
                            ? DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"v1_hp:{hpId.Value}")
                            : Guid.Empty;
                        var chiefComplaint = SyncTransforms.Clean(GetStr(r, 2) ?? GetStr(r, 6), 500);
                        var assess = SyncTransforms.Clean(GetStr(r, 7), 2000);
                        var plan = SyncTransforms.Clean(GetStr(r, 8), 2000);
                        var notes = SyncTransforms.Clean(GetStr(r, 9), 2000);
                        var diagnosis = SyncTransforms.Clean(GetStr(r, 10) ?? assess, 500);
                        var icd10 = SyncTransforms.Clean(GetStr(r, 11), 20);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["provider_id"] = FmtGuid(providerId),
                            ["chief_complaint"] = chiefComplaint,
                            ["assessment"] = assess,
                            ["diagnosis"] = diagnosis,
                            ["icd10code"] = icd10,
                            ["plan"] = plan,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.consultations (
                                    id, patient_id, clinic_id, provider_id, consulted_at, chief_complaint,
                                    assessment, diagnosis, icd10code, plan, notes,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @cid, @prov, @cat, @cc,
                                    @assess, @diag, @icd, @plan, @notes,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    provider_id = EXCLUDED.provider_id,
                                    chief_complaint = EXCLUDED.chief_complaint,
                                    assessment = EXCLUDED.assessment,
                                    diagnosis = EXCLUDED.diagnosis,
                                    icd10code = EXCLUDED.icd10code,
                                    plan = EXCLUDED.plan,
                                    notes = EXCLUDED.notes,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            c.Parameters.AddWithValue("prov", providerId);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("cc", (object?)chiefComplaint ?? DBNull.Value);
                            c.Parameters.AddWithValue("assess", (object?)assess ?? DBNull.Value);
                            c.Parameters.AddWithValue("diag", (object?)diagnosis ?? DBNull.Value);
                            c.Parameters.AddWithValue("icd", (object?)icd10 ?? DBNull.Value);
                            c.Parameters.AddWithValue("plan", (object?)plan ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientConsultation", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, provider_id, chief_complaint, assessment, diagnosis, icd10code, plan, notes
                        FROM public.consultations
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["provider_id"] = FmtGuid(r.GetGuid(1)),
                            ["chief_complaint"] = GetStr(r, 2),
                            ["assessment"] = GetStr(r, 3),
                            ["diagnosis"] = GetStr(r, 4),
                            ["icd10code"] = GetStr(r, 5),
                            ["plan"] = GetStr(r, 6),
                            ["notes"] = GetStr(r, 7)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // Preload existing v2 consultation IDs for FK guard on vital_signs and prescriptions
            var existingV2ConsultIds = await LoadExistingConsultationIdsForPatientsAsync(v2, v2Pids, ct);

            // B4. vital_signs (strict NULL-ticket clinic attribution + numeric bounds + consultation_id FK guard)
            if (RunSection("PatientVitalSign"))
            {
                const string vitalSql = """
                    SELECT vs.id, vs."userId", vs."consultationTicketId", vs."dateTaken",
                           vs.weight, vs.height, vs.bmi, vs."bpSystolic", vs."bpDiastolic",
                           vs."pulseRate", vs.temp, vs.spo2, vs."respRate", vs."createdAt", vs."updatedAt",
                           CASE
                               WHEN vs."consultationTicketId" IS NOT NULL THEN true
                               WHEN (SELECT COUNT(DISTINCT cp."clinicId") FROM public."ClinicPatient" cp WHERE cp."patientId" = vs."userId" AND cp."deletedAt" IS NULL) = 1
                                    AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp2 WHERE cp2."patientId" = vs."userId" AND cp2."clinicId" = @cid AND cp2."deletedAt" IS NULL)
                                   THEN true
                               ELSE false
                           END AS is_clinic_attributed
                    FROM public."VitalSign" vs
                    WHERE vs."userId" = ANY(@ids) AND vs."deletedAt" IS NULL AND vs."isActive" = true
                      AND (vs."consultationTicketId" IS NULL OR EXISTS (
                          SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = vs."consultationTicketId" AND ct."clinicId" = @cid AND ct."isActive" = true
                      ))
                    ORDER BY vs.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(vitalSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var vId = r.GetInt32(0);
                        var v1Key = vId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var ticketId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var isClinicAttributed = r.GetBoolean(15);

                        var targetClinicId = isClinicAttributed ? v2ClinicId : Guid.Empty;
                        var source = isClinicAttributed ? "ClinicV1" : "PatientSelf";
                        var detId = DeterministicUuid.SharedVitalsId(targetClinicId, vId);

                        Guid? v2ConsultId = null;
                        if (ticketId.HasValue)
                        {
                            var candConsId = DeterministicUuid.SharedConsultationId(v2ClinicId, ticketId.Value);
                            if (existingV2ConsultIds.Contains(candConsId))
                            {
                                v2ConsultId = candConsId;
                            }
                        }

                        var recAt = GetUtc(r, 3) ?? GetUtc(r, 13) ?? TruncateUtcNow();
                        var cat = GetUtc(r, 13) ?? recAt;
                        var uat = GetUtc(r, 14) ?? recAt;

                        var wt = SyncTransforms.SanitizeWeightKg(GetDecNullable(r, 4));
                        var ht = SyncTransforms.SanitizeHeightCm(GetDecNullable(r, 5));
                        var bmi = SyncTransforms.SanitizeBmi(GetDecNullable(r, 6));
                        var sbp = r.IsDBNull(7) ? (int?)null : r.GetInt32(7);
                        var dbp = r.IsDBNull(8) ? (int?)null : r.GetInt32(8);
                        var hr = r.IsDBNull(9) ? (int?)null : r.GetInt32(9);
                        var temp = SyncTransforms.SanitizeTemperatureCelsius(GetDecNullable(r, 10));
                        var spo2 = SyncTransforms.SanitizeOxygenSaturationPercent(GetDecNullable(r, 11));
                        var rr = r.IsDBNull(12) ? (int?)null : r.GetInt32(12);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["clinic_id"] = FmtGuid(targetClinicId),
                            ["consultation_id"] = FmtGuid(v2ConsultId),
                            ["recorded_at"] = FmtUtc(recAt),
                            ["weight_kg"] = FmtDec(wt, 2),
                            ["height_cm"] = FmtDec(ht, 1),
                            ["bmi"] = FmtDec(bmi, 2),
                            ["systolic_bp"] = sbp?.ToString(CultureInfo.InvariantCulture),
                            ["diastolic_bp"] = dbp?.ToString(CultureInfo.InvariantCulture),
                            ["heart_rate_bpm"] = hr?.ToString(CultureInfo.InvariantCulture),
                            ["temperature_celsius"] = FmtDec(temp, 1),
                            ["oxygen_saturation_percent"] = FmtDec(spo2, 1),
                            ["respiratory_rate_breaths_per_min"] = rr?.ToString(CultureInfo.InvariantCulture),
                            ["source"] = source
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.vital_signs (
                                    id, patient_id, clinic_id, consultation_id, recorded_at,
                                    weight_kg, height_cm, bmi, systolic_bp, diastolic_bp,
                                    heart_rate_bpm, temperature_celsius, oxygen_saturation_percent, respiratory_rate_breaths_per_min,
                                    source, created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @cid, @consId, @recAt,
                                    @wt, @ht, @bmi, @sbp, @dbp,
                                    @hr, @temp, @spo2, @rr,
                                    @src, @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    clinic_id = EXCLUDED.clinic_id,
                                    consultation_id = EXCLUDED.consultation_id,
                                    recorded_at = EXCLUDED.recorded_at,
                                    weight_kg = EXCLUDED.weight_kg,
                                    height_cm = EXCLUDED.height_cm,
                                    bmi = EXCLUDED.bmi,
                                    systolic_bp = EXCLUDED.systolic_bp,
                                    diastolic_bp = EXCLUDED.diastolic_bp,
                                    heart_rate_bpm = EXCLUDED.heart_rate_bpm,
                                    temperature_celsius = EXCLUDED.temperature_celsius,
                                    oxygen_saturation_percent = EXCLUDED.oxygen_saturation_percent,
                                    respiratory_rate_breaths_per_min = EXCLUDED.respiratory_rate_breaths_per_min,
                                    source = EXCLUDED.source,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cid", targetClinicId);
                            c.Parameters.AddWithValue("consId", (object?)v2ConsultId ?? DBNull.Value);
                            c.Parameters.AddWithValue("recAt", recAt);
                            c.Parameters.Add(new NpgsqlParameter("wt", NpgsqlDbType.Numeric) { Value = wt.HasValue ? wt.Value : DBNull.Value });
                            c.Parameters.Add(new NpgsqlParameter("ht", NpgsqlDbType.Numeric) { Value = ht.HasValue ? ht.Value : DBNull.Value });
                            c.Parameters.Add(new NpgsqlParameter("bmi", NpgsqlDbType.Numeric) { Value = bmi.HasValue ? bmi.Value : DBNull.Value });
                            c.Parameters.AddWithValue("sbp", (object?)sbp ?? DBNull.Value);
                            c.Parameters.AddWithValue("dbp", (object?)dbp ?? DBNull.Value);
                            c.Parameters.AddWithValue("hr", (object?)hr ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("temp", NpgsqlDbType.Numeric) { Value = temp.HasValue ? temp.Value : DBNull.Value });
                            c.Parameters.Add(new NpgsqlParameter("spo2", NpgsqlDbType.Numeric) { Value = spo2.HasValue ? spo2.Value : DBNull.Value });
                            c.Parameters.AddWithValue("rr", (object?)rr ?? DBNull.Value);
                            c.Parameters.AddWithValue("src", source);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientVitalSign", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, clinic_id, consultation_id, recorded_at,
                               weight_kg, height_cm, bmi, systolic_bp, diastolic_bp,
                               heart_rate_bpm, temperature_celsius, oxygen_saturation_percent, respiratory_rate_breaths_per_min, source
                        FROM public.vital_signs
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["clinic_id"] = FmtGuid(r.GetGuid(1)),
                            ["consultation_id"] = r.IsDBNull(2) ? null : FmtGuid(r.GetGuid(2)),
                            ["recorded_at"] = FmtUtc(GetUtc(r, 3)),
                            ["weight_kg"] = FmtDec(GetDecNullable(r, 4), 2),
                            ["height_cm"] = FmtDec(GetDecNullable(r, 5), 1),
                            ["bmi"] = FmtDec(GetDecNullable(r, 6), 2),
                            ["systolic_bp"] = r.IsDBNull(7) ? null : r.GetInt32(7).ToString(CultureInfo.InvariantCulture),
                            ["diastolic_bp"] = r.IsDBNull(8) ? null : r.GetInt32(8).ToString(CultureInfo.InvariantCulture),
                            ["heart_rate_bpm"] = r.IsDBNull(9) ? null : r.GetInt32(9).ToString(CultureInfo.InvariantCulture),
                            ["temperature_celsius"] = FmtDec(GetDecNullable(r, 10), 1),
                            ["oxygen_saturation_percent"] = FmtDec(GetDecNullable(r, 11), 1),
                            ["respiratory_rate_breaths_per_min"] = r.IsDBNull(12) ? null : r.GetInt32(12).ToString(CultureInfo.InvariantCulture),
                            ["source"] = GetStr(r, 13)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B5a. prescription_documents + natural-key adoption map for B5b
            var rxDocIdMap = await LoadExistingRxDocByBizKeyAsync(v2, v2Pids, ct);
            if (RunSection("PatientPrescriptionDocument"))
            {
                var rxDocSql = $"""
                    SELECT p.id, cp."patientId", p."hpId", p."serialNumber", p.remarks, p."createdAt", p."updatedAt",
                           COALESCE(bool_and(COALESCE(md."isDispensed", false)), false) AS all_dispensed,
                           COUNT(m.id) AS active_med_count,
                           {(hasConsultDiag ? """(SELECT cd.description FROM public."ConsultationDiagnosis" cd WHERE cd."consultationTicketId" = p."consultationTicketId" ORDER BY CASE WHEN upper(cd.type) = 'PRIMARY' THEN 0 ELSE 1 END, cd.id ASC LIMIT 1)""" : "NULL::text")} AS diag_desc
                    FROM public."Prescription" p
                    JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                    JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
                    LEFT JOIN public."Medicine" m ON m."prescriptionId" = p.id AND m."deletedAt" IS NULL AND m."isActive" = true
                    LEFT JOIN public."MedicineDispenseRecord" md ON md."medicineId" = m.id
                    WHERE p."clinicId" = @cid AND p."isActive" = true AND cp."patientId" = ANY(@ids)
                    GROUP BY p.id, cp."patientId", p."hpId", p."serialNumber", p.remarks, p."createdAt", p."updatedAt", p."consultationTicketId"
                    ORDER BY p.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(rxDocSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var rxId = r.GetInt32(0);
                        var v1Key = rxId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var hpId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var serial = SyncTransforms.Clean(GetStr(r, 3), 40);
                        var rxNum = serial is not null ? $"{serial}-V1-{rxId}" : $"V1-RX-{rxId:D6}";
                        if (rxNum.Length > 60) rxNum = $"V1-RX-{rxId:D6}";
                        var instructions = SyncTransforms.Clean(GetStr(r, 4), 1000);
                        var cat = GetUtc(r, 5) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 6) ?? cat;
                        var allDispensed = r.GetBoolean(7);
                        var activeMedCount = r.GetInt64(8);
                        var stage = activeMedCount > 0 && allDispensed ? "Dispensed" : "Issued";
                        var diagnosis = SyncTransforms.Clean(GetStr(r, 9), 500);

                        var doc = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var c)
                            ? c : new ClinicianSnapshot("Clinic Physician", null, null);
                        var prescriberName = SyncTransforms.CleanRequired(doc.Name, "Clinic Physician", 200);
                        var prescriberPrc = SyncTransforms.Clean(doc.PrcLicense, 50) ?? string.Empty;

                        var detId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_rxdoc:{rxId}");
                        var bizRxGuid = detId;
                        Guid? adoptedId = rxDocIdMap.TryGetValue((pid, bizRxGuid), out var exId) ? exId : null;
                        var resolvedId = adoptedId ?? detId;
                        rxDocIdMap[(pid, bizRxGuid)] = resolvedId;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["prescription_number"] = rxNum,
                            ["prescriber_name"] = prescriberName,
                            ["prescriber_prc_license"] = prescriberPrc,
                            ["diagnosis"] = diagnosis,
                            ["instructions"] = instructions,
                            ["stage"] = stage
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, adoptedId, canonical, targetId =>
                        {
                            var cmdUpsert = new NpgsqlBatchCommand("""
                                INSERT INTO public.prescription_documents (
                                    id, patient_id, prescription_id, prescription_number,
                                    ordering_tenant_id, ordering_facility_id, ordering_facility_name,
                                    prescriber_name, prescriber_prc_license, diagnosis, instructions,
                                    stage, stage_changed_at, issued_at, has_details,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @rxBizId, @rxNum,
                                    @tid, @fid, @fname,
                                    @pname, @pprc, @diag, @inst,
                                    @stage, @cat, @cat, true,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id, prescription_id) DO UPDATE SET
                                    prescription_number = EXCLUDED.prescription_number,
                                    ordering_tenant_id = EXCLUDED.ordering_tenant_id,
                                    ordering_facility_id = EXCLUDED.ordering_facility_id,
                                    ordering_facility_name = EXCLUDED.ordering_facility_name,
                                    prescriber_name = EXCLUDED.prescriber_name,
                                    prescriber_prc_license = EXCLUDED.prescriber_prc_license,
                                    diagnosis = EXCLUDED.diagnosis,
                                    instructions = EXCLUDED.instructions,
                                    stage = EXCLUDED.stage,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            cmdUpsert.Parameters.AddWithValue("id", targetId);
                            cmdUpsert.Parameters.AddWithValue("pid", pid);
                            cmdUpsert.Parameters.AddWithValue("rxBizId", bizRxGuid);
                            cmdUpsert.Parameters.AddWithValue("rxNum", rxNum);
                            cmdUpsert.Parameters.AddWithValue("tid", v2TenantId);
                            cmdUpsert.Parameters.AddWithValue("fid", facilityIdStr);
                            cmdUpsert.Parameters.AddWithValue("fname", cleanFacility);
                            cmdUpsert.Parameters.AddWithValue("pname", prescriberName);
                            cmdUpsert.Parameters.AddWithValue("pprc", prescriberPrc);
                            cmdUpsert.Parameters.AddWithValue("diag", (object?)diagnosis ?? DBNull.Value);
                            cmdUpsert.Parameters.AddWithValue("inst", (object?)instructions ?? DBNull.Value);
                            cmdUpsert.Parameters.AddWithValue("stage", stage);
                            cmdUpsert.Parameters.AddWithValue("cat", cat);
                            cmdUpsert.Parameters.AddWithValue("uat", uat);
                            cmdUpsert.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return cmdUpsert;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientPrescriptionDocument", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, prescription_number, prescriber_name, prescriber_prc_license, diagnosis, instructions, stage
                        FROM public.prescription_documents
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["prescription_number"] = GetStr(r, 1),
                            ["prescriber_name"] = GetStr(r, 2),
                            ["prescriber_prc_license"] = GetStr(r, 3),
                            ["diagnosis"] = GetStr(r, 4),
                            ["instructions"] = GetStr(r, 5),
                            ["stage"] = GetStr(r, 6)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B5b. prescriptions (links prescription_document_id + invariant integer days duration + full ON CONFLICT)
            if (RunSection("PatientPrescription"))
            {
                var rxLineSql = $"""
                    SELECT m.id, p.id AS rx_id, p."consultationTicketId", cp."patientId", m.name, m."genericName", m."brandName",
                           m.unit, m.dosage, m.frequency, m.duration, m.notes, m.qty, m."createdAt", m."updatedAt",
                           COALESCE(md."isDispensed", false),
                           {(hasMedPhilHealth ? "mp.\"drugCode\"" : "NULL::text")} AS drug_code
                    FROM public."Medicine" m
                    JOIN public."Prescription" p ON p.id = m."prescriptionId"
                    JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                    JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
                    LEFT JOIN public."MedicineDispenseRecord" md ON md."medicineId" = m.id
                    {(hasMedPhilHealth ? "LEFT JOIN public.\"MedicinePhilHealthData\" mp ON mp.\"medicineId\" = m.id" : string.Empty)}
                    WHERE p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true
                      AND cp."patientId" = ANY(@ids)
                    ORDER BY p.id ASC, m.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                var sortIndexByRx = new Dictionary<int, int>();
                await using (var cmd = new NpgsqlCommand(rxLineSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var medId = r.GetInt32(0);
                        var v1Key = medId.ToString(CultureInfo.InvariantCulture);
                        var rxId = r.GetInt32(1);
                        var ticketId = r.GetInt32(2);
                        var uid = r.GetInt32(3);
                        var pid = Pid(uid);

                        sortIndexByRx.TryGetValue(rxId, out var sortIdx);
                        sortIndexByRx[rxId] = sortIdx + 1;

                        var detId = DeterministicUuid.SharedPrescriptionId(v2ClinicId, medId);
                        var candConsId = DeterministicUuid.SharedConsultationId(v2ClinicId, ticketId);
                        Guid? v2ConsultId = existingV2ConsultIds.Contains(candConsId) ? candConsId : null;

                        var rxBizGuid = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_rxdoc:{rxId}");
                        Guid? rxDocId = rxDocIdMap.TryGetValue((pid, rxBizGuid), out var resolvedDocId) ? resolvedDocId : null;

                        var medName = SyncTransforms.CleanRequired(GetStr(r, 4) ?? GetStr(r, 5), "Medication", 200);
                        var genName = SyncTransforms.Clean(GetStr(r, 5), 200);
                        var brandName = SyncTransforms.Clean(GetStr(r, 6), 200);
                        var form = SyncTransforms.Clean(GetStr(r, 7), 50);
                        var dosage = SyncTransforms.Clean(GetStr(r, 8), 100);
                        var frequency = SyncTransforms.Clean(GetStr(r, 9), 100);
                        var duration = r.IsDBNull(10) ? null : r.GetInt32(10).ToString(CultureInfo.InvariantCulture);
                        var instructions = SyncTransforms.Clean(GetStr(r, 11), 500);
                        var qty = r.IsDBNull(12) ? (int?)null : r.GetInt32(12);
                        var cat = GetUtc(r, 13) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 14) ?? cat;
                        var isDisp = r.GetBoolean(15);
                        var drugCode = SyncTransforms.Clean(GetStr(r, 16), 100);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["consultation_id"] = FmtGuid(v2ConsultId),
                            ["prescription_document_id"] = FmtGuid(rxDocId),
                            ["medication_name"] = medName,
                            ["generic_name"] = genName,
                            ["brand_name"] = brandName,
                            ["form"] = form,
                            ["dosage"] = dosage,
                            ["frequency"] = frequency,
                            ["duration"] = duration,
                            ["instructions"] = instructions,
                            ["quantity"] = qty?.ToString(CultureInfo.InvariantCulture),
                            ["is_dispensed"] = FmtBool(isDisp),
                            ["phil_health_drug_code"] = drugCode
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public.prescriptions (
                                    id, consultation_id, prescription_document_id, patient_id, clinic_id,
                                    medication_name, generic_name, brand_name, form, sort_order,
                                    dosage, frequency, duration, instructions, quantity,
                                    issued_at, is_dispensed, is_phil_health_gamot, phil_health_drug_code,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @consId, @rxDocId, @pid, @cid,
                                    @mname, @gen, @brand, @form, @sort,
                                    @dos, @freq, @dur, @inst, @qty,
                                    @cat, @disp, false, @dcode,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    consultation_id = EXCLUDED.consultation_id,
                                    prescription_document_id = EXCLUDED.prescription_document_id,
                                    medication_name = EXCLUDED.medication_name,
                                    generic_name = EXCLUDED.generic_name,
                                    brand_name = EXCLUDED.brand_name,
                                    form = EXCLUDED.form,
                                    dosage = EXCLUDED.dosage,
                                    frequency = EXCLUDED.frequency,
                                    duration = EXCLUDED.duration,
                                    instructions = EXCLUDED.instructions,
                                    quantity = EXCLUDED.quantity,
                                    is_dispensed = EXCLUDED.is_dispensed,
                                    phil_health_drug_code = EXCLUDED.phil_health_drug_code,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("consId", (object?)v2ConsultId ?? DBNull.Value);
                            c.Parameters.AddWithValue("rxDocId", (object?)rxDocId ?? DBNull.Value);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            c.Parameters.AddWithValue("mname", medName);
                            c.Parameters.AddWithValue("gen", (object?)genName ?? DBNull.Value);
                            c.Parameters.AddWithValue("brand", (object?)brandName ?? DBNull.Value);
                            c.Parameters.AddWithValue("form", (object?)form ?? DBNull.Value);
                            c.Parameters.AddWithValue("sort", sortIdx);
                            c.Parameters.AddWithValue("dos", (object?)dosage ?? DBNull.Value);
                            c.Parameters.AddWithValue("freq", (object?)frequency ?? DBNull.Value);
                            c.Parameters.AddWithValue("dur", (object?)duration ?? DBNull.Value);
                            c.Parameters.AddWithValue("inst", (object?)instructions ?? DBNull.Value);
                            c.Parameters.AddWithValue("qty", (object?)qty ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("disp", isDisp);
                            c.Parameters.AddWithValue("dcode", (object?)drugCode ?? DBNull.Value);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientPrescription", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, consultation_id, prescription_document_id, medication_name, generic_name, brand_name,
                               form, dosage, frequency, duration, instructions, quantity, is_dispensed, phil_health_drug_code
                        FROM public.prescriptions
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["consultation_id"] = r.IsDBNull(1) ? null : FmtGuid(r.GetGuid(1)),
                            ["prescription_document_id"] = r.IsDBNull(2) ? null : FmtGuid(r.GetGuid(2)),
                            ["medication_name"] = GetStr(r, 3),
                            ["generic_name"] = GetStr(r, 4),
                            ["brand_name"] = GetStr(r, 5),
                            ["form"] = GetStr(r, 6),
                            ["dosage"] = GetStr(r, 7),
                            ["frequency"] = GetStr(r, 8),
                            ["duration"] = GetStr(r, 9),
                            ["instructions"] = GetStr(r, 10),
                            ["quantity"] = r.IsDBNull(11) ? null : r.GetInt32(11).ToString(CultureInfo.InvariantCulture),
                            ["is_dispensed"] = FmtBool(r.GetBoolean(12)),
                            ["phil_health_drug_code"] = GetStr(r, 13)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B6. medical_certificates (real clinician snapshot + (patient_id, certificate_id) pre-adoption)
            if (RunSection("PatientMedicalCertificate") && hasMedCertTable)
            {
                var existingCerts = await LoadExistingByBizKeyAsync(
                    v2,
                    "SELECT patient_id, certificate_id, id FROM public.medical_certificates WHERE patient_id = ANY(@pids) AND is_deleted = false",
                    v2Pids, ct);

                var mcSql = $"""
                    SELECT mc.id, cp."patientId", mc."hpId", mc."serialNumber", mc.impression, mc.remarks, mc."createdAt", mc."updatedAt",
                           {(hasMedCertReason ? "mr.name" : "NULL::text")} AS reason_name
                    FROM public."ClinicMedicalCertificate" mc
                    JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId"
                    {(hasMedCertReason ? "LEFT JOIN public.\"MedicalCertificateReason\" mr ON mr.id = mc.\"reasonId\"" : string.Empty)}
                    WHERE mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true AND cp."patientId" = ANY(@ids)
                    ORDER BY mc.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(mcSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var mcId = r.GetInt32(0);
                        var v1Key = mcId.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var hpId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var detId = DeterministicUuid.SharedMedicalCertificateId(v2ClinicId, mcId);
                        Guid? adoptedId = existingCerts.TryGetValue((pid, detId), out var exId) ? exId : null;

                        var serial = SyncTransforms.Clean(GetStr(r, 3), 40);
                        var cnum = serial is not null ? $"{serial}-V1-{mcId}" : $"V1-MC-{mcId:D6}";
                        if (cnum.Length > 60) cnum = $"V1-MC-{mcId:D6}";

                        var doc = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var c)
                            ? c : new ClinicianSnapshot("Clinic Physician", null, null);
                        var doctorName = SyncTransforms.CleanRequired(doc.Name, "Clinic Physician", 200);
                        var doctorPrc = SyncTransforms.Clean(doc.PrcLicense, 50) ?? string.Empty;
                        var doctorPtr = SyncTransforms.Clean(doc.PtrNumber, 50);
                        var purpose = SyncTransforms.CleanRequired(GetStr(r, 8), "Medical Clearance", 300);
                        var diagnosis = SyncTransforms.Clean(GetStr(r, 4), 500);
                        var remarks = SyncTransforms.Clean(GetStr(r, 5), 1000);
                        var cat = GetUtc(r, 6) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 7) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["certificate_number"] = cnum,
                            ["doctor_name"] = doctorName,
                            ["doctor_prc_license"] = doctorPrc,
                            ["doctor_ptr_number"] = doctorPtr,
                            ["purpose"] = purpose,
                            ["diagnosis"] = diagnosis,
                            ["remarks"] = remarks
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, adoptedId, canonical, targetId =>
                        {
                            var mcCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public.medical_certificates (
                                    id, patient_id, certificate_id, certificate_number,
                                    issuer_tenant_id, issuer_facility_id, issuer_name,
                                    doctor_name, doctor_prc_license, doctor_ptr_number,
                                    purpose, diagnosis, remarks, issued_at,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @certBizId, @cnum,
                                    @tid, @fid, @fname,
                                    @dname, @dprc, @dptr,
                                    @purp, @diag, @rem, @cat,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id, certificate_id) DO UPDATE SET
                                    certificate_number = EXCLUDED.certificate_number,
                                    issuer_tenant_id = EXCLUDED.issuer_tenant_id,
                                    issuer_facility_id = EXCLUDED.issuer_facility_id,
                                    issuer_name = EXCLUDED.issuer_name,
                                    doctor_name = EXCLUDED.doctor_name,
                                    doctor_prc_license = EXCLUDED.doctor_prc_license,
                                    doctor_ptr_number = EXCLUDED.doctor_ptr_number,
                                    purpose = EXCLUDED.purpose,
                                    diagnosis = EXCLUDED.diagnosis,
                                    remarks = EXCLUDED.remarks,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            mcCmd.Parameters.AddWithValue("id", targetId);
                            mcCmd.Parameters.AddWithValue("pid", pid);
                            mcCmd.Parameters.AddWithValue("certBizId", detId);
                            mcCmd.Parameters.AddWithValue("cnum", cnum);
                            mcCmd.Parameters.AddWithValue("tid", v2TenantId);
                            mcCmd.Parameters.AddWithValue("fid", facilityIdStr);
                            mcCmd.Parameters.AddWithValue("fname", cleanFacility);
                            mcCmd.Parameters.AddWithValue("dname", doctorName);
                            mcCmd.Parameters.AddWithValue("dprc", doctorPrc);
                            mcCmd.Parameters.AddWithValue("dptr", (object?)doctorPtr ?? DBNull.Value);
                            mcCmd.Parameters.AddWithValue("purp", purpose);
                            mcCmd.Parameters.AddWithValue("diag", (object?)diagnosis ?? DBNull.Value);
                            mcCmd.Parameters.AddWithValue("rem", (object?)remarks ?? DBNull.Value);
                            mcCmd.Parameters.AddWithValue("cat", cat);
                            mcCmd.Parameters.AddWithValue("uat", uat);
                            mcCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return mcCmd;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientMedicalCertificate", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, certificate_number, doctor_name, doctor_prc_license, doctor_ptr_number, purpose, diagnosis, remarks
                        FROM public.medical_certificates
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["certificate_number"] = GetStr(r, 1),
                            ["doctor_name"] = GetStr(r, 2),
                            ["doctor_prc_license"] = GetStr(r, 3),
                            ["doctor_ptr_number"] = GetStr(r, 4),
                            ["purpose"] = GetStr(r, 5),
                            ["diagnosis"] = GetStr(r, 6),
                            ["remarks"] = GetStr(r, 7)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B7. lab_request_slips (Lab + Imaging + HeartStation requests & procedures)
            if (RunSection("PatientLabRequestSlip"))
            {
                var existingSlips = await LoadExistingByBizKeyAsync(
                    v2,
                    "SELECT patient_id, requisition_id, id FROM public.lab_request_slips WHERE patient_id = ANY(@pids) AND is_deleted = false",
                    v2Pids, ct);

                var procMap = await LoadDiagnosticProceduresByRequestAsync(v1, v1ClinicId, ids, ct);

                const string slipSql = """
                    SELECT 'lab' AS kind, r.id, cp."patientId", r."serialNumber", r.impression, NULL::text AS reason, r."createdAt", r."updatedAt"
                    FROM public."ClinicLaboratoryRequest" r
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    UNION ALL
                    SELECT 'img' AS kind, r.id, cp."patientId", r."serialNumber", r.impression, COALESCE(r.reason, r.history), r."createdAt", r."updatedAt"
                    FROM public."ClinicImagingRequest" r
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    UNION ALL
                    SELECT 'ecg' AS kind, r.id, cp."patientId", r."serialNumber", r.impression, COALESCE(r.reason, r.history), r."createdAt", r."updatedAt"
                    FROM public."ClinicHeartStationRequest" r
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    ORDER BY kind ASC, id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(slipSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var kind = r.GetString(0);
                        var reqId = r.GetInt32(1);
                        var v1Key = $"{kind}:{reqId}";
                        var uid = r.GetInt32(2);
                        var pid = Pid(uid);
                        var reqBizId = DeterministicUuid.SharedLabOrderId(v2ClinicId, kind, reqId);
                        Guid? adoptedId = existingSlips.TryGetValue((pid, reqBizId), out var exId) ? exId : null;

                        var accession = SyncTransforms.CleanRequired($"V1-{kind.ToUpperInvariant()}-{reqId}", $"V1-{reqId}", 60);
                        var items = procMap.TryGetValue(v1Key, out var list) ? list : new List<LabSlipItemDto>();
                        var itemsJson = JsonSerializer.Serialize(items, WebJsonOpts);

                        var defaultTitle = kind switch
                        {
                            "img" => "Imaging Request",
                            "ecg" => "Cardiology / ECG Request",
                            _ => "Laboratory Request"
                        };
                        var title = items.Count > 0
                            ? SyncTransforms.CleanRequired(string.Join(", ", items.Select(x => x.Name)), defaultTitle, 300)
                            : defaultTitle;
                        var reason = SyncTransforms.Clean(GetStr(r, 5) ?? GetStr(r, 4), 500);
                        var cat = GetUtc(r, 6) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 7) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["accession_number"] = accession,
                            ["title"] = title,
                            ["urgency"] = "Routine",
                            ["items_json"] = itemsJson,
                            ["stage"] = "Issued",
                            ["reason"] = reason
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, reqBizId, adoptedId, canonical, targetId =>
                        {
                            var sCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public.lab_request_slips (
                                    id, patient_id, requisition_id, ordering_tenant_id, ordering_facility_id, ordering_facility_name,
                                    accession_number, title, urgency, items_json, stage, stage_changed_at,
                                    payment_required, reason, issued_at, has_details,
                                    created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @reqId, @tid, @fid, @fname,
                                    @acc, @title, 'Routine', @items, 'Issued', @cat,
                                    false, @reason, @cat, true,
                                    @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (patient_id, requisition_id) DO UPDATE SET
                                    ordering_tenant_id = EXCLUDED.ordering_tenant_id,
                                    ordering_facility_id = EXCLUDED.ordering_facility_id,
                                    ordering_facility_name = EXCLUDED.ordering_facility_name,
                                    accession_number = EXCLUDED.accession_number,
                                    title = EXCLUDED.title,
                                    urgency = EXCLUDED.urgency,
                                    items_json = EXCLUDED.items_json,
                                    stage = EXCLUDED.stage,
                                    reason = EXCLUDED.reason,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            sCmd.Parameters.AddWithValue("id", targetId);
                            sCmd.Parameters.AddWithValue("pid", pid);
                            sCmd.Parameters.AddWithValue("reqId", reqBizId);
                            sCmd.Parameters.AddWithValue("tid", v2TenantId);
                            sCmd.Parameters.AddWithValue("fid", facilityIdStr);
                            sCmd.Parameters.AddWithValue("fname", cleanFacility);
                            sCmd.Parameters.AddWithValue("acc", accession);
                            sCmd.Parameters.AddWithValue("title", title);
                            sCmd.Parameters.AddWithValue("items", itemsJson);
                            sCmd.Parameters.AddWithValue("reason", (object?)reason ?? DBNull.Value);
                            sCmd.Parameters.AddWithValue("cat", cat);
                            sCmd.Parameters.AddWithValue("uat", uat);
                            sCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return sCmd;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientLabRequestSlip", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, accession_number, title, urgency, items_json, stage, reason
                        FROM public.lab_request_slips
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["accession_number"] = GetStr(r, 1),
                            ["title"] = GetStr(r, 2),
                            ["urgency"] = GetStr(r, 3),
                            ["items_json"] = GetStr(r, 4),
                            ["stage"] = GetStr(r, 5),
                            ["reason"] = GetStr(r, 6)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }

            // B8. vaccinations_administered (legacy UserVaccination where hpId IS NOT NULL for active ClinicPatient)
            if (RunSection("VaccinationAdministered") && hasUserVaccinationTable)
            {
                var vaxAdminSql = $"""
                    SELECT uv.id, uv."userId",
                           {(hasVaccineTable ? "COALESCE(v.name, 'Vaccine')" : "'Vaccine'::text")},
                           {(hasDoseTable ? "d.dose" : "NULL::text")},
                           {(hasRouteTable ? "rt.route" : "NULL::text")} AS route_name,
                           uv."dateGiven", uv."administeredBy", uv."hpId", uv."createdAt", uv."updatedAt"
                    FROM public."UserVaccination" uv
                    {(hasVaccineTable ? "LEFT JOIN public.\"Vaccine\" v ON v.id = uv.\"vaccineId\"" : string.Empty)}
                    {(hasDoseTable ? "LEFT JOIN public.\"Dose\" d ON d.id = uv.\"doseId\"" : string.Empty)}
                    {(hasRouteTable ? "LEFT JOIN public.\"Route\" rt ON rt.id = uv.\"routeId\"" : string.Empty)}
                    WHERE uv."userId" = ANY(@ids) AND uv."deletedAt" IS NULL AND uv."isActive" = true
                      AND uv."hpId" IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = uv."userId" AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                    ORDER BY uv.id ASC
                    """;

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand(vaxAdminSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0);
                        var v1Key = v1Id.ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = Pid(uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_vax_admin:{v1Id}");
                        var vname = SyncTransforms.CleanRequired(GetStr(r, 2), "Vaccine", 200);
                        var dose = SyncTransforms.Clean(GetStr(r, 3), 20);
                        var route = SyncTransforms.Clean(GetStr(r, 4), 50);
                        var cat = GetUtc(r, 8) ?? TruncateUtcNow();
                        var uat = GetUtc(r, 9) ?? cat;
                        var dateAdmin = (r.IsDBNull(5) ? null : SyncTransforms.ToSafeDateOnly(r.GetDateTime(5)))
                            ?? DateOnly.FromDateTime(cat.ToOffset(ManilaOffset).DateTime);
                        var hpId = r.IsDBNull(7) ? (int?)null : r.GetInt32(7);
                        var adminBy = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var doc)
                            ? SyncTransforms.Clean(doc.Name, 200)
                            : SyncTransforms.Clean(GetStr(r, 6), 200);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["vaccine_name"] = vname,
                            ["dose_number"] = dose,
                            ["date_administered"] = FmtDate(dateAdmin),
                            ["administered_by"] = adminBy,
                            ["facility"] = cleanFacility,
                            ["route"] = route,
                            ["vaccine_program"] = "Other"
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var vCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public.vaccinations_administered (
                                    id, patient_id, clinic_id, vaccine_name, dose_number, date_administered,
                                    administered_by, facility, route, adverse_reaction, vaccine_program,
                                    synced_at, created_at, created_by, updated_at, updated_by, is_deleted
                                ) VALUES (
                                    @id, @pid, @cid, @vname, @dose, @dadmin,
                                    @aby, @fac, @route, 'None', 'Other',
                                    now(), @cat, @actor, @uat, @actor, false
                                ) ON CONFLICT (id) DO UPDATE SET
                                    vaccine_name = EXCLUDED.vaccine_name,
                                    dose_number = EXCLUDED.dose_number,
                                    date_administered = EXCLUDED.date_administered,
                                    administered_by = EXCLUDED.administered_by,
                                    facility = EXCLUDED.facility,
                                    route = EXCLUDED.route,
                                    updated_at = now(),
                                    updated_by = @actor
                                """);
                            vCmd.Parameters.AddWithValue("id", targetId);
                            vCmd.Parameters.AddWithValue("pid", pid);
                            vCmd.Parameters.AddWithValue("cid", v2ClinicId);
                            vCmd.Parameters.AddWithValue("vname", vname);
                            vCmd.Parameters.AddWithValue("dose", (object?)dose ?? DBNull.Value);
                            vCmd.Parameters.Add(new NpgsqlParameter("dadmin", NpgsqlDbType.Date) { Value = dateAdmin });
                            vCmd.Parameters.AddWithValue("aby", (object?)adminBy ?? DBNull.Value);
                            vCmd.Parameters.AddWithValue("fac", cleanFacility);
                            vCmd.Parameters.AddWithValue("route", (object?)route ?? DBNull.Value);
                            vCmd.Parameters.AddWithValue("cat", cat);
                            vCmd.Parameters.AddWithValue("uat", uat);
                            vCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            return vCmd;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "VaccinationAdministered", v2Pids, candidates,
                    tIds => LoadStringMapRowsAsync(v2, """
                        SELECT id, vaccine_name, dose_number, date_administered, administered_by, facility, route, vaccine_program
                        FROM public.vaccinations_administered
                        WHERE id = ANY(@ids) AND is_deleted = false
                        """, tIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["vaccine_name"] = GetStr(r, 1),
                            ["dose_number"] = GetStr(r, 2),
                            ["date_administered"] = FmtDate(r.GetFieldValue<DateOnly>(3)),
                            ["administered_by"] = GetStr(r, 4),
                            ["facility"] = GetStr(r, 5),
                            ["route"] = GetStr(r, 6),
                            ["vaccine_program"] = GetStr(r, 7)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, shieldedInRun: shieldedInRun);
            }
        }
    }

    // -------------------------------------------------------------------------
    // M2.2-Parity Child Batch Execution Engine (Canonical Hash + v2-wins + Diffs + Shield)
    // -------------------------------------------------------------------------
    private sealed record ChildSyncCandidate(
        string V1Id,
        Guid DeterministicV2Id,
        Guid? AdoptedV2Id,
        Dictionary<string, string?> CanonicalFields,
        Func<Guid, NpgsqlBatchCommand> BuildUpsertCommand);

    private async Task<HashSet<string>> ExecuteChildSyncBatchAsync(
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        string entityType,
        Guid[] chunkV2PatientIds,
        IReadOnlyList<ChildSyncCandidate> candidates,
        Func<Guid[], Task<Dictionary<Guid, Dictionary<string, string?>>>> loadExistingStatesAsync,
        bool isDryRun,
        bool forceV1OnConflict,
        string? targetV1IdFilter,
        SyncRunSummary summary,
        CancellationToken ct,
        HashSet<string>? overrideActiveV1Ids = null,
        bool skipChildDeletionShield = false,
        HashSet<(string EntityType, string V1Id)>? shieldedInRun = null)
    {
        var writtenV1Ids = new HashSet<string>(StringComparer.Ordinal);
        var counter = summary.For(entityType);
        var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();

        var filtered = targetV1IdFilter is null
            ? candidates
            : candidates.Where(c => string.Equals(c.V1Id, targetV1IdFilter, StringComparison.Ordinal)).ToList();

        if (filtered.Count > 0)
        {
            var v1Ids = filtered.Select(c => c.V1Id).Distinct().ToArray();
            var targetIds = filtered.Select(c => c.AdoptedV2Id ?? c.DeterministicV2Id).Distinct().ToArray();

            var storedHashes = await _ledger.LoadRowHashesForIdsAsync(binding.Id, entityType, v1Ids, ct);
            var existingIdMap = await _ledger.GetIdMappingsByV1IdsAsync(binding.Id, entityType, v1Ids, ct);
            var existingStates = await loadExistingStatesAsync(targetIds);

            var ledgerUpdates = new List<(string V1Id, Guid V2Id, string V1Hash, string V2ExpectedHash)>();
            await using var writeBatch = new NpgsqlBatch(v2);

            foreach (var c in filtered)
            {
                var targetId = c.AdoptedV2Id ?? c.DeterministicV2Id;
                var v1Hash = DeterministicUuid.ComputeCanonicalHash(c.CanonicalFields);
                var existsInV2 = existingStates.TryGetValue(targetId, out var liveFields);

                if (existsInV2 && storedHashes.TryGetValue(c.V1Id, out var prevHash))
                {
                    if (!forceV1OnConflict && string.Equals(prevHash.V1PayloadHash, v1Hash, StringComparison.Ordinal))
                    {
                        counter.Unchanged++;
                        if (!isDryRun && (!existingIdMap.TryGetValue(c.V1Id, out var mappedId) || mappedId != targetId))
                        {
                            ledgerUpdates.Add((c.V1Id, targetId, prevHash.V1PayloadHash, prevHash.V2ExpectedHash));
                        }
                        continue;
                    }

                    var liveV2Hash = DeterministicUuid.ComputeCanonicalHash(liveFields!);
                    var changedFields = DeterministicUuid.ComputeChangedFieldNames(liveFields!, c.CanonicalFields);
                    if (!forceV1OnConflict && !string.Equals(liveV2Hash, prevHash.V2ExpectedHash, StringComparison.Ordinal))
                    {
                        counter.SkippedV2Wins++;
                        if (diffBatch.Count < 500)
                            diffBatch.Add((entityType, c.V1Id, targetId, SyncDiffAction.SkipV2Wins, changedFields));
                        if (!isDryRun)
                        {
                            await _ledger.RecordConflictAsync(binding.Id, runId, entityType, c.V1Id, targetId,
                                SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                        }
                        continue;
                    }

                    counter.Updated++;
                    if (diffBatch.Count < 500)
                        diffBatch.Add((entityType, c.V1Id, targetId, forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update, changedFields));
                }
                else if (existsInV2)
                {
                    var changedFields = DeterministicUuid.ComputeChangedFieldNames(liveFields!, c.CanonicalFields);
                    if (!forceV1OnConflict && changedFields.Count == 0)
                    {
                        counter.Unchanged++;
                        if (!isDryRun) ledgerUpdates.Add((c.V1Id, targetId, v1Hash, v1Hash));
                        continue;
                    }
                    if (!forceV1OnConflict)
                    {
                        var liveV2Hash = DeterministicUuid.ComputeCanonicalHash(liveFields!);
                        counter.SkippedV2Wins++;
                        if (diffBatch.Count < 500)
                            diffBatch.Add((entityType, c.V1Id, targetId, SyncDiffAction.SkipV2Wins, changedFields));
                        if (!isDryRun)
                        {
                            await _ledger.RecordConflictAsync(binding.Id, runId, entityType, c.V1Id, targetId,
                                SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                        }
                        continue;
                    }

                    counter.Updated++;
                    if (diffBatch.Count < 500)
                        diffBatch.Add((entityType, c.V1Id, targetId, SyncDiffAction.ForceV1, changedFields));
                }
                else
                {
                    counter.Created++;
                    if (diffBatch.Count < 500)
                        diffBatch.Add((entityType, c.V1Id, targetId, SyncDiffAction.Create, c.CanonicalFields.Keys.ToList()));
                }

                if (!isDryRun)
                {
                    writtenV1Ids.Add(c.V1Id);
                    writeBatch.BatchCommands.Add(c.BuildUpsertCommand(targetId));
                    ledgerUpdates.Add((c.V1Id, targetId, v1Hash, v1Hash));
                }
            }

            if (!isDryRun && writeBatch.BatchCommands.Count > 0)
            {
                await writeBatch.ExecuteNonQueryAsync(ct);
            }
            if (!isDryRun && ledgerUpdates.Count > 0)
            {
                await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, entityType, ledgerUpdates, ct);
            }
        }

        if (!skipChildDeletionShield && targetV1IdFilter is null)
        {
            var activeSet = overrideActiveV1Ids ?? new HashSet<string>(candidates.Select(c => c.V1Id), StringComparer.Ordinal);
            await ApplyChildDeletionShieldAsync(
                v2, binding, runId, entityType, chunkV2PatientIds, activeSet,
                isDryRun, summary, diffBatch, ct, shieldedInRun);
        }

        if (diffBatch.Count > 0)
        {
            await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
        }

        return writtenV1Ids;
    }

    // -------------------------------------------------------------------------
    // ForceSync Owner Resolution & Lookups
    // -------------------------------------------------------------------------
    private async Task<int?> ResolveForceSyncOwnerUserIdAsync(
        NpgsqlConnection v1,
        SyncBinding binding,
        string entityType,
        string v1Id,
        CancellationToken ct)
    {
        var cid = binding.V1ClinicId;
        switch (entityType)
        {
            case "PatientAccount":
                return int.TryParse(v1Id, out var uid) ? uid : null;
            case "PatientAddress":
                return int.TryParse(v1Id, out var aid)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserAddress" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", aid, null, ct)
                    : null;
            case "EmergencyContact":
                return int.TryParse(v1Id, out var ecId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserEmergencyContact" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", ecId, null, ct)
                    : null;
            case "PatientAllergy":
                return int.TryParse(v1Id, out var alId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserAllergy" WHERE id = @id""", alId, null, ct)
                    : null;
            case "PatientChronicCondition":
                return int.TryParse(v1Id, out var hcId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserHealthCondition" WHERE id = @id""", hcId, null, ct)
                    : null;
            case "PatientPastIllness":
                return int.TryParse(v1Id, out var mhId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."MedicalHistory" WHERE id = @id""", mhId, null, ct)
                    : null;
            case "PatientFamilyHistory":
                return int.TryParse(v1Id, out var fmhId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."FamilyMedicalHistory" WHERE id = @id AND "deletedAt" IS NULL""", fmhId, null, ct)
                    : null;
            case "PatientSocialHistory":
                return int.TryParse(v1Id, out var shId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PersonalHistory" WHERE id = @id AND "deletedAt" IS NULL""", shId, null, ct)
                    : null;
            case "PatientObstetricProfile":
                return int.TryParse(v1Id, out var ogId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."ObGyneHistory" WHERE id = @id AND "deletedAt" IS NULL""", ogId, null, ct)
                    : null;
            case "PatientSurgicalHistory":
                return int.TryParse(v1Id, out var surgId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."SurgicalHistory" WHERE id = @id AND "deletedAt" IS NULL""", surgId, null, ct)
                    : null;
            case "PatientDisability":
                return int.TryParse(v1Id, out var disId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserDisability" WHERE id = @id""", disId, null, ct)
                    : null;
            case "PatientImmunizationSelf":
                if (!int.TryParse(v1Id, out var immId)) return null;
                if (await TableExistsAsync(v1, "UserVaccination", ct))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserVaccination" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true AND "hpId" IS NULL""", immId, null, ct);
                if (await TableExistsAsync(v1, "PatientImmunization", ct))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PatientImmunization" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", immId, null, ct);
                return null;
            case "PatientMedication":
            {
                var basePart = v1Id.Contains(':', StringComparison.Ordinal) ? v1Id.Split(':')[0] : v1Id;
                return int.TryParse(basePart, out var medId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "patientId" FROM public."Medication" WHERE id = @id""", medId, null, ct)
                    : null;
            }
            case "PatientGovernmentId":
            {
                var basePart = v1Id.Contains(':', StringComparison.Ordinal) ? v1Id.Split(':')[0] : v1Id;
                return int.TryParse(basePart, out var phId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PhilHealthRecord" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", phId, null, ct)
                    : null;
            }
            case "FileRecord":
            {
                if (!int.TryParse(v1Id, out var fileId)) return null;
                var hasFolderCols = await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                    await ColumnExistsAsync(v1, "Folder", "isActive", ct);
                var folderCond = hasFolderCols ? """AND fo."deletedAt" IS NULL AND fo."isActive" = true""" : string.Empty;
                return await QueryOptionalIntAsync(v1, $"""
                    SELECT fo."userId" FROM public."File" f
                    JOIN public."Folder" fo ON fo.id = f."folderId"
                    WHERE f.id = @id AND f."isActive" = true AND f."deletedAt" IS NULL {folderCond}
                      AND f.url IS NOT NULL AND trim(f.url) <> ''
                    """, fileId, null, ct);
            }
            case "ClinicMembership":
                return cid.HasValue && int.TryParse(v1Id, out var cpId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "patientId" FROM public."ClinicPatient" WHERE id = @id AND "clinicId" = @cid AND "deletedAt" IS NULL""", cpId, cid, ct)
                    : null;
            case "PatientAppointment":
                return cid.HasValue && int.TryParse(v1Id, out var apptId)
                    ? await QueryOptionalIntAsync(v1, """SELECT ar."userId" FROM public."Appointment" a JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id WHERE a.id = @id AND a."clinicId" = @cid AND a."deletedAt" IS NULL LIMIT 1""", apptId, cid, ct)
                    : null;
            case "PatientConsultation":
                return cid.HasValue && int.TryParse(v1Id, out var ctId)
                    ? await QueryOptionalIntAsync(v1, """SELECT COALESCE(cp."patientId", ar."userId") FROM public."ConsultationTicket" t LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId" LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId" WHERE t.id = @id AND t."clinicId" = @cid AND t."isActive" = true LIMIT 1""", ctId, cid, ct)
                    : null;
            case "PatientVitalSign":
                return cid.HasValue && int.TryParse(v1Id, out var vsId)
                    ? await QueryOptionalIntAsync(v1, """SELECT vs."userId" FROM public."VitalSign" vs WHERE vs.id = @id AND vs."deletedAt" IS NULL AND vs."isActive" = true AND (vs."consultationTicketId" IS NULL OR EXISTS (SELECT 1 FROM public."ConsultationTicket" t WHERE t.id = vs."consultationTicketId" AND t."clinicId" = @cid AND t."isActive" = true))""", vsId, cid, ct)
                    : null;
            case "PatientPrescriptionDocument":
                return cid.HasValue && int.TryParse(v1Id, out var rxDocId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."Prescription" p JOIN public."ClinicPatient" cp ON cp.id = p."patientId" JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId" AND t."isActive" = true AND t."clinicId" = @cid WHERE p.id = @id AND p."clinicId" = @cid AND p."isActive" = true""", rxDocId, cid, ct)
                    : null;
            case "PatientPrescription":
                return cid.HasValue && int.TryParse(v1Id, out var rxLineId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."Medicine" m JOIN public."Prescription" p ON p.id = m."prescriptionId" JOIN public."ClinicPatient" cp ON cp.id = p."patientId" JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId" AND t."isActive" = true AND t."clinicId" = @cid WHERE m.id = @id AND p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true""", rxLineId, cid, ct)
                    : null;
            case "PatientMedicalCertificate":
                return cid.HasValue && int.TryParse(v1Id, out var mcId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicMedicalCertificate" mc JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId" WHERE mc.id = @id AND mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true""", mcId, cid, ct)
                    : null;
            case "PatientLabRequestSlip":
                if (!cid.HasValue) return null;
                if (v1Id.StartsWith("lab:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var labId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicLaboratoryRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", labId, cid, ct);
                if (v1Id.StartsWith("img:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var imgId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicImagingRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", imgId, cid, ct);
                if (v1Id.StartsWith("ecg:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var ecgId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicHeartStationRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", ecgId, cid, ct);
                return null;
            case "VaccinationAdministered":
                if (!cid.HasValue || !int.TryParse(v1Id, out var vaId)) return null;
                return await TableExistsAsync(v1, "UserVaccination", ct)
                    ? await QueryOptionalIntAsync(v1, """SELECT uv."userId" FROM public."UserVaccination" uv WHERE uv.id = @id AND uv."deletedAt" IS NULL AND uv."isActive" = true AND uv."hpId" IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = uv."userId" AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)""", vaId, cid, ct)
                    : null;
            default:
                return null;
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private sealed record V1UserRow(
        int Id, string? V1UserIdStr, string? Email, string? AvatarUrl,
        string FirstName, string? MiddleName, string LastName, string? Suffix,
        string? Sex, DateOnly? Dob, string? PlaceOfBirth, string? BloodType, string? CivilStatus,
        string? Nationality, string? Religion, string? Mobile, string? AltPhone,
        DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, bool IsDeleted);

    private sealed record ClinicianSnapshot(string Name, string? PrcLicense, string? PtrNumber);

    private sealed record LabSlipItemDto(string Code, string Name, string Category);

    public static Dictionary<string, string?> BuildPatientCanonicalMap(
        string fn, string? mn, string ln, string? suf, string? sex, DateOnly? dob,
        string? pob, string? civil, string? blood, string? nat, string? rel,
        string? mob, string? alt, string? email) =>
        new(StringComparer.Ordinal)
        {
            ["first_name"] = fn,
            ["middle_name"] = mn,
            ["last_name"] = ln,
            ["suffix"] = suf,
            ["sex"] = sex,
            ["date_of_birth"] = dob?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["place_of_birth"] = pob,
            ["civil_status"] = civil,
            ["blood_type"] = blood,
            ["nationality"] = nat,
            ["religion"] = rel,
            ["mobile"] = mob,
            ["alt_phone"] = alt,
            ["email"] = email
        };

    public static Dictionary<string, string?> BuildPatientSocialHistoryCanonicalMap(
        string? smokingStatus, decimal? packYears, string? alcoholUse, bool usesSubstances, bool? isSexuallyActive) =>
        new(StringComparer.Ordinal)
        {
            ["smoking_status"] = smokingStatus,
            ["pack_years"] = FmtDec(packYears, 1),
            ["alcohol_use"] = alcoholUse,
            ["uses_substances"] = FmtBool(usesSubstances),
            ["is_sexually_active"] = isSexuallyActive.HasValue ? FmtBool(isSexuallyActive.Value) : null
        };

    private static string? GetV2TableNameForEntity(string entityType) => entityType switch
    {
        "PatientAccount" => "patients",
        "PatientAddress" => "patient_addresses",
        "EmergencyContact" => "emergency_contacts",
        "PatientAllergy" => "patient_allergies",
        "PatientChronicCondition" => "patient_chronic_conditions",
        "PatientPastIllness" => "patient_past_illnesses",
        "PatientFamilyHistory" => "patient_family_histories",
        "PatientSocialHistory" => "patient_social_histories",
        "PatientObstetricProfile" => "patient_obstetric_profiles",
        "PatientSurgicalHistory" => "patient_surgical_histories",
        "PatientDisability" => "patient_disabilities",
        "PatientImmunizationSelf" => "patient_immunizations_self",
        "PatientMedication" => "patient_medications",
        "PatientGovernmentId" => "patient_government_ids",
        "FileRecord" => "file_records",
        "ClinicMembership" => "clinic_memberships",
        "PatientAppointment" => "appointments",
        "PatientConsultation" => "consultations",
        "PatientVitalSign" => "vital_signs",
        "PatientPrescriptionDocument" => "prescription_documents",
        "PatientPrescription" => "prescriptions",
        "PatientMedicalCertificate" => "medical_certificates",
        "PatientLabRequestSlip" => "lab_request_slips",
        "VaccinationAdministered" => "vaccinations_administered",
        _ => null
    };

    private static async Task<HashSet<Guid>> FilterExistingV2IdsForEntityAsync(
        NpgsqlConnection v2,
        string entityType,
        Guid[] candidateIds,
        CancellationToken ct)
    {
        var result = new HashSet<Guid>();
        if (candidateIds.Length == 0) return result;
        var tableName = GetV2TableNameForEntity(entityType);
        if (tableName is null) return result;

        await using var cmd = new NpgsqlCommand($"""
            SELECT id FROM public.{tableName}
            WHERE is_deleted = false AND id = ANY(@ids)
            """, v2);
        cmd.Parameters.AddWithValue("ids", candidateIds);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result.Add(r.GetGuid(0));
        return result;
    }

    private async Task<Dictionary<int, Guid>> LoadResolvedPatientIdMapAsync(
        NpgsqlConnection v2,
        Guid bindingId,
        List<int> cohortUserIds,
        CancellationToken ct)
    {
        var v1Ids = cohortUserIds.Select(x => x.ToString(CultureInfo.InvariantCulture)).ToArray();
        var mapped = await _ledger.GetIdMappingsByV1IdsAsync(bindingId, "PatientAccount", v1Ids, ct);
        var result = new Dictionary<int, Guid>(cohortUserIds.Count);
        foreach (var uid in cohortUserIds)
        {
            if (mapped.TryGetValue(uid.ToString(CultureInfo.InvariantCulture), out var g))
            {
                result[uid] = g;
            }
            else
            {
                result[uid] = DeterministicUuid.PatientAccountId(uid);
            }
        }
        return result;
    }

    private static async Task<Dictionary<Guid, Dictionary<string, string?>>> LoadStringMapRowsAsync(
        NpgsqlConnection v2,
        string sql,
        Guid[] ids,
        Func<NpgsqlDataReader, Dictionary<string, string?>> mapRow,
        CancellationToken ct)
    {
        var map = new Dictionary<Guid, Dictionary<string, string?>>();
        if (ids.Length == 0) return map;

        await using var cmd = new NpgsqlCommand(sql, v2);
        cmd.Parameters.AddWithValue("ids", ids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = mapRow(r);
        }
        return map;
    }

    private static async Task<Dictionary<Guid, Guid>> LoadExistingByPatientKeyAsync(
        NpgsqlConnection v2,
        string sql,
        Guid[] v2Pids,
        CancellationToken ct,
        (string Key, object Value)? extraParam = null)
    {
        var map = new Dictionary<Guid, Guid>();
        if (v2Pids.Length == 0) return map;
        await using var cmd = new NpgsqlCommand(sql, v2);
        cmd.Parameters.AddWithValue("pids", v2Pids);
        if (extraParam.HasValue) cmd.Parameters.AddWithValue(extraParam.Value.Key, extraParam.Value.Value);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = r.GetGuid(1);
        }
        return map;
    }

    private static async Task<Dictionary<(Guid PatientId, Guid BizId), Guid>> LoadExistingByBizKeyAsync(
        NpgsqlConnection v2,
        string sql,
        Guid[] v2Pids,
        CancellationToken ct)
    {
        var map = new Dictionary<(Guid, Guid), Guid>();
        if (v2Pids.Length == 0) return map;
        await using var cmd = new NpgsqlCommand(sql, v2);
        cmd.Parameters.AddWithValue("pids", v2Pids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[(r.GetGuid(0), r.GetGuid(1))] = r.GetGuid(2);
        }
        return map;
    }

    private static Task<Dictionary<(Guid PatientId, Guid BizId), Guid>> LoadExistingRxDocByBizKeyAsync(
        NpgsqlConnection v2, Guid[] v2Pids, CancellationToken ct) =>
        LoadExistingByBizKeyAsync(
            v2,
            "SELECT patient_id, prescription_id, id FROM public.prescription_documents WHERE patient_id = ANY(@pids) AND is_deleted = false",
            v2Pids, ct);

    private static async Task<HashSet<Guid>> LoadExistingConsultationIdsForPatientsAsync(
        NpgsqlConnection v2, Guid[] v2Pids, CancellationToken ct)
    {
        var set = new HashSet<Guid>();
        if (v2Pids.Length == 0) return set;
        await using var cmd = new NpgsqlCommand("""
            SELECT id FROM public.consultations
            WHERE patient_id = ANY(@pids) AND is_deleted = false
            """, v2);
        cmd.Parameters.AddWithValue("pids", v2Pids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) set.Add(r.GetGuid(0));
        return set;
    }

    private static async Task<Dictionary<string, List<LabSlipItemDto>>> LoadDiagnosticProceduresByRequestAsync(
        NpgsqlConnection v1, int v1ClinicId, int[] userIds, CancellationToken ct)
    {
        var map = new Dictionary<string, List<LabSlipItemDto>>(StringComparer.Ordinal);
        if (userIds.Length == 0) return map;

        const string procSql = """
            SELECT 'lab' AS kind, r.id AS req_id, COALESCE(p."rvsCode", ''), COALESCE(p.name, 'Laboratory Test'), COALESCE(p.category, 'Laboratory')
            FROM public."ClinicLaboratoryRequestProcedure" rp
            JOIN public."ClinicLaboratoryRequest" r ON r.id = rp."clinicLaboratoryRequestId"
            JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
            LEFT JOIN public."ClinicLaboratoryProcedure" p ON p.id = rp."clinicLaboratoryProcedureId"
            WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
            UNION ALL
            SELECT 'img' AS kind, r.id AS req_id, COALESCE(p."rvsCode", ''), COALESCE(p.name, 'Imaging Study'), COALESCE(p.category, 'Imaging')
            FROM public."ClinicImagingRequestProcedure" rp
            JOIN public."ClinicImagingRequest" r ON r.id = rp."clinicImagingRequestId"
            JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
            LEFT JOIN public."ClinicImagingProcedure" p ON p.id = rp."clinicImagingProcedureId"
            WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
            UNION ALL
            SELECT 'ecg' AS kind, r.id AS req_id, COALESCE(p."rvsCode", ''), COALESCE(p.name, 'Cardiology / ECG'), COALESCE(p.category, 'Cardiology')
            FROM public."ClinicHeartStationRequestProcedure" rp
            JOIN public."ClinicHeartStationRequest" r ON r.id = rp."clinicHeartStationRequestId"
            JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
            LEFT JOIN public."ClinicHeartStationProcedure" p ON p.id = rp."clinicHeartStationProcedureId"
            WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
            ORDER BY kind ASC, req_id ASC
            """;

        await using var cmd = new NpgsqlCommand(procSql, v1);
        cmd.Parameters.AddWithValue("cid", v1ClinicId);
        cmd.Parameters.AddWithValue("ids", userIds);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var key = $"{r.GetString(0)}:{r.GetInt32(1)}";
            if (!map.TryGetValue(key, out var list))
            {
                list = new List<LabSlipItemDto>();
                map[key] = list;
            }
            list.Add(new LabSlipItemDto(
                Code: SyncTransforms.Clean(GetStr(r, 2), 40) ?? string.Empty,
                Name: SyncTransforms.CleanRequired(GetStr(r, 3), "Diagnostic Procedure", 200),
                Category: SyncTransforms.CleanRequired(GetStr(r, 4), "Laboratory", 100)));
        }

        return map;
    }

    private static async Task<Dictionary<int, ClinicianSnapshot>> LoadV1ClinicianSnapshotsAsync(NpgsqlConnection v1, CancellationToken ct)
    {
        var map = new Dictionary<int, ClinicianSnapshot>();
        if (!await TableExistsAsync(v1, "HealthcareProvider", ct)) return map;

        var hasHpProfile = await TableExistsAsync(v1, "HPProfile", ct);
        var hasProfDetails = await TableExistsAsync(v1, "ProfessionalDetails", ct);

        var nameExpr = hasHpProfile
            ? """COALESCE(NULLIF(trim(concat_ws(' ', prof.title, prof.name, prof.suffix)), ''), NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), ''), 'Clinic Physician')"""
            : """COALESCE(NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), ''), 'Clinic Physician')""";
        var licExpr = hasProfDetails ? """pd."licenseNumber" """ : "NULL::text";
        var ptrExpr = hasProfDetails ? """pd."ptrNumber" """ : "NULL::text";

        var sql = $"""
            SELECT hp.id, {nameExpr} AS doc_name, {licExpr}, {ptrExpr}
            FROM public."HealthcareProvider" hp
            {(hasHpProfile ? """LEFT JOIN public."HPProfile" prof ON prof."healthcareProviderId" = hp.id""" : string.Empty)}
            LEFT JOIN public."User" u ON u.id = hp."userId"
            {(hasProfDetails ? """LEFT JOIN public."ProfessionalDetails" pd ON pd."healthcareProverId" = hp.id""" : string.Empty)}
            """;

        await using var cmd = new NpgsqlCommand(sql, v1);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetInt32(0)] = new ClinicianSnapshot(
                SyncTransforms.CleanRequired(GetStr(r, 1), "Clinic Physician", 200),
                SyncTransforms.Clean(GetStr(r, 2), 50),
                SyncTransforms.Clean(GetStr(r, 3), 50));
        }
        return map;
    }

    private async Task<List<int>> LoadCohortUsersAsync(NpgsqlConnection v1, SyncBinding binding, bool isGlobal, CancellationToken ct)
    {
        var ids = new List<int>(16000);
        var sql = isGlobal
            ? """SELECT id FROM public."User" WHERE "isActive" = true AND "deletedAt" IS NULL ORDER BY id ASC"""
            : """
              SELECT DISTINCT u.id FROM public."User" u
              WHERE u."isActive" = true AND u."deletedAt" IS NULL
                AND (
                    (@cid IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL))
                    OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid))
                )
              ORDER BY u.id ASC
              """;
        await using var cmd = new NpgsqlCommand(sql, v1);
        if (!isGlobal)
        {
            cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)binding.V1ClinicId ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
        }
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) ids.Add(r.GetInt32(0));
        return ids;
    }

    private async Task<List<int>> SelectDiversePatientSampleAsync(
        NpgsqlConnection v1, SyncBinding binding, bool isGlobal, int limit, CancellationToken ct)
    {
        var seen = new HashSet<int>();
        var list = new List<int>();
        async Task AddFromAsync(string sql, int lim)
        {
            await using var cmd = new NpgsqlCommand(sql, v1);
            cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)binding.V1ClinicId ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
            cmd.Parameters.AddWithValue("lim", lim);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct) && list.Count < limit)
            {
                var id = r.GetInt32(0);
                if (seen.Add(id)) list.Add(id);
            }
        }

        var scopeFilter = isGlobal
            ? "true"
            : """((@cid IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)) OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)))""";

        var b = Math.Max(3, limit / 3);
        await AddFromAsync($"""
            SELECT DISTINCT u.id FROM public."User" u
            WHERE u."isActive" = true AND u."deletedAt" IS NULL AND u."userId" LIKE 'auth0|%' AND {scopeFilter}
              AND EXISTS (SELECT 1 FROM public."Folder" fo JOIN public."File" f ON f."folderId" = fo.id JOIN public."FileSetting" fs ON fs."fileId" = f.id
                          WHERE fo."userId" = u.id AND f."isActive" = true AND f."deletedAt" IS NULL AND fs.privacy::text = 'PRIVATE')
            ORDER BY u.id DESC LIMIT @lim
            """, b);
        await AddFromAsync($"""
            SELECT DISTINCT u.id FROM public."User" u
            WHERE u."isActive" = true AND u."deletedAt" IS NULL AND u."userId" LIKE 'user_%' AND {scopeFilter}
              AND EXISTS (SELECT 1 FROM public."Folder" fo JOIN public."File" f ON f."folderId" = fo.id WHERE fo."userId" = u.id AND f."isActive" = true AND f."deletedAt" IS NULL)
            ORDER BY u.id DESC LIMIT @lim
            """, b);
        await AddFromAsync($"""
            SELECT u.id FROM public."User" u
            WHERE u."isActive" = true AND u."deletedAt" IS NULL AND {scopeFilter}
            ORDER BY u.id ASC LIMIT @lim
            """, limit);

        list.Sort();
        return list;
    }

    private static async Task<long> ReadV1MaxChangelogSeqAsync(NpgsqlConnection v1, CancellationToken ct)
    {
        var (_, rawMaxSeq, _) = await ReadV1ChangelogBoundsAsync(v1, ct);
        return rawMaxSeq;
    }

    private static async Task<(bool Exists, long RawMaxSeq, long SafeMaxSeq)> ReadV1ChangelogBoundsAsync(NpgsqlConnection v1, CancellationToken ct)
    {
        try
        {
            const string sql = """
                WITH snap AS (
                    SELECT pg_snapshot_xmin(pg_current_snapshot()) AS s_xmin,
                           pg_snapshot_xmax(pg_current_snapshot()) AS s_xmax
                ),
                unsafe_floor AS (
                    SELECT COALESCE(MIN(c2.seq), 9223372036854775807) AS min_unsafe_seq
                    FROM _v1_sync.changelog c2, snap
                    WHERE age(c2.xmin) <= age((snap.s_xmin::text::bigint & 4294967295)::text::xid)
                )
                SELECT COALESCE((SELECT MAX(seq) FROM _v1_sync.changelog), 0) AS raw_max_seq,
                       COALESCE((
                           SELECT MAX(c.seq)
                           FROM _v1_sync.changelog c, snap, unsafe_floor uf
                           WHERE c.seq < uf.min_unsafe_seq
                             AND age(c.xmin) > age((snap.s_xmin::text::bigint & 4294967295)::text::xid)
                             AND (snap.s_xmin = snap.s_xmax OR c.changed_at < now() - interval '5 seconds')
                       ), 0) AS safe_max_seq
                """;
            await using var cmd = new NpgsqlCommand(sql, v1);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                return (true, r.GetInt64(0), r.GetInt64(1));
            }
            return (true, 0, 0);
        }
        catch
        {
            return (false, 0, 0);
        }
    }

    private static async Task<Dictionary<int, string>> LoadLookupAsync(NpgsqlConnection v1, string sql, CancellationToken ct)
    {
        var map = new Dictionary<int, string>();
        if (!await TableExistsAsync(v1, "FileType", ct)) return map;
        await using var cmd = new NpgsqlCommand(sql, v1);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            if (!r.IsDBNull(1)) map[r.GetInt32(0)] = r.GetString(1);
        }
        return map;
    }

    private static async Task<int?> QueryOptionalIntAsync(
        NpgsqlConnection v1, string sql, int id, int? cid, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("id", id);
        if (cid.HasValue) cmd.Parameters.AddWithValue("cid", cid.Value);
        var obj = await cmd.ExecuteScalarAsync(ct);
        return obj is int i ? i : null;
    }

    private static async Task<bool> IsUserActiveInV1Async(NpgsqlConnection v1, int v1UserId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM public."User" u
                WHERE u.id = @uid AND u."isActive" = true AND u."deletedAt" IS NULL
            )
            """, v1);
        cmd.Parameters.AddWithValue("uid", v1UserId);
        return await cmd.ExecuteScalarAsync(ct) is true;
    }

    private static async Task<bool> IsUserInBindingScopeAsync(
        NpgsqlConnection v1,
        int v1UserId,
        int? v1ClinicId,
        int? v1OrgId,
        CancellationToken ct)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1
                FROM public."User" u
                WHERE u.id = @uid
                  AND (
                      (@cid IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public."ClinicPatient" cp
                          WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL
                      ))
                      OR (@oid IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public."OrganizationMember" om
                          WHERE om."userId" = u.id AND om."organizationId" = @oid
                      ))
                  )
            )
            """;
        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("uid", v1UserId);
        cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)v1ClinicId ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)v1OrgId ?? DBNull.Value });
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is true;
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection conn, string tableName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = @tbl
            )
            """, conn);
        cmd.Parameters.AddWithValue("tbl", tableName);
        return await cmd.ExecuteScalarAsync(ct) is true;
    }

    private static async Task<bool> ColumnExistsAsync(NpgsqlConnection conn, string tableName, string columnName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = @tbl AND column_name = @col
            )
            """, conn);
        cmd.Parameters.AddWithValue("tbl", tableName);
        cmd.Parameters.AddWithValue("col", columnName);
        return await cmd.ExecuteScalarAsync(ct) is true;
    }

    private static Task<long> ScalarInt64Async(
        NpgsqlConnection conn, string sql, IEnumerable<(string Key, object Value)> parms, CancellationToken ct) =>
        ScalarInt64Async(conn, sql, parms.Select(p => (p.Key, (object?)p.Value, (NpgsqlDbType?)null)), ct);

    private static async Task<long> ScalarInt64Async(
        NpgsqlConnection conn, string sql, IEnumerable<(string Key, object? Value, NpgsqlDbType? DbType)> parms, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (k, v, dbType) in parms)
        {
            if (dbType.HasValue)
            {
                cmd.Parameters.Add(new NpgsqlParameter(k, dbType.Value) { Value = v ?? DBNull.Value });
            }
            else if (v is null || v is DBNull)
            {
                cmd.Parameters.Add(new NpgsqlParameter(k, NpgsqlDbType.Unknown) { Value = DBNull.Value });
            }
            else
            {
                cmd.Parameters.AddWithValue(k, v);
            }
        }
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    private static string MapFamilyRelation(string? details)
    {
        var raw = SyncTransforms.Clean(details)?.ToUpperInvariant();
        if (raw is null) return "Other";
        if (raw.Contains("MOTHER") || raw.Contains("MOM")) return "Mother";
        if (raw.Contains("FATHER") || raw.Contains("DAD")) return "Father";
        if (raw.Contains("SIBLING") || raw.Contains("BROTHER") || raw.Contains("SISTER")) return "Sibling";
        if (raw.Contains("PATERNAL")) return "PaternalGrandparent";
        if (raw.Contains("MATERNAL")) return "MaternalGrandparent";
        if (raw.Contains("AUNT")) return "Aunt";
        if (raw.Contains("UNCLE")) return "Uncle";
        if (raw.Contains("COUSIN")) return "Cousin";
        return "Other";
    }

    private static string MapImmunizationCategory(string? vaccineType)
    {
        var raw = SyncTransforms.Clean(vaccineType)?.ToUpperInvariant();
        if (raw is null) return "Other";
        if (raw.Contains("CHILD") || raw.Contains("PEDIA") || raw.Contains("EPI")) return "Child";
        if (raw.Contains("PREGNANT") || raw.Contains("MATERNAL")) return "Pregnant";
        if (raw.Contains("YOUNG") || raw.Contains("WOMAN")) return "YoungWoman";
        if (raw.Contains("ELDER") || raw.Contains("SENIOR")) return "Elderly";
        return "Other";
    }

    private static DateTimeOffset CombineManilaDateTime(DateOnly? date, string? timeStart, DateTimeOffset fallback)
    {
        if (!date.HasValue) return fallback;
        TimeOnly time = new(8, 0);
        if (!string.IsNullOrWhiteSpace(timeStart) &&
            (TimeOnly.TryParse(timeStart.Trim(), CultureInfo.InvariantCulture, out var parsed) ||
             DateTime.TryParse(timeStart.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var dtParsed) && (parsed = TimeOnly.FromDateTime(dtParsed)) != default))
        {
            time = parsed;
        }
        return TruncateToMicroseconds(new DateTimeOffset(date.Value.ToDateTime(time), ManilaOffset).ToUniversalTime());
    }

    private static DateTimeOffset TruncateUtcNow() => TruncateToMicroseconds(DateTimeOffset.UtcNow);

    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset dto)
    {
        var utcTicks = dto.UtcTicks;
        var microTicks = utcTicks - (utcTicks % 10);
        return new DateTimeOffset(microTicks, TimeSpan.Zero);
    }

    private static string? FmtUtc(DateTimeOffset? dto) =>
        dto?.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'", CultureInfo.InvariantCulture);

    private static string? FmtDate(DateOnly? d) =>
        d?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string? FmtDec(decimal? val, int decimals) =>
        !val.HasValue ? null :
        decimals == 1
            ? val.Value.ToString("0.0", CultureInfo.InvariantCulture)
            : val.Value.ToString("0.00", CultureInfo.InvariantCulture);

    private static string? FmtGuid(Guid? g) => g?.ToString("D");

    private static string FmtBool(bool b) => b ? "true" : "false";

    private static string? GetStr(NpgsqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);

    private static DateTimeOffset? GetUtc(NpgsqlDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var val = r.GetValue(i);
        return val switch
        {
            DateTimeOffset dto => TruncateToMicroseconds(dto.ToUniversalTime()),
            DateTime dt => TruncateToMicroseconds(new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc))),
            _ => null
        };
    }

    private static decimal? GetDecNullable(NpgsqlDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var val = r.GetValue(i);
        return val switch
        {
            decimal dec => dec,
            double dbl when !double.IsNaN(dbl) && !double.IsInfinity(dbl) => Convert.ToDecimal(Math.Round(dbl, 4)),
            float flt when !float.IsNaN(flt) && !float.IsInfinity(flt) => Convert.ToDecimal(Math.Round(flt, 4)),
            int iv => (decimal)iv,
            long lv => (decimal)lv,
            _ => null
        };
    }
}
