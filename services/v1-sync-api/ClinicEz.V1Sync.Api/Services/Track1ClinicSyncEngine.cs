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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Track 1 (clinic-api / CLINICEZ-CLINIC_DB) migration & indefinite one-way sync engine.
/// Completely decoupled from clinic-api: connects directly to V1Source (read-only),
/// ClinicDb (target), and SyncLedgerDb.
/// </summary>
public sealed class Track1ClinicSyncEngine
{
    private const int DefaultBatchSize = 200;
    private static readonly TimeSpan ManilaOffset = TimeSpan.FromHours(8);
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
            $"Stage {stageIndex}/{totalStages}: {stageName} — starting ({totalItems:N0} patient(s), {totalBatches} batch(es) of {state.BatchSize})");

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
    private readonly ILogger<Track1ClinicSyncEngine> _logger;
    private readonly ScopedCdcIdResolver _cdcResolver;

    public Track1ClinicSyncEngine(
        SyncConnectionFactory connections,
        SyncLedgerRepository ledger,
        ILogger<Track1ClinicSyncEngine> logger,
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
        if (!binding.V1ClinicId.HasValue || string.IsNullOrWhiteSpace(binding.V2TenantId) || !binding.V2ClinicId.HasValue)
        {
            throw new InvalidOperationException(
                "Track 1 binding requires explicit V1ClinicId, V2TenantId, and V2ClinicId.");
        }

        var isDryRun = string.Equals(mode, SyncRunMode.DryRun, StringComparison.OrdinalIgnoreCase);
        var isIncremental = string.Equals(mode, SyncRunMode.Incremental, StringComparison.OrdinalIgnoreCase);
        var isFinalSweep = string.Equals(mode, SyncRunMode.FinalSweep, StringComparison.OrdinalIgnoreCase);
        var effectiveBatchSize = Math.Clamp(batchSizeOverride ?? binding.BatchSize, 10, 1000);
        var summary = new SyncRunSummary
        {
            Track = binding.Track,
            Mode = mode,
            SampleLimit = sampleLimit,
            BatchSize = effectiveBatchSize,
            CurrentStage = "Preparing cohort & custom fields...",
            StageIndex = 0,
            TotalStages = 9,
            PercentComplete = 0,
            LastProgressAtUtc = DateTimeOffset.UtcNow
        };
        summary.AppendVerboseLog($"Initialized Track 1 {mode} (batch size: {effectiveBatchSize}, dryRun: {isDryRun})");

        var runId = existingRunId ?? await _ledger.StartRunAsync(binding.Id, mode, sampleLimit, triggeredBy, ct, summary);
        var sw = Stopwatch.StartNew();
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
            await using var v2 = await _connections.OpenClinicDbAsync(ct);

            var startSeq = await _ledger.GetCursorAsync(binding.Id, ct);
            var (changelogExists, rawMaxSeq, safeMaxSeq) = await ReadV1ChangelogBoundsAsync(v1, ct);
            if (changelogExists && startSeq > rawMaxSeq)
            {
                _logger.LogWarning(
                    "Track 1 detected v1 changelog sequence reset for binding {BindingId} (cursor #{StartSeq} > max #{RawMaxSeq}); resetting cursor to 0.",
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

            // 1. Auto-provision lossless CustomFieldDefinitions (university_ustp + patient_intake_contacts + 9 dynamic v1 fields)
            var provisionedFields = await ProvisionCustomFieldDefinitionsAsync(v1, v2, binding, isDryRun, summary, ct);
            summary.CustomFieldsProvisioned.AddRange(provisionedFields);

            var systems = await LoadV1LookupIntStringAsync(v1, """SELECT id, name FROM public."System" """, ct);
            var fileTypes = await LoadV1LookupIntStringAsync(v1, """SELECT id, name FROM public."FileType" """, ct);
            var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);

            // 2. Resolve target v1 user IDs (Incremental from _v1_sync.changelog, FinalSweep dual-drain, Sample Cohort, or Full Cohort)
            List<int> cohortUserIds;
            if (isIncremental)
            {
                var drain = changelogExists
                    ? await DrainIncrementalChangelogAsync(v1, binding, startSeq, ct)
                    : new ChangelogDrainResult(new List<int>(), new List<DeletedCdcEvent>(), startSeq, 0);
                summary.EndChangelogSeq = drain.MaxSeq;

                if (drain.DeletedEvents.Count > 0)
                {
                    await ApplyCdcDeletionShieldAsync(v1, v2, binding, runId, drain.DeletedEvents, isDryRun, summary, ct);
                }

                cohortUserIds = drain.ScopedUserIds;
                if (cohortUserIds.Count == 0)
                {
                    if (!isDryRun && changelogExists)
                    {
                        await _ledger.UpdateCursorAsync(binding.Id, drain.MaxSeq, ct);
                    }
                    if (!changelogExists)
                    {
                        summary.Notes.Add("Live change tracking is not enabled on Classic Clinic EZ (v1); skipped incremental changelog poll. Install Live Tracking SQL or run Full Migration / Final Sweep.");
                    }
                    else if (drain.DeletedEvents.Count == 0)
                    {
                        summary.Notes.Add("No scoped Track 1 changes since last changelog cursor.");
                    }
                    sw.Stop();
                    summary.DurationMs = sw.ElapsedMilliseconds;
                    if (drain.DeletedEvents.Count == 0 &&
                        existingRunId is null &&
                        string.Equals(triggeredBy, "AutoSyncWorker", StringComparison.Ordinal))
                    {
                        // Avoid burying real migrations in `sync_runs` with idle 0-change AutoSyncWorker polls
                        await _ledger.DeleteRunAsync(runId, ct);
                        var nowUtc = DateTimeOffset.UtcNow;
                        return new SyncRunRecord(
                            runId, binding.Id, mode, sampleLimit, SyncRunStatus.Completed, triggeredBy,
                            nowUtc.AddMilliseconds(-summary.DurationMs), nowUtc,
                            JsonSerializer.SerializeToElement(summary, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
                            null);
                    }
                    await _ledger.CompleteRunAsync(runId, summary, ct);
                    return (await _ledger.ListRunsAsync(binding.Id, 1, ct)).First();
                }
            }
            else if (isFinalSweep)
            {
                // Pre-sweep CDC drain + Deletion Shield (skipped cleanly when live change tracking is not installed on v1)
                ChangelogDrainResult preDrain;
                if (changelogExists)
                {
                    preDrain = await DrainIncrementalChangelogAsync(v1, binding, startSeq, ct);
                    if (preDrain.DeletedEvents.Count > 0)
                    {
                        await ApplyCdcDeletionShieldAsync(v1, v2, binding, runId, preDrain.DeletedEvents, isDryRun, summary, ct);
                    }
                }
                else
                {
                    preDrain = new ChangelogDrainResult(new List<int>(), new List<DeletedCdcEvent>(), startSeq, 0);
                    summary.Notes.Add("Live change tracking is not enabled on Classic Clinic EZ (v1); running full-cohort Final Verification Sweep without changelog drain.");
                    summary.AppendVerboseLog("Live change tracking not installed on v1; skipping pre-sweep changelog drain.");
                }

                cohortUserIds = await LoadFullScopedCohortAsync(v1, binding, ct);
                await ApplyMappedPatientsDeletionShieldAsync(v1, v2, binding, runId, cohortUserIds, isDryRun, summary, ct);

                summary.CohortPatientCount = cohortUserIds.Count;
                _logger.LogInformation(
                    "Track 1 {Mode} starting for binding {BindingId}: {Count} patients (dryRun={DryRun}).",
                    mode, binding.Id, cohortUserIds.Count, isDryRun);

                if (cohortUserIds.Count > 0)
                {
                    await ExecuteTrack1PipelineAsync(
                        v1, v2, binding, runId, cohortUserIds, systems, fileTypes, clinicians,
                        isDryRun, forceV1OnConflict, summary, ct);
                }

                // Post-sweep CDC drain to capture writes that landed during the sweep
                ChangelogDrainResult postDrain;
                if (changelogExists)
                {
                    postDrain = await DrainIncrementalChangelogAsync(v1, binding, preDrain.MaxSeq, ct);
                    if (postDrain.DeletedEvents.Count > 0)
                    {
                        await ApplyCdcDeletionShieldAsync(v1, v2, binding, runId, postDrain.DeletedEvents, isDryRun, summary, ct);
                    }
                    if (postDrain.ScopedUserIds.Count > 0)
                    {
                        await ExecuteTrack1PipelineAsync(
                            v1, v2, binding, runId, postDrain.ScopedUserIds, systems, fileTypes, clinicians,
                            isDryRun, forceV1OnConflict, summary, ct);
                    }
                }
                else
                {
                    postDrain = preDrain;
                }

                summary.EndChangelogSeq = postDrain.MaxSeq;
                if (!isDryRun && changelogExists && summary.EndChangelogSeq >= startSeq)
                {
                    await _ledger.UpdateCursorAsync(binding.Id, summary.EndChangelogSeq, ct);
                }

                sw.Stop();
                summary.DurationMs = sw.ElapsedMilliseconds;
                summary.CurrentStage = "Completed";
                summary.StageIndex = summary.TotalStages;
                summary.PercentComplete = 100;
                summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
                summary.AppendVerboseLog($"Completed Track 1 {mode} in {summary.DurationMs:N0} ms (cursor #{summary.EndChangelogSeq:N0})");
                await _ledger.CompleteRunAsync(runId, summary, ct);
                await _ledger.AppendAuditAsync(binding.Id, $"TRACK1_{mode}_COMPLETED", triggeredBy, new
                {
                    runId,
                    cohortCount = summary.CohortPatientCount,
                    durationMs = summary.DurationMs,
                    isDryRun
                }, ct);

                return (await _ledger.ListRunsAsync(binding.Id, 1, ct)).First();
            }
            else if (sampleLimit is > 0)
            {
                cohortUserIds = await SelectDiverseSampleCohortAsync(v1, binding, sampleLimit.Value, ct);
            }
            else
            {
                cohortUserIds = await LoadFullScopedCohortAsync(v1, binding, ct);
                await ApplyMappedPatientsDeletionShieldAsync(v1, v2, binding, runId, cohortUserIds, isDryRun, summary, ct);
            }

            summary.CohortPatientCount = cohortUserIds.Count;
            _logger.LogInformation(
                "Track 1 {Mode} starting for binding {BindingId}: {Count} patients (dryRun={DryRun}).",
                mode, binding.Id, cohortUserIds.Count, isDryRun);

            if (cohortUserIds.Count > 0)
            {
                await ExecuteTrack1PipelineAsync(
                    v1, v2, binding, runId, cohortUserIds, systems, fileTypes, clinicians,
                    isDryRun, forceV1OnConflict, summary, ct);
            }

            if (!isDryRun && summary.EndChangelogSeq >= startSeq)
            {
                await _ledger.UpdateCursorAsync(binding.Id, summary.EndChangelogSeq, ct);
            }

            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            summary.CurrentStage = "Completed";
            summary.StageIndex = summary.TotalStages;
            summary.PercentComplete = 100;
            summary.LastProgressAtUtc = DateTimeOffset.UtcNow;
            summary.AppendVerboseLog($"Completed Track 1 {mode} in {summary.DurationMs:N0} ms (cursor #{summary.EndChangelogSeq:N0})");
            await _ledger.CompleteRunAsync(runId, summary, ct);
            await _ledger.AppendAuditAsync(binding.Id, $"TRACK1_{mode}_COMPLETED", triggeredBy, new
            {
                runId,
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
                "Track 1 {Mode} failed for binding {BindingId}: {SanitizedError}",
                mode, binding.Id, SyncTransforms.SanitizeErrorMessage(ex));
            await _ledger.FailRunAsync(runId, summary, ex, ct);
            throw;
        }
        finally
        {
            ActiveRunProgress.Value = prevProgress;
        }
    }

    private async Task ExecuteTrack1PipelineAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> systems,
        Dictionary<int, string> fileTypes,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct)
    {
        const int totalStages = 9;

        // 4. Sync Patients (with v2-wins guard + Deletion Shield + lossless CustomFields)
        await BeginStageAsync(1, totalStages, "Patients & Custom Profiles", cohortUserIds.Count, ct);
        var (patientNameMap, activeCohortUserIds) = await SyncPatientsAsync(
            v1, v2, binding, runId, cohortUserIds, isDryRun, forceV1OnConflict, summary, ct);
        if (activeCohortUserIds.Count == 0)
        {
            return;
        }

        // 5. Sync Patient Child Profiles (Addresses, Guardians, Allergies, Histories, Immunizations, PhilHealth, Alerts)
        await BeginStageAsync(2, totalStages, "Addresses, Guardians & Medical Histories", activeCohortUserIds.Count, ct);
        await SyncPatientProfilesAsync(
            v1, v2, binding, runId, activeCohortUserIds, patientNameMap, isDryRun, forceV1OnConflict, summary, ct);

        // 6. Sync Visit Spine: Appointments -> Historical QueueItems (ChiefComplaint) -> Consultations (SOAP + ROS) -> Vitals & Pre-Assessments
        await BeginStageAsync(3, totalStages, "Appointments, Queue, Consultations & Vitals", activeCohortUserIds.Count, ct);
        var (_, consultToQueueMap) = await SyncVisitSpineAsync(
            v1, v2, binding, runId, activeCohortUserIds, patientNameMap, systems, clinicians, isDryRun, forceV1OnConflict, summary, ct);

        // 7. Sync Prescriptions + ClinicDispensingLogs
        await BeginStageAsync(4, totalStages, "Prescriptions & Dispensing Logs", activeCohortUserIds.Count, ct);
        await SyncPrescriptionsAndDispensingAsync(
            v1, v2, binding, runId, activeCohortUserIds, patientNameMap, consultToQueueMap, systems, clinicians, isDryRun, forceV1OnConflict, summary, ct);

        // 8. Sync Unified Lab / Imaging / HeartStation Orders + Items
        await BeginStageAsync(5, totalStages, "Lab, Imaging & Heart Station Orders", activeCohortUserIds.Count, ct);
        await SyncDiagnosticOrdersAsync(
            v1, v2, binding, runId, activeCohortUserIds, patientNameMap, consultToQueueMap, clinicians, isDryRun, forceV1OnConflict, summary, ct);

        // 9. Sync Medical Certificates
        await BeginStageAsync(6, totalStages, "Medical Certificates", activeCohortUserIds.Count, ct);
        await SyncMedicalCertificatesAsync(
            v1, v2, binding, runId, activeCohortUserIds, patientNameMap, consultToQueueMap, clinicians, isDryRun, forceV1OnConflict, summary, ct);

        // 10. Sync Non-Private Clinic/Org Attachments (STRICTLY excluding FileSetting.privacy = 'PRIVATE' & FolderSetting.privacy = 'PRIVATE'!)
        await BeginStageAsync(7, totalStages, "Clinical Attachments", activeCohortUserIds.Count, ct);
        await SyncClinicRecordAttachmentsAsync(
            v1, v2, binding, runId, activeCohortUserIds, fileTypes, isDryRun, forceV1OnConflict, summary, ct);

        // 11. Sync Physical Examinations & Findings
        await BeginStageAsync(8, totalStages, "Physical Examinations", activeCohortUserIds.Count, ct);
        await SyncPhysicalExaminationsAsync(
            v1, v2, binding, runId, activeCohortUserIds, consultToQueueMap, clinicians, isDryRun, forceV1OnConflict, summary, ct);

        // 12. Sync Home Medications (Medication + MedicationDrug + Drug)
        await BeginStageAsync(9, totalStages, "Home Medications", activeCohortUserIds.Count, ct);
        await SyncHomeMedicationsAsync(
            v1, v2, binding, runId, activeCohortUserIds, clinicians, isDryRun, forceV1OnConflict, summary, ct);
    }

    public async Task<SyncRunRecord> ForceSyncEntityAsync(
        SyncBinding binding,
        string entityType,
        string v1Id,
        Guid v2Id,
        string triggeredBy,
        CancellationToken ct)
    {
        if (!binding.V1ClinicId.HasValue || string.IsNullOrWhiteSpace(binding.V2TenantId) || !binding.V2ClinicId.HasValue)
        {
            throw new InvalidOperationException(
                "Track 1 binding requires explicit V1ClinicId, V2TenantId, and V2ClinicId.");
        }

        var canonicalEntityType = string.Equals(entityType, "PatientPhilHealth", StringComparison.OrdinalIgnoreCase)
            ? "PatientPhilHealthMembership"
            : entityType;

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
            await using var v2 = await _connections.OpenClinicDbAsync(ct);

            var v1UserId = await ResolveForceSyncOwnerUserIdAsync(v1, binding, canonicalEntityType, v1Id, ct);
            if (!v1UserId.HasValue ||
                !await IsUserInBindingScopeAsync(v1, v1UserId.Value, binding.V1ClinicId, binding.V1OrgId, ct) ||
                !await IsUserActiveInV1Async(v1, v1UserId.Value, ct))
            {
                throw new InvalidOperationException(
                    "Cannot FORCE_V1 because the v1 source record is deleted or out of scope for this binding; Deletion Shield preserved the v2 record.");
            }

            summary.CohortPatientCount = 1;
            var cohort = new List<int> { v1UserId.Value };
            var patientNames = await LoadSinglePatientDisplayNameMapAsync(v1, v1UserId.Value, ct);

            switch (canonicalEntityType)
            {
                case "Patient":
                    _ = await SyncPatientsAsync(
                        v1, v2, binding, runId, cohort,
                        isDryRun: false, forceV1OnConflict: true, summary, ct);
                    break;

                case "PatientAddress":
                case "PatientGuardian":
                case "PatientAllergy":
                case "PatientMedicalHistory":
                case "PatientFamilyHistory":
                case "PatientSocialHistory":
                case "PatientReproductiveHistory":
                case "PatientSurgicalHistory":
                case "PatientImmunization":
                case "PatientPhilHealthMembership":
                case "PatientAlert":
                    await SyncPatientProfilesAsync(
                        v1, v2, binding, runId, cohort, patientNames,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: canonicalEntityType, targetV1IdFilter: v1Id);
                    break;

                case "Appointment":
                case "Consultation":
                case "PatientVitals":
                {
                    var systems = await LoadV1LookupIntStringAsync(v1, """SELECT id, name FROM public."System" """, ct);
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    await SyncVisitSpineAsync(
                        v1, v2, binding, runId, cohort, patientNames, systems, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: canonicalEntityType, targetV1IdFilter: v1Id);
                    break;
                }

                case "Prescription":
                case "ClinicDispensingLog":
                {
                    var systems = await LoadV1LookupIntStringAsync(v1, """SELECT id, name FROM public."System" """, ct);
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    var consultQueue = await LoadExistingConsultationQueueMapAsync(v1, v2, binding, cohort, ct);
                    await SyncPrescriptionsAndDispensingAsync(
                        v1, v2, binding, runId, cohort, patientNames, consultQueue, systems, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: canonicalEntityType, targetV1IdFilter: v1Id);
                    break;
                }

                case "LabOrder":
                case "LabOrderItem":
                {
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    var consultQueue = await LoadExistingConsultationQueueMapAsync(v1, v2, binding, cohort, ct);
                    await SyncDiagnosticOrdersAsync(
                        v1, v2, binding, runId, cohort, patientNames, consultQueue, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetEntityTypeFilter: canonicalEntityType, targetV1IdFilter: v1Id);
                    break;
                }

                case "MedicalCertificate":
                {
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    var consultQueue = await LoadExistingConsultationQueueMapAsync(v1, v2, binding, cohort, ct);
                    await SyncMedicalCertificatesAsync(
                        v1, v2, binding, runId, cohort, patientNames, consultQueue, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetV1IdFilter: v1Id);
                    break;
                }

                case "RecordAttachment":
                {
                    var fileTypes = await LoadV1LookupIntStringAsync(v1, """SELECT id, name FROM public."FileType" """, ct);
                    await SyncClinicRecordAttachmentsAsync(
                        v1, v2, binding, runId, cohort, fileTypes,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetV1IdFilter: v1Id);
                    break;
                }

                case "PatientPhysicalExam":
                {
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    var consultQueue = await LoadExistingConsultationQueueMapAsync(v1, v2, binding, cohort, ct);
                    await SyncPhysicalExaminationsAsync(
                        v1, v2, binding, runId, cohort, consultQueue, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetV1IdFilter: v1Id);
                    break;
                }

                case "PatientHomeMedication":
                {
                    var clinicians = await LoadV1ClinicianSnapshotsAsync(v1, ct);
                    await SyncHomeMedicationsAsync(
                        v1, v2, binding, runId, cohort, clinicians,
                        isDryRun: false, forceV1OnConflict: true, summary, ct,
                        targetV1IdFilter: v1Id);
                    break;
                }

                default:
                    throw new InvalidOperationException(
                        $"Single-entity FORCE_V1 is not supported for Track 1 entity '{entityType}'.");
            }

            var entityCounter = summary.For(canonicalEntityType);
            if (entityCounter.ShieldedDeletes > 0 || (entityCounter.Updated == 0 && entityCounter.Created == 0))
            {
                throw new InvalidOperationException(
                    "Cannot FORCE_V1 because the v1 source record is deleted or missing; Deletion Shield preserved the v2 record.");
            }

            sw.Stop();
            summary.DurationMs = sw.ElapsedMilliseconds;
            await _ledger.CompleteRunAsync(runId, summary, ct);
            await _ledger.AppendAuditAsync(binding.Id, "TRACK1_FORCE_V1_COMPLETED", triggeredBy, new
            {
                runId,
                entityType = canonicalEntityType,
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
                "Track 1 FORCE_V1 failed for binding {BindingId} entity {EntityType}: {SanitizedError}",
                binding.Id, canonicalEntityType, SyncTransforms.SanitizeErrorMessage(ex));
            await _ledger.FailRunAsync(runId, summary, ex, ct);
            throw;
        }
    }

    public async Task<ParityReportResponse> BuildParityReportAsync(SyncBinding binding, CancellationToken ct)
    {
        if (!binding.V1ClinicId.HasValue || !binding.V2ClinicId.HasValue || string.IsNullOrWhiteSpace(binding.V2TenantId))
        {
            throw new InvalidOperationException("Track 1 binding is missing Clinic/Tenant mapping.");
        }

        await using var v1 = await _connections.OpenV1SourceAsync(ct);
        await using var v2 = await _connections.OpenClinicDbAsync(ct);

        var maxSeq = await ReadV1MaxChangelogSeqAsync(v1, ct);
        var lastSeq = await _ledger.GetCursorAsync(binding.Id, ct);
        var openConflicts = await _ledger.CountOpenConflictsAsync(binding.Id, ct);
        var mapped = await _ledger.GetMappedCountsByEntityAsync(binding.Id, ct);

        var clinicId = binding.V1ClinicId.Value;
        var orgId = binding.V1OrgId;
        var v2ClinicId = binding.V2ClinicId.Value;
        var v2TenantId = binding.V2TenantId!;
        var hasClinicOrgTable = await TableExistsAsync(v1, "ClinicOrganization", ct);
        var hasFileTypesAndSettings = await TableExistsAsync(v1, "FileClinicShare", ct) &&
                                      await TableExistsAsync(v1, "FileSetting", ct) &&
                                      await TableExistsAsync(v1, "FolderSetting", ct);
        var hasFolderActiveCols = await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                  await ColumnExistsAsync(v1, "Folder", "isActive", ct);

        const string scopeUserFilter = """
            u."isActive" = true AND u."deletedAt" IS NULL
            AND (
                EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                OR (
                    @oid IS NOT NULL
                    AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)
                    AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
                )
            )
            """;

        const string activeCohortUserFilter = """
            u."isActive" = true AND u."deletedAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
            """;

        var scopeParams = new[] { ("cid", (object)clinicId), ("oid", (object?)orgId ?? DBNull.Value) };
        var cidParams = new[] { ("cid", (object)clinicId) };
        var v2Params = new[] { ("tid", (object)v2TenantId), ("cid", (object)v2ClinicId) };

        long v1Patients = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT u.id)
            FROM public."User" u
            WHERE {scopeUserFilter}
            """, scopeParams, ct);

        long v1Addresses = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT ua."userId", ua."isPrimary"
                FROM public."UserAddress" ua
                JOIN public."User" u ON u.id = ua."userId"
                WHERE ua."deletedAt" IS NULL AND ua."isActive" = true AND {scopeUserFilter}
            ) sub
            """, scopeParams, ct);

        long v1Guardians = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserEmergencyContact" ec
            JOIN public."User" u ON u.id = ec."userId"
            WHERE ec."deletedAt" IS NULL AND ec."isActive" = true AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1Allergies = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."UserAllergy" ua
            JOIN public."User" u ON u.id = ua."userId"
            WHERE {scopeUserFilter}
            """, scopeParams, ct);

        long v1MedHist = await ScalarInt64Async(v1, $"""
            SELECT
                (SELECT COUNT(*) FROM public."UserHealthCondition" uhc JOIN public."User" u ON u.id = uhc."userId" WHERE {scopeUserFilter}) +
                (SELECT COUNT(*) FROM public."MedicalHistory" mh JOIN public."User" u ON u.id = mh."userId" WHERE {scopeUserFilter}) +
                (SELECT COUNT(*) FROM public."UserDisability" ud JOIN public."User" u ON u.id = ud."userId" WHERE {scopeUserFilter})
            """, scopeParams, ct);

        long v1FamHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."FamilyMedicalHistory" fmh
            JOIN public."User" u ON u.id = fmh."userId"
            WHERE fmh."deletedAt" IS NULL AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1SocialHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT ph."userId") FROM public."PersonalHistory" ph
            JOIN public."User" u ON u.id = ph."userId"
            WHERE ph."deletedAt" IS NULL AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1ReproHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT og."userId") FROM public."ObGyneHistory" og
            JOIN public."User" u ON u.id = og."userId"
            WHERE og."deletedAt" IS NULL AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1SurgHist = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."SurgicalHistory" sh
            JOIN public."User" u ON u.id = sh."userId"
            WHERE sh."deletedAt" IS NULL AND {scopeUserFilter}
            """, scopeParams, ct);

        var hasUserVaccinationTable = await TableExistsAsync(v1, "UserVaccination", ct);
        var hasPatientImmunizationTable = !hasUserVaccinationTable && await TableExistsAsync(v1, "PatientImmunization", ct);

        long v1Immunizations = hasUserVaccinationTable
            ? await ScalarInt64Async(v1, $"""
                SELECT COUNT(*) FROM public."UserVaccination" uv
                JOIN public."User" u ON u.id = uv."userId"
                WHERE uv."deletedAt" IS NULL AND uv."isActive" = true AND {scopeUserFilter}
                """, scopeParams, ct)
            : hasPatientImmunizationTable
                ? await ScalarInt64Async(v1, $"""
                    SELECT COUNT(*) FROM public."PatientImmunization" pi
                    JOIN public."User" u ON u.id = pi."userId"
                    WHERE pi."deletedAt" IS NULL AND pi."isActive" = true AND {scopeUserFilter}
                    """, scopeParams, ct)
                : 0;

        long v1PhilHealth = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT pr."userId") FROM public."PhilHealthRecord" pr
            JOIN public."User" u ON u.id = pr."userId"
            WHERE pr."deletedAt" IS NULL AND pr."isActive" = true
              AND pr.pin IS NOT NULL AND trim(pr.pin) <> ''
              AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1Alerts = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."PatientInsight" pi
            JOIN public."User" u ON u.id = pi."patientId"
            WHERE pi."clinicId" = @cid AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1Appts = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."Appointment" a
            JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
            JOIN public."User" u ON u.id = ar."userId"
            WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL
              AND {activeCohortUserFilter}
            """, cidParams, ct);

        long v1Consults = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."ConsultationTicket" ct
            LEFT JOIN public."ClinicPatient" cp ON cp.id = ct."clinicPatientId"
            LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = ct."appointmentId"
            JOIN public."User" u ON u.id = COALESCE(cp."patientId", ar."userId")
            WHERE ct."clinicId" = @cid AND ct."isActive" = true
              AND {activeCohortUserFilter}
            """, cidParams, ct);

        long v1SharedConsultAppts = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT ct."appointmentId")
            FROM public."ConsultationTicket" ct
            LEFT JOIN public."ClinicPatient" cp ON cp.id = ct."clinicPatientId"
            LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = ct."appointmentId"
            JOIN public."User" u ON u.id = COALESCE(cp."patientId", ar."userId")
            WHERE ct."clinicId" = @cid AND ct."isActive" = true
              AND {activeCohortUserFilter}
              AND ct."appointmentId" IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public."Appointment" a
                  JOIN public."AppointmentRequester" ar2 ON ar2."appointmentId" = a.id
                  JOIN public."User" u2 ON u2.id = ar2."userId"
                  WHERE a.id = ct."appointmentId" AND a."clinicId" = @cid AND a."deletedAt" IS NULL
                    AND u2."isActive" = true AND u2."deletedAt" IS NULL
                    AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del2 WHERE cp_del2."patientId" = u2.id AND cp_del2."clinicId" = @cid AND cp_del2."deletedAt" IS NOT NULL)
              )
            """, cidParams, ct);
        long v1QueueItems = v1Appts + Math.Max(0, v1Consults - v1SharedConsultAppts);

        long v1VitalSigns = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."VitalSign" vs
            JOIN public."User" u ON u.id = vs."userId"
            WHERE vs."deletedAt" IS NULL AND vs."isActive" = true
              AND (vs."consultationTicketId" IS NULL OR EXISTS (
                  SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = vs."consultationTicketId" AND ct."clinicId" = @cid
              ))
              AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1DistinctUnclaimedPreAssess = await ScalarInt64Async(v1, $"""
            SELECT COUNT(DISTINCT pa."appointmentId")
            FROM public."PreAssessmentNote" pa
            JOIN public."AppointmentRequester" ar ON ar."appointmentId" = pa."appointmentId"
            JOIN public."User" u ON u.id = ar."userId"
            WHERE pa."clinicId" = @cid
              AND {activeCohortUserFilter}
              AND NOT EXISTS (
                  SELECT 1 FROM public."VitalSign" vs
                  JOIN public."ConsultationTicket" ct ON ct.id = vs."consultationTicketId"
                  WHERE vs."deletedAt" IS NULL AND vs."isActive" = true
                    AND ct."clinicId" = @cid AND ct."appointmentId" = pa."appointmentId"
              )
            """, cidParams, ct);
        long v1Vitals = v1VitalSigns + v1DistinctUnclaimedPreAssess;

        long v1MedCerts = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."ClinicMedicalCertificate" mc
            JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId"
            JOIN public."User" u ON u.id = cp."patientId"
            WHERE mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true
              AND {activeCohortUserFilter}
            """, cidParams, ct);

        long v1RxItems = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."Medicine" m
            JOIN public."Prescription" p ON p.id = m."prescriptionId"
            JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
            JOIN public."User" u ON u.id = cp."patientId"
            JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
            WHERE p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true
              AND {activeCohortUserFilter}
            """, cidParams, ct);

        long v1DispLogs = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."MedicineDispenseRecord" md
            JOIN public."Medicine" m ON m.id = md."medicineId"
            JOIN public."Prescription" p ON p.id = m."prescriptionId"
            JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
            JOIN public."User" u ON u.id = cp."patientId"
            JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
            WHERE md."isDispensed" = true
              AND p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true
              AND {activeCohortUserFilter}
            """, cidParams, ct);

        long v1Orders = await ScalarInt64Async(v1, $"""
            SELECT
                (SELECT COUNT(*) FROM public."ClinicLaboratoryRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter}) +
                (SELECT COUNT(*) FROM public."ClinicImagingRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter}) +
                (SELECT COUNT(*) FROM public."ClinicHeartStationRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter})
            """, cidParams, ct);

        long v1OrderItems = await ScalarInt64Async(v1, $"""
            SELECT
                (SELECT COUNT(*) FROM public."ClinicLaboratoryRequestProcedure" rp JOIN public."ClinicLaboratoryRequest" r ON r.id = rp."clinicLaboratoryRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter}) +
                (SELECT COUNT(*) FROM public."ClinicImagingRequestProcedure" rp JOIN public."ClinicImagingRequest" r ON r.id = rp."clinicImagingRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter}) +
                (SELECT COUNT(*) FROM public."ClinicHeartStationRequestProcedure" rp JOIN public."ClinicHeartStationRequest" r ON r.id = rp."clinicHeartStationRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" JOIN public."User" u ON u.id = cp."patientId" WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND {activeCohortUserFilter})
            """, cidParams, ct);

        var omrfClinicFilter = hasClinicOrgTable
            ? """
              JOIN public."ClinicOrganization" co ON co."organizationId" = om."organizationId"
              WHERE omrf."fileId" = f.id
                AND om."organizationId" = @oid
                AND co."clinicId" = @cid
                AND (
                    fs.privacy::text = 'PUBLIC'
                    OR NOT EXISTS (
                        SELECT 1 FROM public."ClinicOrganization" co2
                        WHERE co2."organizationId" = om."organizationId" AND co2."clinicId" <> @cid
                    )
                )
              """
            : """
              WHERE omrf."fileId" = f.id AND om."organizationId" = @oid
              """;

        var folderActiveFilter = hasFolderActiveCols
            ? """AND (f."folderId" IS NULL OR (fo.id IS NOT NULL AND fo."deletedAt" IS NULL AND fo."isActive" = true))"""
            : string.Empty;

        long v1FileAttachments = hasFileTypesAndSettings
            ? await ScalarInt64Async(v1, $"""
                SELECT COUNT(DISTINCT f.id)
                FROM public."File" f
                LEFT JOIN public."Folder" fo ON fo.id = f."folderId"
                JOIN public."User" u ON u.id = fo."userId"
                LEFT JOIN public."FileSetting" fs ON fs."fileId" = f.id
                LEFT JOIN public."FolderSetting" fos ON fos."folderId" = fo.id
                WHERE f."isActive" = true AND f."deletedAt" IS NULL
                  {folderActiveFilter}
                  AND f.url IS NOT NULL AND trim(f.url) <> ''
                  AND COALESCE(fs.privacy::text, 'PRIVATE') <> 'PRIVATE'
                  AND COALESCE(fos.privacy::text, 'CLINIC') <> 'PRIVATE'
                  AND {scopeUserFilter}
                  AND (
                      fs."scopeClinicId" = @cid
                      OR fos."scopeClinicId" = @cid
                      OR EXISTS (SELECT 1 FROM public."FileClinicShare" fcs WHERE fcs."fileSettingId" = fs.id AND fcs."clinicId" = @cid)
                      OR EXISTS (SELECT 1 FROM public."FolderClinicShare" flcs WHERE flcs."folderSettingId" = fos.id AND flcs."clinicId" = @cid)
                      OR (@oid IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public."OrgMemberRequirementFile" omrf
                          JOIN public."OrganizationMember" om ON om.id = omrf."orgMemberId"
                          {omrfClinicFilter}
                      ))
                  )
                """, scopeParams, ct)
            : 0;

        long v1ApptAttachments = await TableExistsAsync(v1, "AppointmentAttachment", ct)
            ? await ScalarInt64Async(v1, $"""
                SELECT COUNT(*)
                FROM public."AppointmentAttachment" aa
                JOIN public."Appointment" a ON a.id = aa."appointmentId"
                JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
                JOIN public."User" u ON u.id = ar."userId"
                WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL
                  AND {activeCohortUserFilter}
                  AND aa.url IS NOT NULL AND trim(aa.url) <> ''
                """, cidParams, ct)
            : 0;
        long v1Attachments = v1FileAttachments + v1ApptAttachments;

        long v1PhysicalExams = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."PhysicalExamination" pe
            JOIN public."User" u ON u.id = pe."userId"
            WHERE pe."deletedAt" IS NULL
              AND (pe."consultationTicketId" IS NULL OR EXISTS (
                  SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = pe."consultationTicketId" AND ct."clinicId" = @cid
              ))
              AND {scopeUserFilter}
            """, scopeParams, ct);

        long v1HomeMeds = await ScalarInt64Async(v1, $"""
            SELECT COUNT(*) FROM public."Medication" m
            JOIN public."User" u ON u.id = m."patientId"
            LEFT JOIN public."MedicationDrug" md ON md."medicationId" = m.id
            WHERE m."clinicId" = @cid AND {scopeUserFilter}
            """, scopeParams, ct);

        long v2Patients = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."Patients" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Addresses = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientAddresses" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Guardians = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientGuardians" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Allergies = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientAllergies" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2MedHist = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientMedicalHistories" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2FamHist = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientFamilyHistories" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2SocialHist = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientSocialHistories" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2ReproHist = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientReproductiveHistories" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2SurgHist = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientSurgicalHistories" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Immunizations = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientImmunizations" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2PhilHealth = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhilHealthMemberships" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Alerts = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientAlerts" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Appts = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."Appointments" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Queue = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."QueueItems" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Consults = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."Consultations" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Vitals = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientVitals" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2MedCerts = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."MedicalCertificates" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Rx = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."Prescriptions" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2DispLogs = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."ClinicDispensingLogs" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Orders = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."LabOrders" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2OrderItems = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."LabOrderItems" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2Attachments = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."RecordAttachments" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2PhysicalExams = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientPhysicalExams" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);
        long v2HomeMeds = await ScalarInt64Async(v2, """SELECT COUNT(*) FROM public."PatientHomeMedications" WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false""", v2Params, ct);

        long MapCnt(string key) => mapped.TryGetValue(key, out var c) ? c : 0;

        var checks = new List<ParityEntityCheck>
        {
            new("Patients", v1Patients, v2Patients, MapCnt("Patient"), v2Patients >= v1Patients),
            new("PatientAddresses", v1Addresses, v2Addresses, MapCnt("PatientAddress"), v2Addresses >= v1Addresses),
            new("PatientGuardians", v1Guardians, v2Guardians, MapCnt("PatientGuardian"), v2Guardians >= v1Guardians),
            new("PatientAllergies", v1Allergies, v2Allergies, MapCnt("PatientAllergy"), v2Allergies >= v1Allergies),
            new("PatientMedicalHistories", v1MedHist, v2MedHist, MapCnt("PatientMedicalHistory"), v2MedHist >= v1MedHist),
            new("PatientFamilyHistories", v1FamHist, v2FamHist, MapCnt("PatientFamilyHistory"), v2FamHist >= v1FamHist),
            new("PatientSocialHistories", v1SocialHist, v2SocialHist, MapCnt("PatientSocialHistory"), v2SocialHist >= v1SocialHist),
            new("PatientReproductiveHistories", v1ReproHist, v2ReproHist, MapCnt("PatientReproductiveHistory"), v2ReproHist >= v1ReproHist),
            new("PatientSurgicalHistories", v1SurgHist, v2SurgHist, MapCnt("PatientSurgicalHistory"), v2SurgHist >= v1SurgHist),
            new("PatientImmunizations", v1Immunizations, v2Immunizations, MapCnt("PatientImmunization"), v2Immunizations >= v1Immunizations),
            new("PatientPhilHealthMemberships", v1PhilHealth, v2PhilHealth, MapCnt("PatientPhilHealthMembership"), v2PhilHealth >= v1PhilHealth),
            new("PatientAlerts", v1Alerts, v2Alerts, MapCnt("PatientAlert"), v2Alerts >= v1Alerts),
            new("Appointments", v1Appts, v2Appts, MapCnt("Appointment"), v2Appts >= v1Appts),
            new("HistoricalQueueItems", v1QueueItems, v2Queue, MapCnt("QueueItem"), v2Queue >= v1QueueItems, "Visit spine + dedicated consultation queue items"),
            new("Consultations", v1Consults, v2Consults, MapCnt("Consultation"), v2Consults >= v1Consults),
            new("PatientVitals", v1Vitals, v2Vitals, MapCnt("PatientVitals"), v2Vitals >= v1Vitals, "VitalSign + unmerged PreAssessmentNote"),
            new("Prescriptions", v1RxItems, v2Rx, MapCnt("Prescription"), v2Rx >= v1RxItems),
            new("ClinicDispensingLogs", v1DispLogs, v2DispLogs, MapCnt("ClinicDispensingLog"), v2DispLogs >= v1DispLogs, "Dispensed MedicineDispenseRecord items (isDispensed=true)"),
            new("DiagnosticLabOrders", v1Orders, v2Orders, MapCnt("LabOrder"), v2Orders >= v1Orders, "Lab + Imaging + HeartStation unified"),
            new("LabOrderItems", v1OrderItems, v2OrderItems, MapCnt("LabOrderItem"), v2OrderItems >= v1OrderItems),
            new("MedicalCertificates", v1MedCerts, v2MedCerts, MapCnt("MedicalCertificate"), v2MedCerts >= v1MedCerts),
            new("RecordAttachments", v1Attachments, v2Attachments, MapCnt("RecordAttachment"), v2Attachments >= v1Attachments, "Clinic/Org non-private files + AppointmentAttachments (PRIVATE excluded)"),
            new("PatientPhysicalExams", v1PhysicalExams, v2PhysicalExams, MapCnt("PatientPhysicalExam"), v2PhysicalExams >= v1PhysicalExams),
            new("PatientHomeMedications", v1HomeMeds, v2HomeMeds, MapCnt("PatientHomeMedication"), v2HomeMeds >= v1HomeMeds)
        };

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
    // Step 1: Dynamic CustomFieldDefinitions Provisioning (Lossless Expansion)
    // -------------------------------------------------------------------------
    private async Task<List<string>> ProvisionCustomFieldDefinitionsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        bool isDryRun,
        SyncRunSummary summary,
        CancellationToken ct)
    {
        var orgId = binding.V1OrgId;
        var colleges = new SortedSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "College of Engineering and Architecture",
            "College of Information Technology and Computing",
            "College of Science and Mathematics",
            "College of Technology",
            "College of Science and Technology Education"
        };
        var programs = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        var yearLevels = new SortedSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "Graduate Studies"
        };
        var studentLevels = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        if (orgId.HasValue)
        {
            await LoadNamesIntoSetAsync(v1, """SELECT name FROM public."OrganizationCollege" WHERE "organizationId" = @oid AND "deletedAt" IS NULL""", orgId.Value, colleges, ct);
            await LoadNamesIntoSetAsync(v1, """SELECT name FROM public."OrganizationProgram" WHERE "organizationId" = @oid AND "deletedAt" IS NULL""", orgId.Value, programs, ct);
            await LoadNamesIntoSetAsync(v1, """SELECT name FROM public."OrganizationYearLevel" WHERE "organizationId" = @oid AND "deletedAt" IS NULL""", orgId.Value, yearLevels, ct);
        }
        await LoadNamesIntoSetAsync(v1, """SELECT name FROM public."StudentLevel" WHERE "deletedAt" IS NULL""", null, studentLevels, ct);

        const string relationshipOptionsJson = "[\"Parent\",\"Spouse\",\"Child\",\"Sibling\",\"Guardian\",\"Relative\",\"Friend\",\"Workplace Colleague\",\"Other\"]";

        var defs = new List<(string Key, string Label, string DataType, string Category, bool Required, int Order, string? OptionsJson, string? Placeholder, string? VisibilityJson)>
        {
            // 8 university_ustp template fields
            ("affiliation", "Affiliation", "Select", "Institutional", false, 1, JsonSerializer.Serialize(new[] { "Student", "Employee/Faculty", "Dependent", "Guest" }), "Select institutional affiliation", null),
            ("student_id", "Student ID", "Text", "Student", false, 2, null, "e.g. 2024301234", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("college", "College / Faculty", "Select", "Student", false, 3, JsonSerializer.Serialize(colleges.ToArray()), "Select college", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("program", "Degree / Academic Program", "Select", "Student", false, 4, JsonSerializer.Serialize(programs.ToArray()), "Select academic program", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("year_level", "Year Level", "Select", "Student", false, 5, JsonSerializer.Serialize(yearLevels.ToArray()), "Select year level", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("employee_id", "Employee ID", "Text", "Employee", false, 6, null, "e.g. EMP-2024-889", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}"),
            ("department", "Department", "Text", "Employee", false, 7, null, "e.g. Office of Student Affairs", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}"),
            ("campus_location", "Campus Location", "Select", "Institutional", false, 8, JsonSerializer.Serialize(new[] { "Cagayan de Oro (Main)", "Claveria", "Jasaan", "Panaon", "Oroquieta", "Villanueva", "Balubal" }), "Select campus", null),

            // 9 Auto-created lossless dynamic v1 fields
            ("lrn", "Learner Reference Number (LRN)", "Text", "Student", false, 9, null, "12-digit DepEd LRN", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("student_level", "Academic Level", "Select", "Student", false, 10, JsonSerializer.Serialize(studentLevels.Count > 0 ? studentLevels.ToArray() : new[] { "Senior High School", "Undergraduate", "Graduate" }), "Select academic level", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}"),
            ("office", "Assigned Office / Unit", "Text", "Employee", false, 11, null, "Assigned campus office", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}"),
            ("position", "Job Position", "Text", "Employee", false, 12, null, "Job position", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}"),
            ("designation", "Official Designation", "Text", "Employee", false, 13, null, "Official designation", "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}"),
            ("place_of_birth", "Place of Birth", "Text", "Demographics", false, 14, null, "City / Province of birth", null),
            ("legacy_case_number", "Legacy Case Number", "Text", "Institutional", false, 15, null, "ClinicEZ v1 case number", null),
            ("tin", "Tax Identification Number (TIN)", "Text", "Statutory IDs", false, 16, null, "BIR TIN", null),
            ("philsys_id", "PhilSys National ID (PSN)", "Text", "Statutory IDs", false, 17, null, "Philippine Identification Number", null),

            // 13 patient_intake_contacts fields (5 secondary_address_* + 8 emergency contacts)
            ("secondary_address_line", "Secondary Street Address", "Text", "Address", false, 18, null, "Dormitory, Boarding House, Work, or Provincial Street Address", null),
            ("secondary_barangay", "Secondary Barangay", "Text", "Address", false, 19, null, "e.g. Barangay San Antonio, Poblacion", null),
            ("secondary_city", "Secondary City / Municipality", "Text", "Address", false, 20, null, "e.g. Cagayan de Oro City, Manila, Cebu City", null),
            ("secondary_province", "Secondary Province / Region", "Text", "Address", false, 21, null, "e.g. Misamis Oriental, Metro Manila, Cebu", null),
            ("secondary_postal_code", "Secondary Postal / ZIP Code", "Text", "Address", false, 22, null, "e.g. 9000, 1100", null),
            ("emergency_contact_name", "Primary Emergency Contact Name", "Text", "Emergency Contacts", false, 23, null, "Full name of primary emergency contact", null),
            ("emergency_contact_relationship", "Relationship to Patient", "Select", "Emergency Contacts", false, 24, relationshipOptionsJson, "Select relationship", null),
            ("emergency_contact_phone", "Emergency Contact Phone Number", "Text", "Emergency Contacts", false, 25, null, "e.g. 0917-123-4567 or (02) 8123-4567", null),
            ("emergency_contact_address", "Emergency Contact Address", "Text", "Emergency Contacts", false, 26, null, "Complete residential or workplace address", null),
            ("secondary_emergency_contact_name", "Secondary Emergency Contact Name", "Text", "Emergency Contacts", false, 27, null, "Full name of secondary / backup contact", null),
            ("secondary_emergency_contact_relationship", "Secondary Contact Relationship", "Select", "Emergency Contacts", false, 28, relationshipOptionsJson, "Select relationship", null),
            ("secondary_emergency_contact_phone", "Secondary Contact Phone Number", "Text", "Emergency Contacts", false, 29, null, "e.g. 0918-987-6543", null),
            ("secondary_emergency_contact_address", "Secondary Contact Address", "Text", "Emergency Contacts", false, 30, null, "Complete residential or workplace address", null)
        };

        var retiredKeys = new[]
        {
            "primary_address_line",
            "primary_barangay",
            "primary_city",
            "primary_province",
            "primary_postal_code",
            "secondary_city_province"
        };

        if (!isDryRun)
        {
            await using var retireCmd = new NpgsqlCommand("""
                UPDATE public."CustomFieldDefinitions"
                SET "IsActive" = false, "UpdatedAt" = now(), "UpdatedBy" = @actor
                WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "EntityType" = 'Patient' AND "IsDeleted" = false
                  AND "FieldKey" = ANY(@retired) AND "IsActive" = true
                """, v2);
            retireCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
            retireCmd.Parameters.AddWithValue("tid", binding.V2TenantId!);
            retireCmd.Parameters.AddWithValue("cid", binding.V2ClinicId!.Value);
            retireCmd.Parameters.AddWithValue("retired", retiredKeys);
            await retireCmd.ExecuteNonQueryAsync(ct);
        }

        var existingRows = new Dictionary<string, (Guid Id, string DataType, string? OptionsJson, string? BoundaryMode, bool IsActive)>(StringComparer.OrdinalIgnoreCase);
        await using (var cmd = new NpgsqlCommand("""
            SELECT "Id", "FieldKey", "DataType", "OptionsJson", "BoundaryMode", "IsActive"
            FROM public."CustomFieldDefinitions"
            WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "EntityType" = 'Patient' AND "IsDeleted" = false
            """, v2))
        {
            cmd.Parameters.AddWithValue("tid", binding.V2TenantId!);
            cmd.Parameters.AddWithValue("cid", binding.V2ClinicId!.Value);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                existingRows[r.GetString(1)] = (
                    r.GetGuid(0),
                    r.GetString(2),
                    r.IsDBNull(3) ? null : r.GetString(3),
                    r.IsDBNull(4) ? null : r.GetString(4),
                    r.GetBoolean(5));
            }
        }

        var provisioned = new List<string>();
        var counter = summary.For("CustomFieldDefinition");
        foreach (var d in defs)
        {
            if (existingRows.TryGetValue(d.Key, out var existing))
            {
                var needsHeal = !string.Equals(existing.DataType, d.DataType, StringComparison.Ordinal) ||
                                existing.BoundaryMode is not null ||
                                !existing.IsActive ||
                                (d.OptionsJson is not null && !string.Equals(existing.OptionsJson, d.OptionsJson, StringComparison.Ordinal));
                if (!needsHeal)
                {
                    counter.Unchanged++;
                    continue;
                }

                counter.Updated++;
                provisioned.Add(d.Key);
                if (isDryRun) continue;

                const string healSql = """
                    UPDATE public."CustomFieldDefinitions"
                    SET "Label" = @label,
                        "DataType" = @dataType,
                        "Category" = @category,
                        "DisplayOrder" = @ord,
                        "OptionsJson" = @opts,
                        "Placeholder" = @ph,
                        "VisibilityRuleJson" = @vis,
                        "BoundaryMode" = NULL,
                        "IsActive" = true,
                        "UpdatedAt" = now(),
                        "UpdatedBy" = @actor
                    WHERE "Id" = @id
                    """;
                await using var healCmd = new NpgsqlCommand(healSql, v2);
                healCmd.Parameters.AddWithValue("id", existing.Id);
                healCmd.Parameters.AddWithValue("label", d.Label);
                healCmd.Parameters.AddWithValue("dataType", d.DataType);
                healCmd.Parameters.AddWithValue("category", d.Category);
                healCmd.Parameters.AddWithValue("ord", d.Order);
                healCmd.Parameters.AddWithValue("opts", (object?)d.OptionsJson ?? DBNull.Value);
                healCmd.Parameters.AddWithValue("ph", (object?)d.Placeholder ?? DBNull.Value);
                healCmd.Parameters.AddWithValue("vis", (object?)d.VisibilityJson ?? DBNull.Value);
                healCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                await healCmd.ExecuteNonQueryAsync(ct);
                continue;
            }

            provisioned.Add(d.Key);
            counter.Created++;
            if (isDryRun) continue;

            var defId = DeterministicUuid.CustomFieldDefId(binding.V2ClinicId!.Value, d.Key);
            const string insertSql = """
                INSERT INTO public."CustomFieldDefinitions" (
                    "Id", "EntityType", "FieldKey", "Label", "DataType", "Category",
                    "IsRequired", "DisplayOrder", "OptionsJson", "Placeholder", "IsActive",
                    "VisibilityRuleJson", "ConditionalOptionsJson", "BoundaryMode",
                    "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "IsDeleted",
                    "TenantId", "ClinicId"
                ) VALUES (
                    @id, 'Patient', @key, @label, @dataType, @category,
                    @req, @ord, @opts, @ph, true,
                    @vis, NULL, NULL,
                    now(), @actor, now(), @actor, false,
                    @tid, @cid
                ) ON CONFLICT ("Id") DO NOTHING
                """;
            await using var cmd = new NpgsqlCommand(insertSql, v2);
            cmd.Parameters.AddWithValue("id", defId);
            cmd.Parameters.AddWithValue("key", d.Key);
            cmd.Parameters.AddWithValue("label", d.Label);
            cmd.Parameters.AddWithValue("dataType", d.DataType);
            cmd.Parameters.AddWithValue("category", d.Category);
            cmd.Parameters.AddWithValue("req", d.Required);
            cmd.Parameters.AddWithValue("ord", d.Order);
            cmd.Parameters.AddWithValue("opts", (object?)d.OptionsJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("ph", (object?)d.Placeholder ?? DBNull.Value);
            cmd.Parameters.AddWithValue("vis", (object?)d.VisibilityJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
            cmd.Parameters.AddWithValue("tid", binding.V2TenantId!);
            cmd.Parameters.AddWithValue("cid", binding.V2ClinicId!.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        return provisioned;
    }

    // -------------------------------------------------------------------------
    // Step 2: Cohort Selection (Full / Diverse Sample / Incremental CDC Drain)
    // -------------------------------------------------------------------------
    private async Task<List<int>> LoadFullScopedCohortAsync(NpgsqlConnection v1, SyncBinding binding, CancellationToken ct)
    {
        var ids = new List<int>(16000);
        const string sql = """
            SELECT DISTINCT u.id
            FROM public."User" u
            WHERE u."isActive" = true AND u."deletedAt" IS NULL
              AND (
                  EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                  OR (
                      @oid IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)
                      AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
                  )
              )
            ORDER BY u.id ASC
            """;
        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("cid", binding.V1ClinicId!.Value);
        cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) ids.Add(r.GetInt32(0));
        return ids;
    }

    /// <summary>
    /// Deliberately selects a rich edge-case sample cohort (up to `limit` patients) covering:
    /// missing DOB, student with LRN, employee with office/position/designation, PhilHealth holder,
    /// pre-assessment without consult, full consultation + Rx + dispense + lab/img/ECG + med cert + attachments.
    /// </summary>
    private async Task<List<int>> SelectDiverseSampleCohortAsync(NpgsqlConnection v1, SyncBinding binding, int limit, CancellationToken ct)
    {
        var selected = new LinkedList<int>();
        var seen = new HashSet<int>();
        void AddIds(IEnumerable<int> list)
        {
            foreach (var id in list)
            {
                if (seen.Count >= limit) break;
                if (seen.Add(id)) selected.AddLast(id);
            }
        }

        var cid = binding.V1ClinicId!.Value;
        var oid = binding.V1OrgId;
        var bucketSize = Math.Max(2, limit / 6);

        // Bucket A: Patients with Consultation + Rx + Vitals + MedCert
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT cp."patientId" FROM public."ClinicPatient" cp
            JOIN public."User" u ON u.id = cp."patientId" AND u."isActive" = true AND u."deletedAt" IS NULL
            JOIN public."ConsultationTicket" t ON t."clinicPatientId" = cp.id AND t."clinicId" = @cid AND t."isActive" = true
            WHERE cp."clinicId" = @cid AND cp."deletedAt" IS NULL
              AND EXISTS (SELECT 1 FROM public."Prescription" p WHERE p."consultationTicketId" = t.id AND p."isActive" = true)
            ORDER BY cp."patientId" DESC LIMIT @lim
            """, cid, oid, bucketSize, ct));

        // Bucket B: Patients with Missing DOB (testing nullable DateOfBirth!)
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT u.id FROM public."User" u
            WHERE u."isActive" = true AND u."deletedAt" IS NULL AND u.dob IS NULL
              AND (EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                   OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)))
              AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
            ORDER BY u.id ASC LIMIT @lim
            """, cid, oid, bucketSize, ct));

        // Bucket C: Students with LRN (testing dynamic custom field `lrn`!)
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT sr."userId" FROM public."UserStudentRecord" sr
            JOIN public."User" u ON u.id = sr."userId" AND u."isActive" = true AND u."deletedAt" IS NULL
            WHERE sr."deletedAt" IS NULL AND sr.lrn IS NOT NULL AND trim(sr.lrn) <> ''
              AND (@oid IS NULL OR sr."organizationId" = @oid)
              AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
            ORDER BY sr."userId" ASC LIMIT @lim
            """, cid, oid, bucketSize, ct));

        // Bucket D: Employees with office / position / designation
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT er."userId" FROM public."UserEmploymentRecord" er
            JOIN public."User" u ON u.id = er."userId" AND u."isActive" = true AND u."deletedAt" IS NULL
            WHERE er."deletedAt" IS NULL AND (@oid IS NULL OR er."organizationId" = @oid)
              AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
            ORDER BY er."userId" ASC LIMIT @lim
            """, cid, oid, bucketSize, ct));

        // Bucket E: Patients with PreAssessmentNote WITHOUT ConsultationTicket (visit spine bridge!)
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT ar."userId" FROM public."PreAssessmentNote" pa
            JOIN public."AppointmentRequester" ar ON ar."appointmentId" = pa."appointmentId"
            JOIN public."User" u ON u.id = ar."userId" AND u."isActive" = true AND u."deletedAt" IS NULL
            WHERE pa."clinicId" = @cid
              AND NOT EXISTS (SELECT 1 FROM public."ConsultationTicket" t WHERE t."appointmentId" = pa."appointmentId")
              AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
            ORDER BY ar."userId" DESC LIMIT @lim
            """, cid, oid, bucketSize, ct));

        // Bucket F: Patients with Lab/Imaging/HeartStation requests or PhilHealth or Legacy Auth0
        AddIds(await QueryIdBucketAsync(v1, """
            SELECT DISTINCT cp."patientId" FROM public."ClinicPatient" cp
            JOIN public."User" u ON u.id = cp."patientId" AND u."isActive" = true AND u."deletedAt" IS NULL
            WHERE cp."clinicId" = @cid AND cp."deletedAt" IS NULL
              AND (EXISTS (SELECT 1 FROM public."ClinicLaboratoryRequest" lr WHERE lr."clinicPatientId" = cp.id)
                   OR EXISTS (SELECT 1 FROM public."PhilHealthRecord" pr WHERE pr."userId" = u.id AND pr."deletedAt" IS NULL)
                   OR u."userId" LIKE 'auth0|%')
            ORDER BY cp."patientId" DESC LIMIT @lim
            """, cid, oid, limit, ct));

        // Fill remainder if needed
        if (seen.Count < limit)
        {
            AddIds(await QueryIdBucketAsync(v1, """
                SELECT DISTINCT u.id FROM public."User" u
                WHERE u."isActive" = true AND u."deletedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                ORDER BY u.id ASC LIMIT @lim
                """, cid, oid, limit, ct));
        }

        return selected.OrderBy(x => x).ToList();
    }

    private sealed record ChangelogDrainResult(
        List<int> ScopedUserIds,
        List<DeletedCdcEvent> DeletedEvents,
        long MaxSeq,
        int RawEventCount);

    private async Task<ChangelogDrainResult> DrainIncrementalChangelogAsync(
        NpgsqlConnection v1,
        SyncBinding binding,
        long afterSeq,
        CancellationToken ct)
    {
        var userIds = new SortedSet<int>();
        var deletedEvents = new List<DeletedCdcEvent>();
        long cursor = afterSeq;
        var rawCount = 0;

        CdcBatchResolution batch;
        do
        {
            batch = await _cdcResolver.ResolveBatchAsync(
                v1, cursor, binding.V1ClinicId, binding.V1OrgId, isGlobal: false, batchLimit: 5000, ct);

            foreach (var uid in batch.ScopedUserIds)
            {
                userIds.Add(uid);
            }
            if (batch.DeletedEvents.Count > 0)
            {
                deletedEvents.AddRange(batch.DeletedEvents);
            }
            rawCount += batch.RawEventCount;
            if (batch.MaxSeq > cursor)
            {
                cursor = batch.MaxSeq;
            }
            else if (batch.HasMore)
            {
                break;
            }
        } while (batch.HasMore);

        return new ChangelogDrainResult(userIds.ToList(), deletedEvents, cursor, rawCount);
    }

    private static string NormalizeTrack1EntityType(string resolverEntityType) =>
        string.Equals(resolverEntityType, "PatientPhilHealth", StringComparison.OrdinalIgnoreCase)
            ? "PatientPhilHealthMembership"
            : resolverEntityType;

    private async Task ApplyCdcDeletionShieldAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        IReadOnlyList<DeletedCdcEvent> deletedEvents,
        bool isDryRun,
        SyncRunSummary summary,
        CancellationToken ct)
    {
        if (deletedEvents.Count == 0) return;

        var candidatesByEntity = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var evt in deletedEvents)
        {
            foreach (var (rawType, v1Id) in ScopedCdcIdResolver.GetTrack1DeleteMapKeys(evt, binding.V1ClinicId))
            {
                var entityType = NormalizeTrack1EntityType(rawType);
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
        if (candidatesByEntity.TryGetValue("Patient", out var patientCandidateIds) && patientCandidateIds.Count > 0)
        {
            activePatientIdsInScope = await LoadActiveScopedPatientIdStringsAsync(v1, binding, patientCandidateIds, ct);
        }

        var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
        foreach (var (entityType, v1Ids) in candidatesByEntity)
        {
            var mappings = await _ledger.GetIdMappingsByV1IdsAsync(binding.Id, entityType, v1Ids, ct);
            if (string.Equals(entityType, "PatientHomeMedication", StringComparison.Ordinal))
            {
                foreach (var baseId in v1Ids)
                {
                    var prefixed = await _ledger.GetIdMappingsByV1IdPrefixAsync(binding.Id, entityType, baseId + ":", ct);
                    foreach (var kv in prefixed) mappings[kv.Key] = kv.Value;
                }
            }
            if (mappings.Count == 0) continue;

            var existingActiveV2 = await FilterExistingV2IdsForEntityAsync(v2, entityType, binding.V2TenantId!, binding.V2ClinicId!.Value, mappings.Values.ToArray(), ct);
            foreach (var (v1Id, v2Id) in mappings)
            {
                if (!existingActiveV2.Contains(v2Id)) continue;
                if (string.Equals(entityType, "Patient", StringComparison.Ordinal) &&
                    activePatientIdsInScope is not null &&
                    activePatientIdsInScope.Contains(v1Id))
                {
                    continue;
                }
                await RecordShieldedDeleteAsync(binding, runId, entityType, v1Id, v2Id, isDryRun, summary, diffBatch, ct);
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

        const string sql = """
            SELECT u.id
            FROM public."User" u
            WHERE u.id = ANY(@ids)
              AND u."isActive" = true AND u."deletedAt" IS NULL
              AND (
                  EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                  OR (
                      @oid IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)
                      AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
                  )
              )
            """;
        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("ids", numericIds.ToArray());
        cmd.Parameters.AddWithValue("cid", binding.V1ClinicId!.Value);
        cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            result.Add(r.GetInt32(0).ToString(CultureInfo.InvariantCulture));
        }
        return result;
    }

    private async Task ApplyMappedPatientsDeletionShieldAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        IReadOnlyCollection<int> activeCohortUserIds,
        bool isDryRun,
        SyncRunSummary summary,
        CancellationToken ct)
    {
        var mappedPatients = await _ledger.GetAllIdMappingsForEntityAsync(binding.Id, "Patient", ct);
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
            v2, "Patient", binding.V2TenantId!, binding.V2ClinicId!.Value,
            missingOrInactive.Select(x => x.V2Id).ToArray(), ct);
        if (existingV2.Count == 0) return;

        var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
        foreach (var (v1Id, v2Id) in missingOrInactive)
        {
            if (!existingV2.Contains(v2Id)) continue;
            await RecordShieldedDeleteAsync(binding, runId, "Patient", v1Id, v2Id, isDryRun, summary, diffBatch, ct);
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
        CancellationToken ct)
    {
        summary.For(entityType).ShieldedDeletes++;
        diffBatch.Add((entityType, v1Id, v2Id, SyncDiffAction.ShieldDelete, new[] { "isDeleted" }));
        if (!isDryRun)
        {
            await _ledger.RecordConflictAsync(
                binding.Id, runId, entityType, v1Id, v2Id,
                SyncConflictType.V1SoftDeletedShielded, new[] { "isDeleted" }, ct);
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
        CancellationToken ct)
    {
        if (v2PatientIds.Length == 0) return;
        var tableName = GetV2TableNameForEntity(entityType);
        if (tableName is null) return;

        var activeV2Rows = new List<Guid>();
        var sql = string.Equals(entityType, "LabOrderItem", StringComparison.Ordinal)
            ? """
              SELECT i."Id"
              FROM public."LabOrderItems" i
              JOIN public."LabOrders" o ON o."Id" = i."LabOrderId"
              WHERE o."TenantId" = @tid AND o."ClinicId" = @cid
                AND o."PatientId" = ANY(@pids) AND i."IsDeleted" = false
              """
            : string.Equals(entityType, "Prescription", StringComparison.Ordinal)
            ? """
              SELECT p."Id"
              FROM public."Prescriptions" p
              JOIN public."Consultations" c ON c."Id" = p."ConsultationEncounterId"
              WHERE c."TenantId" = @tid AND c."ClinicId" = @cid
                AND c."PatientId" = ANY(@pids) AND p."IsDeleted" = false
              """
            : $"""
              SELECT "Id"
              FROM public."{tableName}"
              WHERE "TenantId" = @tid AND "ClinicId" = @cid
                AND "PatientId" = ANY(@pids) AND "IsDeleted" = false
              """;

        await using (var cmd = new NpgsqlCommand(sql, v2))
        {
            cmd.Parameters.AddWithValue("tid", binding.V2TenantId!);
            cmd.Parameters.AddWithValue("cid", binding.V2ClinicId!.Value);
            cmd.Parameters.AddWithValue("pids", v2PatientIds);
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
            await RecordShieldedDeleteAsync(binding, runId, entityType, v1Id, v2Id, isDryRun, summary, diffBatch, ct);
        }
    }

    // -------------------------------------------------------------------------
    // Step 4: Sync Patients (Lossless Dynamic CustomFields + v2-wins + Deletion Shield)
    // -------------------------------------------------------------------------
    private async Task<(Dictionary<int, string> PatientNames, List<int> ActiveCohortUserIds)> SyncPatientsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct)
    {
        var patientNames = new Dictionary<int, string>(cohortUserIds.Count);
        var activeCohortUserIds = new List<int>(cohortUserIds.Count);
        var counter = summary.For("Patient");
        var storedHashes = await _ledger.LoadRowHashesAsync(binding.Id, "Patient", ct);
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        var oid = binding.V1OrgId;

        var hasAddrZip = await ColumnExistsAsync(v1, "UserAddress", "zipCode", ct);
        var hasEcAddr = await ColumnExistsAsync(v1, "UserEmergencyContact", "address", ct);
        var hasPhDepCols = await ColumnExistsAsync(v1, "PhilHealthDependent", "firstName", ct);

        var secZipExpr = hasAddrZip ? """a."zipCode" """ : "NULL::text";
        var ecAddrExpr = hasEcAddr ? "c.address" : "NULL::text";

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var chunkIds = chunk.ToArray();
            var v2Ids = chunkIds.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            // Read existing v2 rows for v2-wins drift check
            var existingV2 = await LoadExistingClinicPatientStatesAsync(v2, v2Ids, ct);

            // Pre-query natural unique PatientCode owners (IX_Patients_TenantId_ClinicId_PatientCode)
            var candidateCodes = chunkIds.Select(uid => $"V1-{uid:D6}").ToArray();
            var existingCodeOwners = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            await using (var codeCmd = new NpgsqlCommand("""
                SELECT "PatientCode", "Id"
                FROM public."Patients"
                WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false
                  AND "PatientCode" = ANY(@codes)
                """, v2))
            {
                codeCmd.Parameters.AddWithValue("tid", v2TenantId);
                codeCmd.Parameters.AddWithValue("cid", v2ClinicId);
                codeCmd.Parameters.AddWithValue("codes", candidateCodes);
                await using var cr = await codeCmd.ExecuteReaderAsync(ct);
                while (await cr.ReadAsync(ct)) existingCodeOwners[cr.GetString(0)] = cr.GetGuid(1);
            }

            // Load PhilHealthDependent snapshots for chunk when schema supports dependent detail columns
            var dependentsByUser = new Dictionary<int, List<IReadOnlyDictionary<string, object?>>>();
            if (hasPhDepCols)
            {
                const string depSql = """
                    SELECT pr."userId", pd."firstName", pd."lastName", pd.relationship, pd.gender, pd."isPermanentlyDisabled", pd.citizenship
                    FROM public."PhilHealthDependent" pd
                    JOIN public."PhilHealthRecord" pr ON pr.id = pd."philHealthRecordId"
                    WHERE pr."userId" = ANY(@ids)
                      AND pr."deletedAt" IS NULL AND pr."isActive" = true
                      AND pd."deletedAt" IS NULL
                    ORDER BY pd.id ASC
                    """;
                await using var depCmd = new NpgsqlCommand(depSql, v1);
                depCmd.Parameters.AddWithValue("ids", chunkIds);
                await using var dr = await depCmd.ExecuteReaderAsync(ct);
                while (await dr.ReadAsync(ct))
                {
                    var uid = dr.GetInt32(0);
                    if (!dependentsByUser.TryGetValue(uid, out var list))
                    {
                        list = new List<IReadOnlyDictionary<string, object?>>();
                        dependentsByUser[uid] = list;
                    }
                    var depObj = new SortedDictionary<string, object?>(StringComparer.Ordinal);
                    void PutDep(string k, string? v)
                    {
                        var c = SyncTransforms.Clean(v);
                        if (c is not null) depObj[k] = c;
                    }
                    PutDep("firstName", GetStr(dr, 1));
                    PutDep("lastName", GetStr(dr, 2));
                    PutDep("relationship", GetStr(dr, 3));
                    PutDep("gender", GetStr(dr, 4));
                    depObj["isPermanentlyDisabled"] = !dr.IsDBNull(5) && dr.GetBoolean(5);
                    PutDep("citizenship", GetStr(dr, 6));
                    list.Add(depObj);
                }
            }

            var sql = $"""
                SELECT u.id, u."firstName", u."lastName", u."middleName", u.suffix, u.dob,
                       u.gender::text, u."civilStatus"::text, u."bloodType"::text,
                       u.mobile, u.telephone, u.email, u.nationality, u.religion,
                       u.nickname, u."placeOfBirth", u."caseNumber",
                       u."accountType"::text, u."onboardingStatus"::text, u."verificationStatus"::text,
                       u."createdAt", u."updatedAt", u."deletedAt", u."isActive",
                       sr."studentId", sr.lrn, sl.name AS student_level, oc.name AS student_college,
                       op.name AS student_program, yl.name AS year_level,
                       er."employeeId", ed.name AS emp_dept, eo.name AS emp_office,
                       er.position AS emp_pos, er.designation AS emp_desig, ec.name AS emp_college,
                       pr.pin AS philhealth_pin, pr.tin, pr."philSysId",
                       addr.address_line, addr.barangay, addr.city, addr.province,
                       emc.ec_name, emc.ec_phone, emc.ec_rel, emc.ec_addr,
                       sec_addr.address_line, sec_addr.barangay, sec_addr.city, sec_addr.province, sec_addr.zip_code,
                       (
                           EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                           OR (
                               @oid IS NOT NULL
                               AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)
                               AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
                           )
                       ) AS in_active_scope
                FROM public."User" u
                LEFT JOIN LATERAL (
                    SELECT s."studentId", s.lrn, s.level, s."collegeId", s."programId", s."yearLevel"
                    FROM public."UserStudentRecord" s
                    WHERE s."userId" = u.id AND s."deletedAt" IS NULL
                      AND (@oid IS NULL OR s."organizationId" = @oid)
                    ORDER BY s."isActive" DESC, s."updatedAt" DESC NULLS LAST, s.id DESC LIMIT 1
                ) sr ON true
                LEFT JOIN public."StudentLevel" sl ON sl.id = sr.level
                LEFT JOIN public."OrganizationCollege" oc ON oc.id = sr."collegeId"
                LEFT JOIN public."OrganizationProgram" op ON op.id = sr."programId"
                LEFT JOIN public."OrganizationYearLevel" yl ON yl.id = sr."yearLevel"
                LEFT JOIN LATERAL (
                    SELECT e."employeeId", e."departmentId", e."officeId", e."collegeId", e.position, e.designation
                    FROM public."UserEmploymentRecord" e
                    WHERE e."userId" = u.id AND e."deletedAt" IS NULL
                      AND (@oid IS NULL OR e."organizationId" = @oid)
                    ORDER BY e."isActive" DESC, e."updatedAt" DESC NULLS LAST, e.id DESC LIMIT 1
                ) er ON true
                LEFT JOIN public."OrganizationDepartment" ed ON ed.id = er."departmentId"
                LEFT JOIN public."OrganizationOffice" eo ON eo.id = er."officeId"
                LEFT JOIN public."OrganizationCollege" ec ON ec.id = er."collegeId"
                LEFT JOIN LATERAL (
                    SELECT p.pin, p.tin, p."philSysId"
                    FROM public."PhilHealthRecord" p
                    WHERE p."userId" = u.id AND p."deletedAt" IS NULL
                    ORDER BY p."isActive" DESC, p."updatedAt" DESC NULLS LAST, p.id DESC LIMIT 1
                ) pr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(a."addressLine"), ''), NULLIF(trim(a.street), ''), NULLIF(trim(a.address), '')) AS address_line,
                           a.barangay, a.city, COALESCE(NULLIF(trim(a.state), ''), a.region) AS province
                    FROM public."UserAddress" a
                    WHERE a."userId" = u.id AND a."deletedAt" IS NULL AND a."isActive" = true
                    ORDER BY a."isPrimary" DESC, a.id DESC LIMIT 1
                ) addr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(a."addressLine"), ''), NULLIF(trim(a.street), ''), NULLIF(trim(a.address), '')) AS address_line,
                           a.barangay, a.city, COALESCE(NULLIF(trim(a.state), ''), a.region) AS province,
                           {secZipExpr} AS zip_code
                    FROM public."UserAddress" a
                    WHERE a."userId" = u.id AND a."deletedAt" IS NULL AND a."isActive" = true AND a."isPrimary" = false
                    ORDER BY a.id DESC LIMIT 1
                ) sec_addr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(c.name), ''), trim(concat_ws(' ', c."firstName", c."middleName", c."lastName", c.suffix))) AS ec_name,
                           c.phone AS ec_phone, c.relationship AS ec_rel, {ecAddrExpr} AS ec_addr
                    FROM public."UserEmergencyContact" c
                    WHERE c."userId" = u.id AND c."deletedAt" IS NULL AND c."isActive" = true
                    ORDER BY c."isPrimary" DESC, c.id DESC LIMIT 1
                ) emc ON true
                WHERE u.id = ANY(@ids)
                ORDER BY u.id ASC
                """;

            var ledgerUpdates = new List<(string V1Id, Guid V2Id, string V1Hash, string V2ExpectedHash)>();
            var diffBatch = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
            var seenInV1 = new HashSet<int>();

            await using var cmd = new NpgsqlCommand(sql, v1);
            cmd.Parameters.AddWithValue("ids", chunkIds);
            cmd.Parameters.AddWithValue("cid", v1ClinicId);
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)oid ?? DBNull.Value });

            await using var writeBatch = new NpgsqlBatch(v2);

            await using (var r = await cmd.ExecuteReaderAsync(ct))
            {
                while (await r.ReadAsync(ct))
                {
                    var v1UserId = r.GetInt32(0);
                    seenInV1.Add(v1UserId);
                    var v1IdStr = v1UserId.ToString(CultureInfo.InvariantCulture);
                    var v2PatientId = DeterministicUuid.ClinicPatientId(v2ClinicId, v1UserId);

                    var firstName = SyncTransforms.CleanRequired(GetStr(r, 1), "Unknown", 100);
                    var lastName = SyncTransforms.CleanRequired(GetStr(r, 2), "Patient", 100);
                    var middleName = SyncTransforms.Clean(GetStr(r, 3), 100);
                    var suffix = SyncTransforms.Clean(GetStr(r, 4), 20);
                    DateOnly? dob = r.IsDBNull(5) ? null : r.GetFieldValue<DateOnly>(5);
                    if (dob.HasValue && (dob.Value.Year < 1900 || dob.Value > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))))
                        dob = null;

                    var sex = SyncTransforms.MapClinicSex(GetStr(r, 6));
                    var civilStatus = SyncTransforms.MapClinicCivilStatus(GetStr(r, 7));
                    var bloodType = SyncTransforms.MapBloodType(GetStr(r, 8));
                    var mobile = SyncTransforms.Clean(GetStr(r, 9), 50);
                    var landline = SyncTransforms.Clean(GetStr(r, 10), 50);
                    var contactNumber = mobile ?? landline ?? "N/A";
                    var email = SyncTransforms.Clean(GetStr(r, 11), 255);
                    var nationality = SyncTransforms.Clean(GetStr(r, 12), 100);
                    var religion = SyncTransforms.Clean(GetStr(r, 13), 100);
                    var nickname = SyncTransforms.Clean(GetStr(r, 14), 100);
                    var placeOfBirth = SyncTransforms.Clean(GetStr(r, 15), 200);
                    var legacyCaseNo = SyncTransforms.Clean(GetStr(r, 16), 100);
                    var v1AccountType = SyncTransforms.Clean(GetStr(r, 17));
                    var v1OnboardingStatus = SyncTransforms.Clean(GetStr(r, 18));
                    var verificationStatus = SyncTransforms.MapClinicVerificationStatus(GetStr(r, 19));
                    var createdAt = GetUtc(r, 20) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 21) ?? createdAt;
                    var inActiveScope = !r.IsDBNull(52) && r.GetBoolean(52);
                    var isV1Deleted = !r.IsDBNull(22) || (!r.IsDBNull(23) && !r.GetBoolean(23)) || !inActiveScope;

                    var studentId = SyncTransforms.Clean(GetStr(r, 24));
                    var lrn = SyncTransforms.Clean(GetStr(r, 25));
                    var studentLevel = SyncTransforms.Clean(GetStr(r, 26));
                    var studentCollege = SyncTransforms.Clean(GetStr(r, 27));
                    var studentProgram = SyncTransforms.Clean(GetStr(r, 28));
                    var yearLevel = SyncTransforms.Clean(GetStr(r, 29));
                    var employeeId = SyncTransforms.Clean(GetStr(r, 30));
                    var empDept = SyncTransforms.Clean(GetStr(r, 31));
                    var empOffice = SyncTransforms.Clean(GetStr(r, 32));
                    var empPosRaw = SyncTransforms.Clean(GetStr(r, 33));
                    var empPos = SyncTransforms.Clean(empPosRaw, 100);
                    var empDesig = SyncTransforms.Clean(GetStr(r, 34));
                    var empCollege = SyncTransforms.Clean(GetStr(r, 35));
                    var philHealthPin = SyncTransforms.Clean(GetStr(r, 36), 30);
                    var tin = SyncTransforms.Clean(GetStr(r, 37), 50);
                    var philSysId = SyncTransforms.Clean(GetStr(r, 38), 50);

                    var addrLine = SyncTransforms.Clean(GetStr(r, 39));
                    var barangay = SyncTransforms.Clean(GetStr(r, 40));
                    var city = SyncTransforms.Clean(GetStr(r, 41));
                    var province = SyncTransforms.Clean(GetStr(r, 42));
                    var ecName = SyncTransforms.Clean(GetStr(r, 43));
                    var ecPhone = SyncTransforms.Clean(GetStr(r, 44));
                    var ecRel = SyncTransforms.Clean(GetStr(r, 45));
                    var ecAddr = SyncTransforms.Clean(GetStr(r, 46));
                    var secAddrLine = SyncTransforms.Clean(GetStr(r, 47));
                    var secBarangay = SyncTransforms.Clean(GetStr(r, 48));
                    var secCity = SyncTransforms.Clean(GetStr(r, 49));
                    var secProvince = SyncTransforms.Clean(GetStr(r, 50));
                    var secZip = SyncTransforms.Clean(GetStr(r, 51), 10);

                    var affiliation = studentId is not null || studentProgram is not null
                        ? "Student"
                        : (employeeId is not null || empOffice is not null || empPosRaw is not null ? "Employee/Faculty" : null);

                    dependentsByUser.TryGetValue(v1UserId, out var phDeps);

                    var customFields = SyncTransforms.BuildClinicPatientCustomFields(
                        affiliation: affiliation,
                        studentId: studentId,
                        lrn: lrn,
                        studentLevel: studentLevel,
                        collegeName: studentCollege ?? empCollege,
                        programName: studentProgram,
                        yearLevel: yearLevel,
                        employeeId: employeeId,
                        departmentName: empDept,
                        officeName: empOffice,
                        position: empPosRaw,
                        designation: empDesig,
                        placeOfBirth: placeOfBirth,
                        legacyCaseNumber: legacyCaseNo,
                        tin: tin,
                        philSysId: philSysId,
                        addressLine: addrLine,
                        barangay: barangay,
                        city: city,
                        province: province,
                        emergencyContactName: ecName,
                        emergencyContactPhone: ecPhone,
                        emergencyContactRelationship: ecRel,
                        v1AccountType: v1AccountType,
                        v1OnboardingStatus: v1OnboardingStatus,
                        v1Nickname: nickname,
                        secondaryAddressLine: secAddrLine,
                        secondaryBarangay: secBarangay,
                        secondaryCity: secCity,
                        secondaryProvince: secProvince,
                        secondaryPostalCode: secZip,
                        emergencyContactAddress: ecAddr,
                        philHealthDependents: phDeps);

                    var customFieldsJson = SyncTransforms.SerializeSortedJson(customFields);
                    var patientCode = $"V1-{v1UserId:D6}";
                    if (existingCodeOwners.TryGetValue(patientCode, out var ownerId) && ownerId != v2PatientId)
                    {
                        patientCode = $"V1-{v1UserId:D6}-{v2PatientId.ToString("N")[..4]}";
                    }

                    var displayName = SyncTransforms.CleanRequired($"{lastName}, {firstName}", "Patient", 150);
                    patientNames[v1UserId] = displayName;

                    // Medico-Legal Deletion Shield: NEVER delete an existing v2 patient when v1 soft-deletes
                    if (isV1Deleted)
                    {
                        if (existingV2.ContainsKey(v2PatientId))
                        {
                            await RecordShieldedDeleteAsync(binding, runId, "Patient", v1IdStr, v2PatientId, isDryRun, summary, diffBatch, ct);
                        }
                        continue;
                    }

                    activeCohortUserIds.Add(v1UserId);

                    var canonicalFields = BuildClinicPatientCanonicalMap(
                        firstName, lastName, middleName, suffix, dob, sex, civilStatus, bloodType,
                        contactNumber, landline, email, empPos, nationality, religion, nickname, philHealthPin,
                        ecName, ecPhone, ecRel, verificationStatus, customFieldsJson);
                    var v1Hash = DeterministicUuid.ComputeCanonicalHash(canonicalFields);

                    var existsInV2 = existingV2.TryGetValue(v2PatientId, out var currentV2State);
                    if (existsInV2 && storedHashes.TryGetValue(v1IdStr, out var prevHash))
                    {
                        if (!forceV1OnConflict && string.Equals(prevHash.V1PayloadHash, v1Hash, StringComparison.Ordinal))
                        {
                            counter.Unchanged++;
                            continue;
                        }

                        // v2-wins guard: check if staff edited the patient directly in v2 since our last sync
                        var liveV2Hash = DeterministicUuid.ComputeCanonicalHash(currentV2State!.Fields);
                        var changedFields = DeterministicUuid.ComputeChangedFieldNames(currentV2State.Fields, canonicalFields);
                        if (!forceV1OnConflict && !string.Equals(liveV2Hash, prevHash.V2ExpectedHash, StringComparison.Ordinal))
                        {
                            counter.SkippedV2Wins++;
                            diffBatch.Add(("Patient", v1IdStr, v2PatientId, SyncDiffAction.SkipV2Wins, changedFields));
                            if (!isDryRun)
                            {
                                await _ledger.RecordConflictAsync(binding.Id, runId, "Patient", v1IdStr, v2PatientId,
                                    SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                            }
                            continue;
                        }

                        counter.Updated++;
                        if (diffBatch.Count < 500)
                            diffBatch.Add(("Patient", v1IdStr, v2PatientId, forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update, changedFields));
                    }
                    else if (existsInV2)
                    {
                        var changedFields = DeterministicUuid.ComputeChangedFieldNames(currentV2State!.Fields, canonicalFields);
                        if (changedFields.Count == 0)
                        {
                            counter.Unchanged++;
                            ledgerUpdates.Add((v1IdStr, v2PatientId, v1Hash, v1Hash));
                            continue;
                        }
                        if (!forceV1OnConflict)
                        {
                            var liveV2Hash = DeterministicUuid.ComputeCanonicalHash(currentV2State.Fields);
                            counter.SkippedV2Wins++;
                            diffBatch.Add(("Patient", v1IdStr, v2PatientId, SyncDiffAction.SkipV2Wins, changedFields));
                            if (!isDryRun)
                            {
                                await _ledger.RecordConflictAsync(binding.Id, runId, "Patient", v1IdStr, v2PatientId,
                                    SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                            }
                            continue;
                        }
                        counter.Updated++;
                        if (diffBatch.Count < 500)
                            diffBatch.Add(("Patient", v1IdStr, v2PatientId, SyncDiffAction.ForceV1, changedFields));
                    }
                    else
                    {
                        counter.Created++;
                        if (diffBatch.Count < 500)
                            diffBatch.Add(("Patient", v1IdStr, v2PatientId, SyncDiffAction.Create, canonicalFields.Keys.ToList()));
                    }

                    if (!isDryRun)
                    {
                        var upsert = new NpgsqlBatchCommand("""
                            INSERT INTO public."Patients" (
                                "Id", "PatientCode", "FirstName", "LastName", "MiddleName", "Suffix",
                                "DateOfBirth", "Sex", "CivilStatus", "BloodType",
                                "ContactNumber", "LandlineNumber", "Email", "Occupation",
                                "EmergencyContactName", "EmergencyContactNumber", "EmergencyContactRelationship",
                                "PhilHealthNumber", "PreferredName", "Nationality", "Religion",
                                "IsDeceased", "CustomFields", "HasActiveSafetyAlert", "VerificationStatus", "ShareGrantScopes",
                                "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy", "IsDeleted",
                                "TenantId", "ClinicId"
                            ) VALUES (
                                @id, @code, @fn, @ln, @mn, @suf,
                                @dob, @sex, @civil, @blood,
                                @contact, @landline, @email, @occ,
                                @ecName, @ecPhone, @ecRel,
                                @phPin, @prefName, @nat, @rel,
                                false, @cf::jsonb, false, @vs, '',
                                @cat, @actor, @uat, @actor, false,
                                @tid, @cid
                            )
                            ON CONFLICT ("Id") DO UPDATE SET
                                "FirstName" = EXCLUDED."FirstName",
                                "LastName" = EXCLUDED."LastName",
                                "MiddleName" = EXCLUDED."MiddleName",
                                "Suffix" = EXCLUDED."Suffix",
                                "DateOfBirth" = EXCLUDED."DateOfBirth",
                                "Sex" = EXCLUDED."Sex",
                                "CivilStatus" = EXCLUDED."CivilStatus",
                                "BloodType" = EXCLUDED."BloodType",
                                "ContactNumber" = EXCLUDED."ContactNumber",
                                "LandlineNumber" = EXCLUDED."LandlineNumber",
                                "Email" = EXCLUDED."Email",
                                "Occupation" = EXCLUDED."Occupation",
                                "EmergencyContactName" = EXCLUDED."EmergencyContactName",
                                "EmergencyContactNumber" = EXCLUDED."EmergencyContactNumber",
                                "EmergencyContactRelationship" = EXCLUDED."EmergencyContactRelationship",
                                "PhilHealthNumber" = EXCLUDED."PhilHealthNumber",
                                "PreferredName" = EXCLUDED."PreferredName",
                                "Nationality" = EXCLUDED."Nationality",
                                "Religion" = EXCLUDED."Religion",
                                "VerificationStatus" = EXCLUDED."VerificationStatus",
                                "CustomFields" = EXCLUDED."CustomFields",
                                "UpdatedAt" = now(),
                                "UpdatedBy" = @actor
                            """);
                        upsert.Parameters.AddWithValue("id", v2PatientId);
                        upsert.Parameters.AddWithValue("code", patientCode);
                        upsert.Parameters.AddWithValue("fn", firstName);
                        upsert.Parameters.AddWithValue("ln", lastName);
                        upsert.Parameters.AddWithValue("mn", (object?)middleName ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("suf", (object?)suffix ?? DBNull.Value);
                        upsert.Parameters.Add(new NpgsqlParameter("dob", NpgsqlDbType.Date) { Value = dob.HasValue ? dob.Value : DBNull.Value });
                        upsert.Parameters.AddWithValue("sex", sex);
                        upsert.Parameters.AddWithValue("civil", (object?)civilStatus ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("blood", (object?)bloodType ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("contact", contactNumber);
                        upsert.Parameters.AddWithValue("landline", (object?)landline ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("email", (object?)email ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("occ", (object?)empPos ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("ecName", (object?)ecName ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("ecPhone", (object?)ecPhone ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("ecRel", (object?)ecRel ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("phPin", (object?)philHealthPin ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("prefName", (object?)nickname ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("nat", (object?)nationality ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("rel", (object?)religion ?? DBNull.Value);
                        upsert.Parameters.AddWithValue("cf", customFieldsJson);
                        upsert.Parameters.AddWithValue("vs", verificationStatus);
                        upsert.Parameters.AddWithValue("cat", createdAt);
                        upsert.Parameters.AddWithValue("uat", updatedAt);
                        upsert.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        upsert.Parameters.AddWithValue("tid", v2TenantId);
                        upsert.Parameters.AddWithValue("cid", v2ClinicId);
                        writeBatch.BatchCommands.Add(upsert);

                        ledgerUpdates.Add((v1IdStr, v2PatientId, v1Hash, v1Hash));
                    }
                }
            }

            // Shield any hard-deleted User in chunkIds that already exists in v2
            foreach (var uid in chunkIds)
            {
                if (seenInV1.Contains(uid)) continue;
                var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                if (existingV2.ContainsKey(v2Pid))
                {
                    await RecordShieldedDeleteAsync(
                        binding, runId, "Patient", uid.ToString(CultureInfo.InvariantCulture), v2Pid,
                        isDryRun, summary, diffBatch, ct);
                }
            }

            if (!isDryRun && writeBatch.BatchCommands.Count > 0)
            {
                await writeBatch.ExecuteNonQueryAsync(ct);
            }
            if (!isDryRun && ledgerUpdates.Count > 0)
            {
                await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "Patient", ledgerUpdates, ct);
            }
            if (diffBatch.Count > 0)
            {
                await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
            }
        }

        return (patientNames, activeCohortUserIds);
    }

    // -------------------------------------------------------------------------
    // Step 5: Sync Patient Sub-Profiles (Addresses, Guardians, Allergies, Histories, Immunizations, PhilHealth, Alerts)
    // -------------------------------------------------------------------------
    private async Task SyncPatientProfilesAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> patientNames,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null)
    {
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        bool ShouldRun(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        var hasUserVaccinationTable = ShouldRun("PatientImmunization") && await TableExistsAsync(v1, "UserVaccination", ct);
        var hasVaccineTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Vaccine", ct);
        var hasDoseTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Dose", ct);
        var hasRouteTable = hasUserVaccinationTable && await TableExistsAsync(v1, "Route", ct);
        var hasPatientImmunizationTable = ShouldRun("PatientImmunization") && !hasUserVaccinationTable && await TableExistsAsync(v1, "PatientImmunization", ct);
        var hasPhilHealthImmunLibTable = hasPatientImmunizationTable && await TableExistsAsync(v1, "PhilHealthImmunizationLibrary", ct);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            // 5a. PatientAddresses (natural unique (ClinicId, PatientId, AddressType) where !IsDeleted)
            if (ShouldRun("PatientAddress"))
            {
                var natKeyMap = new Dictionary<(Guid PatientId, string AddressType), Guid>();
                await using (var natCmd = new NpgsqlCommand("""
                    SELECT "Id", "PatientId", "AddressType"
                    FROM public."PatientAddresses"
                    WHERE "ClinicId" = @cid AND "PatientId" = ANY(@pids) AND "IsDeleted" = false
                    """, v2))
                {
                    natCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    natCmd.Parameters.AddWithValue("pids", v2Pids);
                    await using var nr = await natCmd.ExecuteReaderAsync(ct);
                    while (await nr.ReadAsync(ct))
                    {
                        natKeyMap[(nr.GetGuid(1), nr.GetString(2))] = nr.GetGuid(0);
                    }
                }

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT DISTINCT ON ("userId", "isPrimary")
                           id, "userId", "isPrimary", COALESCE(NULLIF(trim("addressLine"),''), NULLIF(trim(street),''), NULLIF(trim(address),''), 'N/A'),
                           barangay, city, COALESCE(NULLIF(trim(state),''), region), region, "zipCode", "createdAt", "updatedAt"
                    FROM public."UserAddress"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL AND "isActive" = true
                    ORDER BY "userId", "isPrimary", "updatedAt" DESC NULLS LAST, id DESC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var addrType = r.GetBoolean(2) ? "Permanent" : "Current";
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_addr:{uid}:{addrType}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        Guid? adoptedId = natKeyMap.TryGetValue((pid, addrType), out var existingNatId) ? existingNatId : null;

                        var street = SyncTransforms.CleanRequired(GetStr(r, 3), "N/A", 250);
                        var reg = SyncTransforms.Clean(GetStr(r, 7), 100);
                        var prov = SyncTransforms.Clean(GetStr(r, 6), 100);
                        var city = SyncTransforms.Clean(GetStr(r, 5), 100);
                        var brgy = SyncTransforms.Clean(GetStr(r, 4), 100);
                        var zip = SyncTransforms.Clean(GetStr(r, 8), 10);
                        var cat = GetUtc(r, 9) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 10) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["addressType"] = addrType,
                            ["regionName"] = reg,
                            ["provinceName"] = prov,
                            ["cityMunicipalityName"] = city,
                            ["barangayName"] = brgy,
                            ["zipCode"] = zip,
                            ["streetAddress"] = street
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientAddresses" (
                                    "Id","PatientId","AddressType","IsSameAsPermanent","RegionName","ProvinceName","CityMunicipalityName","BarangayName","ZipCode","StreetAddress",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@type,false,@reg,@prov,@city,@brgy,@zip,@street,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "AddressType"=EXCLUDED."AddressType","RegionName"=EXCLUDED."RegionName","ProvinceName"=EXCLUDED."ProvinceName",
                                    "CityMunicipalityName"=EXCLUDED."CityMunicipalityName","BarangayName"=EXCLUDED."BarangayName",
                                    "ZipCode"=EXCLUDED."ZipCode","StreetAddress"=EXCLUDED."StreetAddress","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("type", addrType);
                            c.Parameters.AddWithValue("reg", (object?)reg ?? DBNull.Value);
                            c.Parameters.AddWithValue("prov", (object?)prov ?? DBNull.Value);
                            c.Parameters.AddWithValue("city", (object?)city ?? DBNull.Value);
                            c.Parameters.AddWithValue("brgy", (object?)brgy ?? DBNull.Value);
                            c.Parameters.AddWithValue("zip", (object?)zip ?? DBNull.Value);
                            c.Parameters.AddWithValue("street", street);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAddress", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","AddressType","RegionName","ProvinceName","CityMunicipalityName","BarangayName","ZipCode","StreetAddress"
                        FROM public."PatientAddresses"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["addressType"] = GetStr(r, 1),
                            ["regionName"] = GetStr(r, 2),
                            ["provinceName"] = GetStr(r, 3),
                            ["cityMunicipalityName"] = GetStr(r, 4),
                            ["barangayName"] = GetStr(r, 5),
                            ["zipCode"] = GetStr(r, 6),
                            ["streetAddress"] = GetStr(r, 7)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5b. PatientGuardians (from UserEmergencyContact)
            if (ShouldRun("PatientGuardian"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "userId", "isPrimary", "firstName", "lastName", "middleName", suffix, name, relationship, phone, "createdAt", "updatedAt"
                    FROM public."UserEmergencyContact"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL AND "isActive" = true
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_ec:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var fullName = SyncTransforms.Clean(GetStr(r, 7));
                        var fn = SyncTransforms.Clean(GetStr(r, 3), 100);
                        var ln = SyncTransforms.Clean(GetStr(r, 4), 100);
                        if (fn is null && fullName is not null)
                        {
                            var parts = fullName.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                            fn = parts.Length > 0 ? SyncTransforms.Clean(parts[0], 100) : "Emergency";
                            ln ??= parts.Length > 1 ? SyncTransforms.Clean(parts[1], 100) : "Contact";
                        }
                        fn ??= "Emergency";
                        ln ??= "Contact";
                        var mn = SyncTransforms.Clean(GetStr(r, 5), 100);
                        var suf = SyncTransforms.Clean(GetStr(r, 6), 20);
                        var rel = SyncTransforms.CleanRequired(GetStr(r, 8), "Other", 100);
                        var relCode = rel.Length > 50 ? rel[..50] : rel;
                        var phone = SyncTransforms.CleanRequired(GetStr(r, 9), "N/A", 30);
                        var isPrimary = r.GetBoolean(2);
                        var cat = GetUtc(r, 10) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 11) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["firstName"] = fn,
                            ["lastName"] = ln,
                            ["contactNumber"] = phone,
                            ["relationshipCode"] = relCode
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientGuardians" (
                                    "Id","PatientId","LastName","FirstName","MiddleName","Suffix","ContactNumber",
                                    "RelationshipCode","RelationshipOtherSpecify","IsPrimaryGuardian","IsEmergencyContact",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@ln,@fn,@mn,@suf,@phone,
                                    @rel,@relOther,@prim,true,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "LastName"=EXCLUDED."LastName","FirstName"=EXCLUDED."FirstName","ContactNumber"=EXCLUDED."ContactNumber",
                                    "RelationshipCode"=EXCLUDED."RelationshipCode","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("ln", ln);
                            c.Parameters.AddWithValue("fn", fn);
                            c.Parameters.AddWithValue("mn", (object?)mn ?? DBNull.Value);
                            c.Parameters.AddWithValue("suf", (object?)suf ?? DBNull.Value);
                            c.Parameters.AddWithValue("phone", phone);
                            c.Parameters.AddWithValue("rel", relCode);
                            c.Parameters.AddWithValue("relOther", (object?)rel ?? DBNull.Value);
                            c.Parameters.AddWithValue("prim", isPrimary);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientGuardian", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","FirstName","LastName","ContactNumber","RelationshipCode"
                        FROM public."PatientGuardians"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["firstName"] = GetStr(r, 1),
                            ["lastName"] = GetStr(r, 2),
                            ["contactNumber"] = GetStr(r, 3),
                            ["relationshipCode"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5c. PatientAllergies
            if (ShouldRun("PatientAllergy"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT ua.id, ua."userId", COALESCE(a.name, 'Unspecified Allergen'), ua.reaction, ua.notes
                    FROM public."UserAllergy" ua
                    LEFT JOIN public."Allergen" a ON a.id = ua."allergenId"
                    WHERE ua."userId" = ANY(@ids)
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_allergy:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var allergen = SyncTransforms.CleanRequired(GetStr(r, 2), "Unspecified Allergen", 150);
                        var cat = SyncTransforms.MapAllergyCategory(allergen);
                        var react = SyncTransforms.Clean(GetStr(r, 3), 250);
                        var notes = SyncTransforms.Clean(GetStr(r, 4), 500);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["category"] = cat,
                            ["allergen"] = allergen,
                            ["reactionManifestation"] = react,
                            ["notes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientAllergies" (
                                    "Id","PatientId","Category","Allergen","Severity","ReactionManifestation","IsAnaphylactic","Status","Notes",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@cat,@allergen,'Moderate',@react,false,'Active',@notes,
                                    now(),@actor,now(),@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "Category"=EXCLUDED."Category","Allergen"=EXCLUDED."Allergen","ReactionManifestation"=EXCLUDED."ReactionManifestation",
                                    "Notes"=EXCLUDED."Notes","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("allergen", allergen);
                            c.Parameters.AddWithValue("react", (object?)react ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAllergy", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","Category","Allergen","ReactionManifestation","Notes"
                        FROM public."PatientAllergies"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["category"] = GetStr(r, 1),
                            ["allergen"] = GetStr(r, 2),
                            ["reactionManifestation"] = GetStr(r, 3),
                            ["notes"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5d. PatientMedicalHistories (UserHealthCondition -> ProblemListItem; MedicalHistory & UserDisability -> MedicalHistory)
            if (ShouldRun("PatientMedicalHistory"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT 'hc:' || uhc.id, uhc."userId", COALESCE(hc.name, 'Health Condition'), hc.code, uhc.severity::text, uhc.status, uhc."dateDiagnosed", uhc."dateResolved", uhc.notes
                    FROM public."UserHealthCondition" uhc
                    LEFT JOIN public."HealthCondition" hc ON hc.id = uhc."healthConditionId"
                    WHERE uhc."userId" = ANY(@ids)
                    UNION ALL
                    SELECT 'mh:' || mh.id, mh."userId", COALESCE(hc.name, 'Past Medical History'), hc.code, 'MODERATE', 'ACTIVE', mh."createdAt", NULL, mh.details
                    FROM public."MedicalHistory" mh
                    LEFT JOIN public."HealthCondition" hc ON hc.id = mh."conditionId"
                    WHERE mh."userId" = ANY(@ids)
                    UNION ALL
                    SELECT 'dis:' || ud.id, ud."userId", 'Disability: ' || COALESCE(d.name, 'Unspecified'), NULL, ud.severity::text, 'ACTIVE', ud."dateDiagnosed", NULL, COALESCE(ud.notes, ud.reason)
                    FROM public."UserDisability" ud
                    LEFT JOIN public."Disability" d ON d.id = ud."disabilityId"
                    WHERE ud."userId" = ANY(@ids)
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Key = r.GetString(0);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_mh:{v1Key}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var category = v1Key.StartsWith("hc:", StringComparison.Ordinal) ? "ProblemListItem" : "MedicalHistory";
                        var title = SyncTransforms.CleanRequired(GetStr(r, 2), "Medical Condition", 200);
                        var code = SyncTransforms.Clean(GetStr(r, 3), 30);
                        var isResolved = string.Equals(GetStr(r, 5), "RESOLVED", StringComparison.OrdinalIgnoreCase) || !r.IsDBNull(7);
                        var status = isResolved ? "Resolved" : "Active";
                        var sev = SyncTransforms.MapSeverity(GetStr(r, 4));
                        var onset = r.IsDBNull(6) ? null : SyncTransforms.ToSafeDateOnly(r.GetDateTime(6));
                        var res = r.IsDBNull(7) ? null : SyncTransforms.ToSafeDateOnly(r.GetDateTime(7));
                        var notes = SyncTransforms.Clean(GetStr(r, 8), 500);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["category"] = category,
                            ["conditionTitle"] = title,
                            ["philHealthMdiseaseCode"] = code,
                            ["status"] = status,
                            ["severity"] = sev,
                            ["clinicalNotes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Key, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientMedicalHistories" (
                                    "Id","PatientId","Category","VerificationStatus","ConditionTitle","PhilHealthMdiseaseCode",
                                    "Status","Severity","IsChronicNcd","OnsetDate","ResolvedDate","IsOnDialysis","ClinicalNotes",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@cat,'Confirmed',@title,@code,
                                    @status,@sev,false,@onset,@resolved,false,@notes,
                                    now(),@actor,now(),@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "Category"=EXCLUDED."Category","ConditionTitle"=EXCLUDED."ConditionTitle","Status"=EXCLUDED."Status","ClinicalNotes"=EXCLUDED."ClinicalNotes",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("cat", category);
                            c.Parameters.AddWithValue("title", title);
                            c.Parameters.AddWithValue("code", (object?)code ?? DBNull.Value);
                            c.Parameters.AddWithValue("status", status);
                            c.Parameters.AddWithValue("sev", sev);
                            c.Parameters.Add(new NpgsqlParameter("onset", NpgsqlDbType.Date) { Value = onset.HasValue ? onset.Value : DBNull.Value });
                            c.Parameters.Add(new NpgsqlParameter("resolved", NpgsqlDbType.Date) { Value = res.HasValue ? res.Value : DBNull.Value });
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientMedicalHistory", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","Category","ConditionTitle","PhilHealthMdiseaseCode","Status","Severity","ClinicalNotes"
                        FROM public."PatientMedicalHistories"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["category"] = GetStr(r, 1),
                            ["conditionTitle"] = GetStr(r, 2),
                            ["philHealthMdiseaseCode"] = GetStr(r, 3),
                            ["status"] = GetStr(r, 4),
                            ["severity"] = GetStr(r, 5),
                            ["clinicalNotes"] = GetStr(r, 6)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5e. PatientFamilyHistories (Relationship = 'Other', valid FamilyRelationship enum)
            if (ShouldRun("PatientFamilyHistory"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT fmh.id, fmh."userId", COALESCE(hc.name, 'Family Condition'), hc.code, fmh.details, fmh."createdAt", fmh."updatedAt"
                    FROM public."FamilyMedicalHistory" fmh
                    LEFT JOIN public."HealthCondition" hc ON hc.id = fmh."conditionId"
                    WHERE fmh."userId" = ANY(@ids) AND fmh."deletedAt" IS NULL
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_fmh:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var title = SyncTransforms.CleanRequired(GetStr(r, 2), "Family Condition", 200);
                        var code = SyncTransforms.Clean(GetStr(r, 3), 30);
                        var notes = SyncTransforms.Clean(GetStr(r, 4), 500);
                        var cat = GetUtc(r, 5) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 6) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["conditionTitle"] = title,
                            ["philHealthMdiseaseCode"] = code,
                            ["relationship"] = "Other",
                            ["clinicalNotes"] = notes
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientFamilyHistories" (
                                    "Id","PatientId","ConditionTitle","PhilHealthMdiseaseCode","Relationship","ClinicalNotes",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@title,@code,'Other',@notes,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "ConditionTitle"=EXCLUDED."ConditionTitle","Relationship"=EXCLUDED."Relationship","ClinicalNotes"=EXCLUDED."ClinicalNotes",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("title", title);
                            c.Parameters.AddWithValue("code", (object?)code ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientFamilyHistory", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","ConditionTitle","PhilHealthMdiseaseCode","Relationship","ClinicalNotes"
                        FROM public."PatientFamilyHistories"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["conditionTitle"] = GetStr(r, 1),
                            ["philHealthMdiseaseCode"] = GetStr(r, 2),
                            ["relationship"] = GetStr(r, 3),
                            ["clinicalNotes"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5f. PatientSocialHistories (1:1 unfiltered UNIQUE ("PatientId") -> latest PersonalHistory)
            if (ShouldRun("PatientSocialHistory"))
            {
                var natKeyMap = new Dictionary<Guid, Guid>();
                await using (var natCmd = new NpgsqlCommand("""
                    SELECT "Id", "PatientId"
                    FROM public."PatientSocialHistories"
                    WHERE "PatientId" = ANY(@pids)
                    """, v2))
                {
                    natCmd.Parameters.AddWithValue("pids", v2Pids);
                    await using var nr = await natCmd.ExecuteReaderAsync(ct);
                    while (await nr.ReadAsync(ct)) natKeyMap[nr.GetGuid(1)] = nr.GetGuid(0);
                }

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
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_social_user:{uid}");
                        Guid? adoptedId = natKeyMap.TryGetValue(pid, out var existingNatId) ? existingNatId : null;

                        var smoke = SyncTransforms.Clean(GetStr(r, 2), 50);
                        var alc = SyncTransforms.Clean(GetStr(r, 4), 50);
                        var drug = SyncTransforms.Clean(GetStr(r, 6), 50);
                        var sexAct = SyncTransforms.Clean(GetStr(r, 7), 50);
                        var isSmoke = SyncTransforms.IsActiveSmoker(smoke);
                        var packYears = SyncTransforms.SanitizeSmokingPackYears(GetDecNullable(r, 3));
                        var isAlc = SyncTransforms.IsActiveAlcoholDrinker(alc);
                        var bottles = r.IsDBNull(5) ? (int?)null : r.GetInt32(5);
                        var isDrug = SyncTransforms.IsYesStatus(drug);
                        var isSex = SyncTransforms.IsYesStatus(sexAct);
                        var cat = GetUtc(r, 8) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 9) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["isSmoker"] = isSmoke ? "true" : "false",
                            ["smokingStatus"] = smoke,
                            ["isAlcoholDrinker"] = isAlc ? "true" : "false",
                            ["alcoholStatus"] = alc,
                            ["usesIllicitDrugs"] = isDrug ? "true" : "false",
                            ["isSexuallyActive"] = isSex ? "true" : "false"
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientSocialHistories" (
                                    "Id","PatientId","IsSmoker","SmokingPackYears","SmokingStatus",
                                    "IsAlcoholDrinker","AlcoholBottlesPerDay","AlcoholStatus",
                                    "UsesIllicitDrugs","IsSexuallyActive","IsPhysicallyActive","UsesFluorideToothpaste",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@isSmoke,@packYears,@smokeStatus,
                                    @isAlc,@bottles,@alcStatus,
                                    @isDrug,@isSex,false,false,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "IsSmoker"=EXCLUDED."IsSmoker","SmokingPackYears"=EXCLUDED."SmokingPackYears","SmokingStatus"=EXCLUDED."SmokingStatus",
                                    "IsAlcoholDrinker"=EXCLUDED."IsAlcoholDrinker","AlcoholBottlesPerDay"=EXCLUDED."AlcoholBottlesPerDay","AlcoholStatus"=EXCLUDED."AlcoholStatus",
                                    "UsesIllicitDrugs"=EXCLUDED."UsesIllicitDrugs","IsSexuallyActive"=EXCLUDED."IsSexuallyActive",
                                    "IsDeleted"=false,"UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("isSmoke", isSmoke);
                            c.Parameters.AddWithValue("packYears", (object?)packYears ?? DBNull.Value);
                            c.Parameters.AddWithValue("smokeStatus", (object?)smoke ?? DBNull.Value);
                            c.Parameters.AddWithValue("isAlc", isAlc);
                            c.Parameters.AddWithValue("bottles", (object?)bottles ?? DBNull.Value);
                            c.Parameters.AddWithValue("alcStatus", (object?)alc ?? DBNull.Value);
                            c.Parameters.AddWithValue("isDrug", isDrug);
                            c.Parameters.AddWithValue("isSex", isSex);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientSocialHistory", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","IsSmoker","SmokingStatus","IsAlcoholDrinker","AlcoholStatus","UsesIllicitDrugs","IsSexuallyActive"
                        FROM public."PatientSocialHistories"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["isSmoker"] = r.GetBoolean(1) ? "true" : "false",
                            ["smokingStatus"] = GetStr(r, 2),
                            ["isAlcoholDrinker"] = r.GetBoolean(3) ? "true" : "false",
                            ["alcoholStatus"] = GetStr(r, 4),
                            ["usesIllicitDrugs"] = r.GetBoolean(5) ? "true" : "false",
                            ["isSexuallyActive"] = r.GetBoolean(6) ? "true" : "false"
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5g. PatientReproductiveHistories (1:1 unfiltered UNIQUE ("PatientId") -> latest ObGyneHistory)
            if (ShouldRun("PatientReproductiveHistory"))
            {
                var natKeyMap = new Dictionary<Guid, Guid>();
                await using (var natCmd = new NpgsqlCommand("""
                    SELECT "Id", "PatientId"
                    FROM public."PatientReproductiveHistories"
                    WHERE "PatientId" = ANY(@pids)
                    """, v2))
                {
                    natCmd.Parameters.AddWithValue("pids", v2Pids);
                    await using var nr = await natCmd.ExecuteReaderAsync(ct);
                    while (await nr.ReadAsync(ct)) natKeyMap[nr.GetGuid(1)] = nr.GetGuid(0);
                }

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT DISTINCT ON (og."userId") og.id, og."userId", og.menarche, og."lastMenstrualPeriod", og."menopauseAge",
                           og."menopauseStatus", og."ageAtFirstSexualIntercourse", og."birthControlMethod",
                           og."menstrualPeriodDuration", og."menstrualCycleInterval", og."numberOfPadsPerDay",
                           og.gravidity, og.parity, og."fullTerm", og.premature, og.abortion, og."livingChildren",
                           og."typeOfDelivery", og."hasPreEclampsia", og."isFamilyPlanning", og."createdAt", og."updatedAt"
                    FROM public."ObGyneHistory" og
                    WHERE og."userId" = ANY(@ids) AND og."deletedAt" IS NULL
                    ORDER BY og."userId", og."updatedAt" DESC NULLS LAST, og.id DESC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_repro_user:{uid}");
                        Guid? adoptedId = natKeyMap.TryGetValue(pid, out var existingNatId) ? existingNatId : null;

                        var menarche = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                        var lmp = r.IsDBNull(3) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(3);
                        var menoAge = r.IsDBNull(4) ? (int?)null : r.GetInt32(4);
                        var isMeno = SyncTransforms.IsYesStatus(GetStr(r, 5));
                        var coit = r.IsDBNull(6) ? (int?)null : r.GetInt32(6);
                        var contra = SyncTransforms.Clean(GetStr(r, 7), 100);
                        var dur = r.IsDBNull(8) ? (int?)null : r.GetInt32(8);
                        var cyc = r.IsDBNull(9) ? (int?)null : r.GetInt32(9);
                        var pads = r.IsDBNull(10) ? (int?)null : r.GetInt32(10);
                        var g = r.IsDBNull(11) ? 0 : r.GetInt32(11);
                        var p = r.IsDBNull(12) ? 0 : r.GetInt32(12);
                        var t = r.IsDBNull(13) ? 0 : r.GetInt32(13);
                        var pre = r.IsDBNull(14) ? 0 : r.GetInt32(14);
                        var a = r.IsDBNull(15) ? 0 : r.GetInt32(15);
                        var l = r.IsDBNull(16) ? 0 : r.GetInt32(16);
                        var delType = SyncTransforms.Clean(GetStr(r, 17), 50);
                        var preEc = !r.IsDBNull(18) && r.GetBoolean(18);
                        var fp = !r.IsDBNull(19) && r.GetBoolean(19);
                        var cat = GetUtc(r, 20) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 21) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["menarcheAge"] = menarche?.ToString(CultureInfo.InvariantCulture),
                            ["lastMenstrualPeriod"] = lmp?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["gravidity"] = g.ToString(CultureInfo.InvariantCulture),
                            ["parity"] = p.ToString(CultureInfo.InvariantCulture),
                            ["deliveryType"] = delType
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientReproductiveHistories" (
                                    "Id","PatientId","IsApplicable","MenarcheAge","LastMenstrualPeriod","MenopauseAge","IsMenopausal",
                                    "CoitarcheAge","ContraceptiveMethod","PeriodDurationDays","CycleIntervalDays","PadsPerDay",
                                    "IsCurrentlyPregnant","Gravidity","Parity","TermBirths","PretermBirths","Abortions","LivingChildren",
                                    "MiscarriagesCount","EctopicCount","StillbirthsCount","HadGestationalDiabetes","HadPostpartumHemorrhage",
                                    "DeliveryType","HadPreEclampsiaHypertension","ReceivedFamilyPlanningCounseling",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,true,@menarche,@lmp,@menoAge,@isMeno,
                                    @coit,@contra,@dur,@cyc,@pads,
                                    false,@g,@p,@t,@pre,@a,@l,
                                    0,0,0,false,false,
                                    @delType,@preEc,@fp,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "MenarcheAge"=EXCLUDED."MenarcheAge","LastMenstrualPeriod"=EXCLUDED."LastMenstrualPeriod",
                                    "Gravidity"=EXCLUDED."Gravidity","Parity"=EXCLUDED."Parity","DeliveryType"=EXCLUDED."DeliveryType",
                                    "IsDeleted"=false,"UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("menarche", (object?)menarche ?? DBNull.Value);
                            c.Parameters.Add(new NpgsqlParameter("lmp", NpgsqlDbType.Date) { Value = lmp.HasValue ? lmp.Value : DBNull.Value });
                            c.Parameters.AddWithValue("menoAge", (object?)menoAge ?? DBNull.Value);
                            c.Parameters.AddWithValue("isMeno", isMeno);
                            c.Parameters.AddWithValue("coit", (object?)coit ?? DBNull.Value);
                            c.Parameters.AddWithValue("contra", (object?)contra ?? DBNull.Value);
                            c.Parameters.AddWithValue("dur", (object?)dur ?? DBNull.Value);
                            c.Parameters.AddWithValue("cyc", (object?)cyc ?? DBNull.Value);
                            c.Parameters.AddWithValue("pads", (object?)pads ?? DBNull.Value);
                            c.Parameters.AddWithValue("g", g);
                            c.Parameters.AddWithValue("p", p);
                            c.Parameters.AddWithValue("t", t);
                            c.Parameters.AddWithValue("pre", pre);
                            c.Parameters.AddWithValue("a", a);
                            c.Parameters.AddWithValue("l", l);
                            c.Parameters.AddWithValue("delType", (object?)delType ?? DBNull.Value);
                            c.Parameters.AddWithValue("preEc", preEc);
                            c.Parameters.AddWithValue("fp", fp);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientReproductiveHistory", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","MenarcheAge","LastMenstrualPeriod","Gravidity","Parity","DeliveryType"
                        FROM public."PatientReproductiveHistories"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["menarcheAge"] = r.IsDBNull(1) ? null : r.GetInt32(1).ToString(CultureInfo.InvariantCulture),
                            ["lastMenstrualPeriod"] = r.IsDBNull(2) ? null : r.GetFieldValue<DateOnly>(2).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["gravidity"] = r.IsDBNull(3) ? "0" : r.GetInt32(3).ToString(CultureInfo.InvariantCulture),
                            ["parity"] = r.IsDBNull(4) ? "0" : r.GetInt32(4).ToString(CultureInfo.InvariantCulture),
                            ["deliveryType"] = GetStr(r, 5)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5h. PatientSurgicalHistories
            if (ShouldRun("PatientSurgicalHistory"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT id, "userId", "operationName", "operationDate", notes, "createdAt", "updatedAt"
                    FROM public."SurgicalHistory"
                    WHERE "userId" = ANY(@ids) AND "deletedAt" IS NULL
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_surg:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var proc = SyncTransforms.CleanRequired(GetStr(r, 2), "Surgical Procedure", 200);
                        var sdate = r.IsDBNull(3) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(3);
                        var rem = SyncTransforms.Clean(GetStr(r, 4), 500);
                        var cat = GetUtc(r, 5) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 6) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["procedureName"] = proc,
                            ["surgeryDate"] = sdate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["remarks"] = rem
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientSurgicalHistories" (
                                    "Id","PatientId","ProcedureName","SurgeryDate","Remarks",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@proc,@sdate,@rem,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "ProcedureName"=EXCLUDED."ProcedureName","SurgeryDate"=EXCLUDED."SurgeryDate","Remarks"=EXCLUDED."Remarks",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("proc", proc);
                            c.Parameters.Add(new NpgsqlParameter("sdate", NpgsqlDbType.Date) { Value = sdate.HasValue ? sdate.Value : DBNull.Value });
                            c.Parameters.AddWithValue("rem", (object?)rem ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientSurgicalHistory", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","ProcedureName","SurgeryDate","Remarks"
                        FROM public."PatientSurgicalHistories"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["procedureName"] = GetStr(r, 1),
                            ["surgeryDate"] = r.IsDBNull(2) ? null : r.GetFieldValue<DateOnly>(2).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["remarks"] = GetStr(r, 3)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5i. PatientImmunizations (VaccineName clamped to 150; supports legacy UserVaccination and modern PatientImmunization)
            if (ShouldRun("PatientImmunization") && (hasUserVaccinationTable || hasPatientImmunizationTable))
            {
                var candidates = new List<ChildSyncCandidate>();
                var immSql = hasUserVaccinationTable
                    ? $"""
                        SELECT uv.id, uv."userId",
                               {(hasVaccineTable ? "COALESCE(v.name, 'Vaccine')" : "'Vaccine'::text")},
                               {(hasDoseTable ? "d.dose" : "NULL::text")},
                               {(hasRouteTable ? "rt.route" : "NULL::text")},
                               uv."dateGiven", uv."administeredBy", uv.notes, uv."createdAt", uv."updatedAt"
                        FROM public."UserVaccination" uv
                        {(hasVaccineTable ? "LEFT JOIN public.\"Vaccine\" v ON v.id = uv.\"vaccineId\"" : string.Empty)}
                        {(hasDoseTable ? "LEFT JOIN public.\"Dose\" d ON d.id = uv.\"doseId\"" : string.Empty)}
                        {(hasRouteTable ? "LEFT JOIN public.\"Route\" rt ON rt.id = uv.\"routeId\"" : string.Empty)}
                        WHERE uv."userId" = ANY(@ids) AND uv."deletedAt" IS NULL AND uv."isActive" = true
                        """
                    : $"""
                        SELECT pi.id, pi."userId",
                               COALESCE(NULLIF(trim(pi."vaccineName"), ''), {(hasPhilHealthImmunLibTable ? "NULLIF(trim(lib.name), ''), " : string.Empty)}'Vaccine'),
                               COALESCE(NULLIF(trim(pi."doseNumber"), ''), {(hasPhilHealthImmunLibTable ? "NULLIF(trim(lib.\"defaultDoseLabel\"), ''), " : string.Empty)}NULL::text),
                               COALESCE(NULLIF(trim(pi.route), ''), {(hasPhilHealthImmunLibTable ? "NULLIF(trim(lib.\"defaultRoute\"), ''), " : string.Empty)}NULL::text),
                               pi."dateGiven", pi."administeredBy", pi.notes, pi."createdAt", pi."updatedAt"
                        FROM public."PatientImmunization" pi
                        {(hasPhilHealthImmunLibTable ? "LEFT JOIN public.\"PhilHealthImmunizationLibrary\" lib ON lib.id = pi.\"immunizationLibId\"" : string.Empty)}
                        WHERE pi."userId" = ANY(@ids) AND pi."deletedAt" IS NULL AND pi."isActive" = true
                        """;
                await using (var cmd = new NpgsqlCommand(immSql, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_imm:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var vname = SyncTransforms.CleanRequired(GetStr(r, 2), "Vaccine", 150);
                        var pname = patientNames.TryGetValue(uid, out var n) ? n : "Patient";
                        var route = SyncTransforms.Clean(GetStr(r, 4), 50);
                        var adminAt = GetUtc(r, 5) ?? GetUtc(r, 8) ?? DateTimeOffset.UtcNow;
                        var adminBy = SyncTransforms.Clean(GetStr(r, 6), 150);
                        var remJoined = string.Join(" | ", new[] { SyncTransforms.Clean(GetStr(r, 3)), SyncTransforms.Clean(GetStr(r, 7)) }.Where(x => x is not null));
                        var rem = string.IsNullOrEmpty(remJoined) ? null : (remJoined.Length > 500 ? remJoined[..500] : remJoined);
                        var cat = GetUtc(r, 8) ?? adminAt;
                        var uat = GetUtc(r, 9) ?? adminAt;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["vaccineName"] = vname,
                            ["administeredAtUtc"] = adminAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                            ["remarks"] = rem
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientImmunizations" (
                                    "Id","PatientId","PatientName","VaccineName","DoseSequence","IsSeriesCompleted",
                                    "Route","AdministeredAtUtc","AdministeredByStaffName","HasAdverseReaction","AdverseReactionSeverity",
                                    "IsHistorical","Remarks","IsSynchronizedToPatientApp",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@pname,@vname,1,false,
                                    @route,@adminAt,@adminBy,false,'None',
                                    true,@rem,false,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "VaccineName"=EXCLUDED."VaccineName","AdministeredAtUtc"=EXCLUDED."AdministeredAtUtc",
                                    "Remarks"=EXCLUDED."Remarks","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("pname", pname);
                            c.Parameters.AddWithValue("vname", vname);
                            c.Parameters.AddWithValue("route", (object?)route ?? DBNull.Value);
                            c.Parameters.AddWithValue("adminAt", adminAt);
                            c.Parameters.AddWithValue("adminBy", (object?)adminBy ?? DBNull.Value);
                            c.Parameters.AddWithValue("rem", (object?)rem ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientImmunization", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","VaccineName","AdministeredAtUtc","Remarks"
                        FROM public."PatientImmunizations"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["vaccineName"] = GetStr(r, 1),
                            ["administeredAtUtc"] = (GetUtc(r, 2) ?? DateTimeOffset.MinValue).UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                            ["remarks"] = GetStr(r, 3)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5j. PatientPhilHealthMemberships (1:1 unfiltered UNIQUE ("PatientId"), MemberType 'MM'/'DD', MemberPin/PrincipalMemberPin MaxLength(20))
            if (ShouldRun("PatientPhilHealthMembership"))
            {
                var natKeyMap = new Dictionary<Guid, Guid>();
                await using (var natCmd = new NpgsqlCommand("""
                    SELECT "Id", "PatientId"
                    FROM public."PatientPhilHealthMemberships"
                    WHERE "PatientId" = ANY(@pids)
                    """, v2))
                {
                    natCmd.Parameters.AddWithValue("pids", v2Pids);
                    await using var nr = await natCmd.ExecuteReaderAsync(ct);
                    while (await nr.ReadAsync(ct)) natKeyMap[nr.GetGuid(1)] = nr.GetGuid(0);
                }

                var hasDepRel = await ColumnExistsAsync(v1, "PhilHealthDependent", "relationship", ct);
                var depRelJoin = hasDepRel
                    ? """
                      LEFT JOIN LATERAL (
                          SELECT pd.relationship
                          FROM public."PhilHealthDependent" pd
                          WHERE pd."philHealthRecordId" = pr.id AND pd."deletedAt" IS NULL
                          ORDER BY pd.id ASC LIMIT 1
                      ) pdep ON true
                      """
                    : "LEFT JOIN LATERAL (SELECT NULL::text AS relationship) pdep ON true";

                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand($"""
                    SELECT DISTINCT ON (pr."userId") pr.id, pr."userId", pr.pin, pr."memberType", pr."principalMemberPin",
                           pdep.relationship, pr."createdAt", pr."updatedAt"
                    FROM public."PhilHealthRecord" pr
                    {depRelJoin}
                    WHERE pr."userId" = ANY(@ids) AND pr."deletedAt" IS NULL AND pr."isActive" = true
                    ORDER BY pr."userId", pr."updatedAt" DESC NULLS LAST, pr.id DESC
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_ph_user:{uid}");
                        Guid? adoptedId = natKeyMap.TryGetValue(pid, out var existingNatId) ? existingNatId : null;

                        var pin = SyncTransforms.CleanRequired(GetStr(r, 2), "", 20);
                        if (string.IsNullOrEmpty(pin)) continue;
                        var mType = SyncTransforms.MapClinicPhilHealthMemberType(GetStr(r, 3));
                        var ppin = SyncTransforms.Clean(GetStr(r, 4), 20);
                        var depRel = string.Equals(mType, "DD", StringComparison.Ordinal)
                            ? SyncTransforms.MapPhilHealthDependentRelationship(GetStr(r, 5))
                            : null;
                        var cat = GetUtc(r, 6) ?? DateTimeOffset.UtcNow;
                        var uat = GetUtc(r, 7) ?? cat;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["memberType"] = mType,
                            ["dependentRelationship"] = depRel,
                            ["memberPin"] = pin,
                            ["principalMemberPin"] = ppin
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, adoptedId, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientPhilHealthMemberships" (
                                    "Id","PatientId","MemberType","DependentRelationship","MemberPin","PrincipalMemberPin",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@mtype,@depRel,@pin,@ppin,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "MemberType"=EXCLUDED."MemberType","DependentRelationship"=EXCLUDED."DependentRelationship",
                                    "MemberPin"=EXCLUDED."MemberPin","PrincipalMemberPin"=EXCLUDED."PrincipalMemberPin",
                                    "IsDeleted"=false,"UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("mtype", mType);
                            c.Parameters.AddWithValue("depRel", (object?)depRel ?? DBNull.Value);
                            c.Parameters.AddWithValue("pin", pin);
                            c.Parameters.AddWithValue("ppin", (object?)ppin ?? DBNull.Value);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("uat", uat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientPhilHealthMembership", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","MemberType","DependentRelationship","MemberPin","PrincipalMemberPin"
                        FROM public."PatientPhilHealthMemberships"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["memberType"] = GetStr(r, 1),
                            ["dependentRelationship"] = GetStr(r, 2),
                            ["memberPin"] = GetStr(r, 3),
                            ["principalMemberPin"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }

            // 5k. PatientAlerts (from PatientInsight for this clinic)
            if (ShouldRun("PatientAlert"))
            {
                var candidates = new List<ChildSyncCandidate>();
                await using (var cmd = new NpgsqlCommand("""
                    SELECT pi.id, pi."patientId", pi.content, pi."validUntil", pi."createdAt"
                    FROM public."PatientInsight" pi
                    WHERE pi."patientId" = ANY(@ids) AND pi."clinicId" = @clinicFilter
                    """, v1))
                {
                    cmd.Parameters.AddWithValue("ids", ids);
                    cmd.Parameters.AddWithValue("clinicFilter", binding.V1ClinicId!.Value);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var v1Id = r.GetInt32(0).ToString(CultureInfo.InvariantCulture);
                        var uid = r.GetInt32(1);
                        var detId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_insight:{v1Id}");
                        var pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var content = SyncTransforms.CleanRequired(GetStr(r, 2), "Legacy Patient Insight", 1000);
                        var exp = GetUtc(r, 3);
                        var cat = GetUtc(r, 4) ?? DateTimeOffset.UtcNow;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["notes"] = content,
                            ["expiresAt"] = exp?.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)
                        };

                        candidates.Add(new ChildSyncCandidate(v1Id, detId, null, canonical, targetId =>
                        {
                            var c = new NpgsqlBatchCommand("""
                                INSERT INTO public."PatientAlerts" (
                                    "Id","PatientId","Category","Title","Severity","Status","ExpiresAt","Notes",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,'Other','Legacy Clinical Insight','Info','Active',@exp,@notes,
                                    @cat,@actor,@cat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "Notes"=EXCLUDED."Notes","ExpiresAt"=EXCLUDED."ExpiresAt","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            c.Parameters.AddWithValue("id", targetId);
                            c.Parameters.AddWithValue("pid", pid);
                            c.Parameters.AddWithValue("exp", (object?)exp ?? DBNull.Value);
                            c.Parameters.AddWithValue("notes", content);
                            c.Parameters.AddWithValue("cat", cat);
                            c.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            c.Parameters.AddWithValue("tid", v2TenantId);
                            c.Parameters.AddWithValue("cid", v2ClinicId);
                            return c;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "PatientAlert", v2Pids, candidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","Notes","ExpiresAt"
                        FROM public."PatientAlerts"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["notes"] = GetStr(r, 1),
                            ["expiresAt"] = GetUtc(r, 2)?.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Step 6: Visit Spine (Appointments -> Historical QueueItems -> Consultations -> PatientVitals)
    // -------------------------------------------------------------------------
    private async Task<(Dictionary<int, Guid> ApptToQueue, Dictionary<int, Guid> ConsultToQueue)> SyncVisitSpineAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> patientNames,
        Dictionary<int, string> systems,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        var apptToQueue = new Dictionary<int, Guid>();
        var consultToQueue = new Dictionary<int, Guid>();

        bool RunSection(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        var queueCounter = summary.For("QueueItem");

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            // 6a. Appointments + Historical QueueItems (IsDirectVisit=true, carrying ChiefComplaint!)
            const string apptSql = """
                SELECT a.id, ar."userId", a.subject, a.complaint, a."createdAt", a."updatedAt", a."caseNumber",
                       aa.date, aa."timeStart", aa."maxDuration", aa.status, aa."systemId", aa."isWalkIn",
                       aa."completedAt", aa."receivedAt", aa."meetingUrl",
                       EXISTS (SELECT 1 FROM public."ConsultationTicket" t WHERE t."appointmentId" = a.id AND t."isActive" = true) AS has_consult,
                       am.name AS mode_name,
                       atp.name AS type_name,
                       svc.name AS service_name,
                       aa."aiSymptomAnalysis", aa."rejectedReason", aa."rescheduledReason", aa."dropReason",
                       COALESCE(
                           aa."preferredAppointee",
                           (SELECT ar2."routedTo" FROM public."AppointmentRouting" ar2
                            WHERE ar2."appointmentId" = a.id AND ar2.status = 'ACCEPTED' AND ar2."routedTo" IS NOT NULL
                            ORDER BY ar2.id DESC LIMIT 1),
                           (SELECT at2."healthcareProviderId" FROM public."AppointmentTag" at2
                            WHERE at2."appointmentId" = a.id AND at2."healthcareProviderId" IS NOT NULL
                            ORDER BY at2.id DESC LIMIT 1)
                       ) AS resolved_hp_id,
                       (SELECT string_agg(concat_ws(' / ', NULLIF(trim(ar3.amendment), ''), NULLIF(trim(ar3."returnReason"), '')), ' | ' ORDER BY ar3.id ASC)
                        FROM public."AppointmentRouting" ar3
                        WHERE ar3."appointmentId" = a.id
                          AND (NULLIF(trim(ar3.amendment), '') IS NOT NULL OR NULLIF(trim(ar3."returnReason"), '') IS NOT NULL)) AS routing_notes
                FROM public."Appointment" a
                JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
                LEFT JOIN public."AppointmentAttribute" aa ON aa."appointmentId" = a.id
                LEFT JOIN public."AppointmentMode" am ON am.id = aa."modeId"
                LEFT JOIN public."AppointmentType" atp ON atp.id = aa."typeId"
                LEFT JOIN public."Service" svc ON svc.id = aa."serviceId"
                WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL AND ar."userId" = ANY(@ids)
                ORDER BY a.id ASC
                """;

            var queueLedger = new List<(string, Guid, string, string)>();
            var apptMeta = new Dictionary<int, (int UserId, DateTimeOffset ScheduledAt, string? Complaint, string? RosCat, bool IsWalkIn)>();
            var apptCandidates = new List<ChildSyncCandidate>();
            var pendingApptQueues = new List<(int ApptId, Guid QueueId, DateOnly QueueDate, Guid PatientId, string PatientName, Guid ApptV2Id, string Status, DateTimeOffset CheckIn, DateTimeOffset Completed, string? ChiefComplaint, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)>();
            var queueBatch = new NpgsqlBatch(v2);
            var apptActiveForShield = new HashSet<string>(StringComparer.Ordinal);

            await using (var cmd = new NpgsqlCommand(apptSql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        var apptId = r.GetInt32(0);
                        var v1IdStr = apptId.ToString(CultureInfo.InvariantCulture);
                        apptActiveForShield.Add(v1IdStr);
                        var uid = r.GetInt32(1);
                        var v2ApptId = DeterministicUuid.SharedAppointmentId(v2ClinicId, apptId);
                        var v2QueueId = DeterministicUuid.SharedQueueItemForAppointmentId(v2ClinicId, apptId);
                        var v2PatientId = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                        var pname = patientNames.TryGetValue(uid, out var n) ? n : "Patient";

                        var subject = SyncTransforms.Clean(GetStr(r, 2), 250);
                        var complaintFull = SyncTransforms.Clean(GetStr(r, 3), 2000);
                        var complaint = SyncTransforms.Clean(complaintFull, 250);
                        var createdAt = GetUtc(r, 4) ?? DateTimeOffset.UtcNow;
                        var updatedAt = GetUtc(r, 5) ?? createdAt;
                        var caseNumber = SyncTransforms.Clean(GetStr(r, 6));
                        DateOnly? apptDate = r.IsDBNull(7) ? null : r.GetFieldValue<DateOnly>(7);
                        var timeStart = GetStr(r, 8);
                        var duration = r.IsDBNull(9) ? 15 : Math.Clamp(r.GetInt32(9), 5, 240);
                        var v1Status = GetStr(r, 10);
                        var sysId = r.IsDBNull(11) ? (int?)null : r.GetInt32(11);
                        var isWalkIn = !r.IsDBNull(12) && r.GetBoolean(12);
                        var completedAt = GetUtc(r, 13);
                        var receivedAt = GetUtc(r, 14);
                        var meetingUrl = SyncTransforms.Clean(GetStr(r, 15));
                        var hasConsult = r.GetBoolean(16);
                        var modeName = SyncTransforms.Clean(GetStr(r, 17));
                        var typeName = SyncTransforms.Clean(GetStr(r, 18));
                        var serviceName = SyncTransforms.Clean(GetStr(r, 19), 255);
                        var aiSymptom = SyncTransforms.Clean(GetStr(r, 20));
                        var rejectedReason = SyncTransforms.Clean(GetStr(r, 21));
                        var rescheduledReason = SyncTransforms.Clean(GetStr(r, 22));
                        var dropReason = SyncTransforms.Clean(GetStr(r, 23));
                        var resolvedHpId = r.IsDBNull(24) ? (int?)null : r.GetInt32(24);
                        var routingNotes = SyncTransforms.Clean(GetStr(r, 25));

                        var noteParts = new List<string>();
                        if (caseNumber is not null) noteParts.Add($"Legacy Case #: {caseNumber}");
                        if (typeName is not null) noteParts.Add($"Type: {typeName}");
                        if (complaintFull is not null && complaintFull.Length > 250) noteParts.Add(complaintFull);
                        if (aiSymptom is not null) noteParts.Add($"AI Symptom Analysis: {aiSymptom}");
                        if (rejectedReason is not null) noteParts.Add($"Rejected/Cancelled Reason: {rejectedReason}");
                        if (rescheduledReason is not null) noteParts.Add($"Rescheduled Reason: {rescheduledReason}");
                        if (dropReason is not null) noteParts.Add($"Drop Reason: {dropReason}");
                        if (routingNotes is not null) noteParts.Add($"Routing Notes: {routingNotes}");
                        var apptNotes = noteParts.Count > 0 ? string.Join("\n", noteParts) : null;

                        var scheduledAt = CombineManilaDateTime(apptDate, timeStart, createdAt);
                        var queueDate = apptDate ?? DateOnly.FromDateTime(scheduledAt.ToOffset(ManilaOffset).DateTime);
                        var rosCat = sysId.HasValue && systems.TryGetValue(sysId.Value, out var sName)
                            ? SyncTransforms.MapRosCategory(sName) : null;

                        var v2Status = SyncTransforms.MapClinicAppointmentStatus(v1Status);
                        var serviceType = serviceName ?? subject;
                        var reason = complaint ?? subject;
                        var apptType = SyncTransforms.MapClinicAppointmentType(modeName, meetingUrl);

                        Guid? doctorId = resolvedHpId.HasValue
                            ? DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"v1_hp:{resolvedHpId.Value}")
                            : null;
                        string? doctorName = resolvedHpId.HasValue
                            ? (clinicians.TryGetValue(resolvedHpId.Value, out var docSnap) ? docSnap.Name : "Clinic Physician")
                            : null;

                        apptToQueue[apptId] = v2QueueId;
                        apptMeta[apptId] = (uid, scheduledAt, complaint, rosCat, isWalkIn);

                        if (!RunSection("Appointment")) continue;

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["scheduledAt"] = scheduledAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                            ["status"] = v2Status,
                            ["serviceType"] = serviceType,
                            ["reason"] = reason,
                            ["notes"] = apptNotes,
                            ["appointmentType"] = apptType,
                            ["doctorId"] = doctorId?.ToString("D"),
                            ["doctorName"] = doctorName
                        };

                        apptCandidates.Add(new ChildSyncCandidate(v1IdStr, v2ApptId, null, canonical, targetId =>
                        {
                            var aCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public."Appointments" (
                                    "Id","PatientId","PatientName","DoctorId","DoctorName","ScheduledAt","DurationMinutes","EndTimeUtc",
                                    "Status","VisitWorkflowMode","ServiceType","Reason","Notes",
                                    "ShareFieldsJson","AttachedFileIdsJson","SharedScopes","SharedItemsJson",
                                    "Reminder24hSent","Reminder2hSent","AppointmentType","PaymentPolicy","PaymentStatus",
                                    "IsEmergencyOverride","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@pname,@did,@dname,@sched,@dur,@endUtc,
                                    @status,'Regular',@svc,@reason,@notes,
                                    '[]','[]','None','[]',
                                    false,false,@atype,'Exempt','Exempt',
                                    false,@cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "DoctorId"=EXCLUDED."DoctorId","DoctorName"=EXCLUDED."DoctorName",
                                    "ScheduledAt"=EXCLUDED."ScheduledAt","Status"=EXCLUDED."Status",
                                    "ServiceType"=EXCLUDED."ServiceType","AppointmentType"=EXCLUDED."AppointmentType",
                                    "PaymentPolicy"='Exempt',"PaymentStatus"='Exempt',
                                    "Reason"=EXCLUDED."Reason","Notes"=EXCLUDED."Notes","UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            aCmd.Parameters.AddWithValue("id", targetId);
                            aCmd.Parameters.AddWithValue("pid", v2PatientId);
                            aCmd.Parameters.AddWithValue("pname", pname);
                            aCmd.Parameters.AddWithValue("did", (object?)doctorId ?? DBNull.Value);
                            aCmd.Parameters.AddWithValue("dname", (object?)doctorName ?? DBNull.Value);
                            aCmd.Parameters.AddWithValue("sched", scheduledAt);
                            aCmd.Parameters.AddWithValue("dur", duration);
                            aCmd.Parameters.AddWithValue("endUtc", scheduledAt.AddMinutes(duration));
                            aCmd.Parameters.AddWithValue("status", v2Status);
                            aCmd.Parameters.AddWithValue("svc", (object?)serviceType ?? DBNull.Value);
                            aCmd.Parameters.AddWithValue("reason", (object?)reason ?? DBNull.Value);
                            aCmd.Parameters.AddWithValue("notes", (object?)apptNotes ?? DBNull.Value);
                            aCmd.Parameters.AddWithValue("atype", apptType);
                            aCmd.Parameters.AddWithValue("cat", createdAt);
                            aCmd.Parameters.AddWithValue("uat", updatedAt);
                            aCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            aCmd.Parameters.AddWithValue("tid", v2TenantId);
                            aCmd.Parameters.AddWithValue("cid", v2ClinicId);
                            return aCmd;
                        }));

                        if (!isDryRun && (targetV1IdFilter is null || string.Equals(targetV1IdFilter, v1IdStr, StringComparison.Ordinal)))
                        {
                            pendingApptQueues.Add((
                                apptId,
                                v2QueueId,
                                queueDate,
                                v2PatientId,
                                pname,
                                v2ApptId,
                                SyncTransforms.MapHistoricalQueueStatus(v1Status, hasConsult),
                                receivedAt ?? scheduledAt,
                                completedAt ?? scheduledAt,
                                SyncTransforms.Clean(complaint ?? subject, 255),
                                createdAt,
                                updatedAt));
                        }
                    }
                }
            }

            if (RunSection("Appointment") && !isDryRun && pendingApptQueues.Count > 0)
            {
                var existingApptQueues = new Dictionary<Guid, (string? ChiefComplaint, string Status, DateTimeOffset? CompletedTime, bool IsDeleted)>();
                await using (var qExistingCmd = new NpgsqlCommand("""
                    SELECT "Id", "ChiefComplaint", "Status", "CompletedTime", "IsDeleted"
                    FROM public."QueueItems"
                    WHERE "Id" = ANY(@qids)
                    """, v2))
                {
                    qExistingCmd.Parameters.AddWithValue("qids", pendingApptQueues.Select(x => x.QueueId).Distinct().ToArray());
                    await using var qr = await qExistingCmd.ExecuteReaderAsync(ct);
                    while (await qr.ReadAsync(ct))
                    {
                        existingApptQueues[qr.GetGuid(0)] = (GetStr(qr, 1), qr.GetString(2), GetUtc(qr, 3), qr.GetBoolean(4));
                    }
                }

                foreach (var q in pendingApptQueues)
                {
                    var isExisting = existingApptQueues.TryGetValue(q.QueueId, out var eq);
                    if (isExisting &&
                        !eq.IsDeleted &&
                        string.Equals(eq.ChiefComplaint, q.ChiefComplaint, StringComparison.Ordinal) &&
                        string.Equals(eq.Status, q.Status, StringComparison.Ordinal) &&
                        eq.CompletedTime.HasValue &&
                        Math.Abs((eq.CompletedTime.Value.UtcDateTime - q.Completed.UtcDateTime).TotalMilliseconds) < 1.0)
                    {
                        queueCounter.Unchanged++;
                        continue;
                    }

                    var qCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."QueueItems" (
                            "Id","QueueNumber","SequenceNumber","QueueDate","PatientId","PatientName",
                            "AppointmentId","Priority","Status","VisitWorkflowMode","CheckInTime","CompletedTime",
                            "ChiefComplaint","VisitType","IsDirectVisit",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @qid,@qnum,@seq,@qdate,@pid,@pname,
                            @aid,'Routine',@qstat,'Regular',@chk,@comp,
                            @cc,'Consultation',true,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "ChiefComplaint"=EXCLUDED."ChiefComplaint","Status"=EXCLUDED."Status",
                            "CompletedTime"=EXCLUDED."CompletedTime","IsDeleted"=false,"UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    qCmd.Parameters.AddWithValue("qid", q.QueueId);
                    qCmd.Parameters.AddWithValue("qnum", SyncTransforms.CleanRequired($"V1-{q.ApptId}", "V1-0", 20));
                    qCmd.Parameters.AddWithValue("seq", q.ApptId);
                    qCmd.Parameters.Add(new NpgsqlParameter("qdate", NpgsqlDbType.Date) { Value = q.QueueDate });
                    qCmd.Parameters.AddWithValue("pid", q.PatientId);
                    qCmd.Parameters.AddWithValue("pname", q.PatientName);
                    qCmd.Parameters.AddWithValue("aid", q.ApptV2Id);
                    qCmd.Parameters.AddWithValue("qstat", q.Status);
                    qCmd.Parameters.AddWithValue("chk", q.CheckIn);
                    qCmd.Parameters.AddWithValue("comp", q.Completed);
                    qCmd.Parameters.AddWithValue("cc", (object?)q.ChiefComplaint ?? DBNull.Value);
                    qCmd.Parameters.AddWithValue("cat", q.CreatedAt);
                    qCmd.Parameters.AddWithValue("uat", q.UpdatedAt);
                    qCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    qCmd.Parameters.AddWithValue("tid", v2TenantId);
                    qCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    queueBatch.BatchCommands.Add(qCmd);

                    if (isExisting) queueCounter.Updated++;
                    else queueCounter.Created++;
                    queueLedger.Add(($"appt:{q.ApptId}", q.QueueId, "queue", "queue"));
                }
            }

            if (RunSection("Appointment"))
            {
                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "Appointment", v2Pids, apptCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","ScheduledAt","Status","ServiceType","Reason","Notes","AppointmentType","DoctorId","DoctorName"
                        FROM public."Appointments"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["scheduledAt"] = (GetUtc(r, 1) ?? DateTimeOffset.MinValue).UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                            ["status"] = GetStr(r, 2),
                            ["serviceType"] = GetStr(r, 3),
                            ["reason"] = GetStr(r, 4),
                            ["notes"] = GetStr(r, 5),
                            ["appointmentType"] = GetStr(r, 6),
                            ["doctorId"] = r.IsDBNull(7) ? null : r.GetGuid(7).ToString("D"),
                            ["doctorName"] = GetStr(r, 8)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, apptActiveForShield);

                if (!isDryRun && queueBatch.BatchCommands.Count > 0)
                {
                    await queueBatch.ExecuteNonQueryAsync(ct);
                    await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "QueueItem", queueLedger, ct);
                }
            }

            // 6b. Consultations (with SOAP from ConsultationNote, RosCategory from System, IsWalkedIn, PhilHealth metadata, DB-backed QueueItemId safety)
            const string consultSql = """
                SELECT t.id, COALESCE(cp."patientId", ar."userId") AS resolved_uid, t."appointmentId", t."systemId", t.subject,
                       t."createdAt", t."updatedAt", t."caseNumber",
                       t."konsultaAtc", t."konsultaAtcCode", t."konsultaHciCaseNo", t."soapTransNo",
                       t."konsultaIsWalkedIn", t."isPhilHealthKonsulta",
                       cta.status AS ticket_status,
                       (SELECT thp."hpId" FROM public."ConsultationTicketHP" thp WHERE thp."consultationTicketId" = t.id ORDER BY thp.id ASC LIMIT 1) AS hp_id,
                       (SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('subjective','s','chief_complaint','history')) AS subj,
                       (SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('objective','o','physical_exam','pe')) AS obj,
                       (SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('assessment','a','diagnosis','impression')) AS assess,
                       (SELECT string_agg(cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) IN ('plan','p','management','treatment','notes')) AS plan_txt,
                       (SELECT string_agg(cn.section || ': ' || cn.content, E'\n\n' ORDER BY cn.id) FROM public."ConsultationNote" cn WHERE cn."consultationTicketId" = t.id AND lower(cn.section) NOT IN ('subjective','s','chief_complaint','history','objective','o','physical_exam','pe','assessment','a','diagnosis','impression','plan','p','management','treatment','notes')) AS other_notes,
                       t."konsultaCoPay", t."konsultaAdvice"::text, t."konsultaRecommendedDiagnosticOptions"::text, t."ekasAuthorizationCode",
                       (SELECT string_agg(kmc.code, ',' ORDER BY kmc."sortOrder" ASC, cm.id ASC)
                        FROM public."ConsultationManagement" cm
                        JOIN public."KonsultaManagementCode" kmc ON kmc.id = cm."managementCodeId"
                        WHERE cm."consultationTicketId" = t.id) AS ph_mgmt_codes
                FROM public."ConsultationTicket" t
                LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId"
                LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                LEFT JOIN public."ConsultationTicketAttribute" cta ON cta."consultationTicketId" = t.id
                WHERE t."clinicId" = @cid AND t."isActive" = true AND COALESCE(cp."patientId", ar."userId") = ANY(@ids)
                ORDER BY t.id ASC
                """;

            var rawConsultRows = new List<(
                int TicketId, int Uid, int? ApptId, int? SysId, string? Subject,
                DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string? CaseNumber,
                string? Atc, string? AtcCode, string? HciCaseNo, string? SoapNo,
                bool IsWalkIn, bool IsYakap, string? TicketStatus, int? HpId,
                string Subj, string Obj, string Assess, string PlanTxt,
                decimal? CoPay, string? HomeInst, string? DiagOpts, string? EkasAuth, string? MgmtCodes)>();

            await using (var cmd = new NpgsqlCommand(consultSql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var ticketId = r.GetInt32(0);
                    var uid = r.GetInt32(1);
                    var apptId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                    var sysId = r.IsDBNull(3) ? (int?)null : r.GetInt32(3);
                    var subject = SyncTransforms.Clean(GetStr(r, 4));
                    var createdAt = GetUtc(r, 5) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 6) ?? createdAt;
                    var isWalkIn = (!r.IsDBNull(12) && r.GetBoolean(12)) ||
                                   (apptId.HasValue && apptMeta.TryGetValue(apptId.Value, out var am2) && am2.IsWalkIn);
                    var isYakap = !r.IsDBNull(13) && r.GetBoolean(13);
                    var hpId = r.IsDBNull(15) ? (int?)null : r.GetInt32(15);
                    var subj = SyncTransforms.Clean(GetStr(r, 16)) ?? subject ?? string.Empty;
                    var obj = SyncTransforms.Clean(GetStr(r, 17)) ?? string.Empty;
                    var assess = SyncTransforms.Clean(GetStr(r, 18)) ?? string.Empty;
                    var planTxt = string.Join("\n\n", new[] { SyncTransforms.Clean(GetStr(r, 19)), SyncTransforms.Clean(GetStr(r, 20)) }.Where(x => x is not null));
                    var coPay = r.IsDBNull(21) ? (decimal?)null : r.GetDecimal(21);
                    var homeInst = SyncTransforms.ExtractKonsultaAdviceText(GetStr(r, 22));
                    var diagOpts = SyncTransforms.ExtractDiagnosticServicesOptionCode(GetStr(r, 23));
                    var ekasAuth = SyncTransforms.Clean(GetStr(r, 24), 500);
                    var mgmtCodes = SyncTransforms.Clean(GetStr(r, 25));

                    rawConsultRows.Add((
                        ticketId, uid, apptId, sysId, subject,
                        createdAt, updatedAt, GetStr(r, 7),
                        GetStr(r, 8), GetStr(r, 9), GetStr(r, 10), GetStr(r, 11),
                        isWalkIn, isYakap, GetStr(r, 14), hpId,
                        subj, obj, assess, planTxt,
                        coPay, homeInst, diagOpts, ekasAuth, mgmtCodes));
                }
            }

            // DB-backed QueueItemId & AppointmentId lookup across runs (IX_Consultations_QueueItemId is UNIQUE)
            var candidateConsultQueueIds = new HashSet<Guid>();
            var candidateConsultIds = new List<Guid>(rawConsultRows.Count);
            var candidateApptIds = new HashSet<Guid>();
            foreach (var row in rawConsultRows)
            {
                candidateConsultIds.Add(DeterministicUuid.SharedConsultationId(v2ClinicId, row.TicketId));
                candidateConsultQueueIds.Add(DeterministicUuid.SharedQueueItemForConsultationId(v2ClinicId, row.TicketId));
                if (row.ApptId.HasValue)
                {
                    candidateConsultQueueIds.Add(DeterministicUuid.SharedQueueItemForAppointmentId(v2ClinicId, row.ApptId.Value));
                    candidateApptIds.Add(DeterministicUuid.SharedAppointmentId(v2ClinicId, row.ApptId.Value));
                }
            }

            var dbConsultQueueOwner = new Dictionary<Guid, Guid>();
            var dbExistingConsultQueue = new Dictionary<Guid, Guid>();
            if (candidateConsultQueueIds.Count > 0)
            {
                await using var qLookup = new NpgsqlCommand("""
                    SELECT "Id", "QueueItemId"
                    FROM public."Consultations"
                    WHERE "QueueItemId" = ANY(@qids) OR "Id" = ANY(@cids)
                    """, v2);
                qLookup.Parameters.AddWithValue("qids", candidateConsultQueueIds.ToArray());
                qLookup.Parameters.AddWithValue("cids", candidateConsultIds.ToArray());
                await using var qr = await qLookup.ExecuteReaderAsync(ct);
                while (await qr.ReadAsync(ct))
                {
                    var cidVal = qr.GetGuid(0);
                    if (!qr.IsDBNull(1))
                    {
                        var qidVal = qr.GetGuid(1);
                        dbConsultQueueOwner[qidVal] = cidVal;
                        dbExistingConsultQueue[cidVal] = qidVal;
                    }
                }
            }

            var existingV2Appts = new HashSet<Guid>();
            if (candidateApptIds.Count > 0)
            {
                await using var aLookup = new NpgsqlCommand("""
                    SELECT "Id" FROM public."Appointments" WHERE "Id" = ANY(@aids) AND "IsDeleted" = false
                    """, v2);
                aLookup.Parameters.AddWithValue("aids", candidateApptIds.ToArray());
                await using var ar = await aLookup.ExecuteReaderAsync(ct);
                while (await ar.ReadAsync(ct)) existingV2Appts.Add(ar.GetGuid(0));
            }

            var existingV2QueueItems = new HashSet<Guid>();
            if (candidateConsultQueueIds.Count > 0)
            {
                await using var qiLookup = new NpgsqlCommand("""
                    SELECT "Id" FROM public."QueueItems" WHERE "Id" = ANY(@qids)
                    """, v2);
                qiLookup.Parameters.AddWithValue("qids", candidateConsultQueueIds.ToArray());
                await using var qir = await qiLookup.ExecuteReaderAsync(ct);
                while (await qir.ReadAsync(ct)) existingV2QueueItems.Add(qir.GetGuid(0));
            }

            var usedQueueIds = new HashSet<Guid>(dbConsultQueueOwner.Keys);
            var consultPatientMap = new Dictionary<int, (Guid ConsultId, Guid? QueueId, string? RosCat)>();
            var consultCandidates = new List<ChildSyncCandidate>();
            var dedicatedQueueBatch = new NpgsqlBatch(v2);
            var dedicatedQueueLedger = new List<(string, Guid, string, string)>();
            var consultActiveForShield = new HashSet<string>(StringComparer.Ordinal);

            foreach (var row in rawConsultRows)
            {
                var v1IdStr = row.TicketId.ToString(CultureInfo.InvariantCulture);
                consultActiveForShield.Add(v1IdStr);
                var v2ConsultId = DeterministicUuid.SharedConsultationId(v2ClinicId, row.TicketId);
                var v2PatientId = DeterministicUuid.ClinicPatientId(v2ClinicId, row.Uid);
                var pname = patientNames.TryGetValue(row.Uid, out var n) ? n : "Patient";

                Guid? v2ApptId = null;
                if (row.ApptId.HasValue)
                {
                    var detApptId = DeterministicUuid.SharedAppointmentId(v2ClinicId, row.ApptId.Value);
                    if (apptToQueue.ContainsKey(row.ApptId.Value) || existingV2Appts.Contains(detApptId))
                    {
                        v2ApptId = detApptId;
                    }
                }

                Guid v2QueueId;
                bool needDedicatedQueueItem = false;
                if (dbExistingConsultQueue.TryGetValue(v2ConsultId, out var existingOwnQueue))
                {
                    v2QueueId = existingOwnQueue;
                }
                else if (row.ApptId.HasValue)
                {
                    var candidateSharedQ = apptToQueue.TryGetValue(row.ApptId.Value, out var qFromAppt)
                        ? qFromAppt
                        : DeterministicUuid.SharedQueueItemForAppointmentId(v2ClinicId, row.ApptId.Value);

                    var sharedQAvailableInV2 = apptToQueue.ContainsKey(row.ApptId.Value) || existingV2QueueItems.Contains(candidateSharedQ);
                    if (sharedQAvailableInV2 &&
                        (!dbConsultQueueOwner.TryGetValue(candidateSharedQ, out var qOwner) || qOwner == v2ConsultId) &&
                        usedQueueIds.Add(candidateSharedQ))
                    {
                        v2QueueId = candidateSharedQ;
                        dbConsultQueueOwner[v2QueueId] = v2ConsultId;
                    }
                    else
                    {
                        v2QueueId = DeterministicUuid.SharedQueueItemForConsultationId(v2ClinicId, row.TicketId);
                        usedQueueIds.Add(v2QueueId);
                        dbConsultQueueOwner[v2QueueId] = v2ConsultId;
                        needDedicatedQueueItem = !existingV2QueueItems.Contains(v2QueueId);
                    }
                }
                else
                {
                    v2QueueId = DeterministicUuid.SharedQueueItemForConsultationId(v2ClinicId, row.TicketId);
                    usedQueueIds.Add(v2QueueId);
                    dbConsultQueueOwner[v2QueueId] = v2ConsultId;
                    needDedicatedQueueItem = !existingV2QueueItems.Contains(v2QueueId);
                }

                consultToQueue[row.TicketId] = v2QueueId;

                string? rosCat = row.SysId.HasValue && systems.TryGetValue(row.SysId.Value, out var sName)
                    ? SyncTransforms.MapRosCategory(sName)
                    : (row.ApptId.HasValue && apptMeta.TryGetValue(row.ApptId.Value, out var am) ? am.RosCat : null);
                consultPatientMap[row.TicketId] = (v2ConsultId, v2QueueId, rosCat);

                if (!RunSection("Consultation")) continue;

                var doc = row.HpId.HasValue && clinicians.TryGetValue(row.HpId.Value, out var c)
                    ? c : new ClinicianSnapshot("Clinic Physician", null, null);
                var docId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"v1_hp:{row.HpId ?? 0}");
                var isSigned = string.Equals(row.TicketStatus, "RESOLVED", StringComparison.OrdinalIgnoreCase);
                var hasCoPayment = row.CoPay.HasValue && row.CoPay.Value > 0m;
                var workflowMode = row.IsYakap ? "YakapAvailment" : "Regular";
                var phCase = SyncTransforms.Clean(row.HciCaseNo, 50) ?? SyncTransforms.Clean(row.CaseNumber, 50);
                var soapNo = SyncTransforms.Clean(row.SoapNo, 50);
                var atc = SyncTransforms.Clean(row.AtcCode, 50) ?? SyncTransforms.Clean(row.Atc, 50);

                if (needDedicatedQueueItem && !isDryRun &&
                    (targetV1IdFilter is null || string.Equals(targetV1IdFilter, v1IdStr, StringComparison.Ordinal)))
                {
                    var qDate = DateOnly.FromDateTime(row.CreatedAt.ToOffset(ManilaOffset).DateTime);
                    var qCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."QueueItems" (
                            "Id","QueueNumber","SequenceNumber","QueueDate","PatientId","PatientName",
                            "AppointmentId","Priority","Status","VisitWorkflowMode","CheckInTime","CompletedTime",
                            "ChiefComplaint","VisitType","IsDirectVisit",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @qid,@qnum,@seq,@qdate,@pid,@pname,
                            @aid,'Routine','Completed','Regular',@chk,@chk,
                            @cc,'Consultation',true,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO NOTHING
                        """);
                    qCmd.Parameters.AddWithValue("qid", v2QueueId);
                    qCmd.Parameters.AddWithValue("qnum", SyncTransforms.CleanRequired($"V1-C{row.TicketId}", "V1-C0", 20));
                    qCmd.Parameters.AddWithValue("seq", row.TicketId);
                    qCmd.Parameters.Add(new NpgsqlParameter("qdate", NpgsqlDbType.Date) { Value = qDate });
                    qCmd.Parameters.AddWithValue("pid", v2PatientId);
                    qCmd.Parameters.AddWithValue("pname", pname);
                    qCmd.Parameters.AddWithValue("aid", (object?)v2ApptId ?? DBNull.Value);
                    qCmd.Parameters.AddWithValue("chk", row.CreatedAt);
                    qCmd.Parameters.AddWithValue("cc", (object?)SyncTransforms.Clean(row.Subject, 255) ?? DBNull.Value);
                    qCmd.Parameters.AddWithValue("cat", row.CreatedAt);
                    qCmd.Parameters.AddWithValue("uat", row.UpdatedAt);
                    qCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    qCmd.Parameters.AddWithValue("tid", v2TenantId);
                    qCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    dedicatedQueueBatch.BatchCommands.Add(qCmd);
                    queueCounter.Created++;
                    dedicatedQueueLedger.Add(($"consult:{row.TicketId}", v2QueueId, "queue", "queue"));
                }
                else if (!needDedicatedQueueItem &&
                         !isDryRun &&
                         v2QueueId == DeterministicUuid.SharedQueueItemForConsultationId(v2ClinicId, row.TicketId) &&
                         (targetV1IdFilter is null || string.Equals(targetV1IdFilter, v1IdStr, StringComparison.Ordinal)))
                {
                    queueCounter.Unchanged++;
                }

                var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["subjective"] = row.Subj,
                    ["objective"] = row.Obj,
                    ["assessment"] = row.Assess,
                    ["plan"] = row.PlanTxt,
                    ["rosCategory"] = rosCat,
                    ["isWalkedIn"] = row.IsWalkIn ? "true" : "false",
                    ["isSigned"] = isSigned ? "true" : "false",
                    ["hasCoPayment"] = hasCoPayment ? "true" : "false",
                    ["coPaymentAmount"] = row.CoPay?.ToString("0.00", CultureInfo.InvariantCulture),
                    ["homeInstructions"] = row.HomeInst,
                    ["diagnosticServicesOption"] = row.DiagOpts,
                    ["otherMedicalAdviceSpec"] = row.EkasAuth,
                    ["philHealthManagementCodes"] = row.MgmtCodes
                };

                consultCandidates.Add(new ChildSyncCandidate(v1IdStr, v2ConsultId, null, canonical, targetId =>
                {
                    var cCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."Consultations" (
                            "Id","QueueItemId","AppointmentId","PatientId","PatientName",
                            "DoctorId","DoctorName","DoctorPrcLicense","DoctorPtr",
                            "EncounterDate","Subjective","Objective","Assessment","Plan",
                            "IsSigned","SignedAt","VisitWorkflowMode","IsYakapEligible",
                            "PhilHealthCaseNo","PhilHealthSoapTransNo","PhilHealthAtc","IsWalkedIn",
                            "ServiceDeliveryMethod","RxDispenseStatus","RxStage","RosCategory",
                            "HasCoPayment","CoPaymentAmount","HomeInstructions","DiagnosticServicesOption",
                            "OtherMedicalAdviceSpec","PhilHealthManagementCodes",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @id,@qid,@aid,@pid,@pname,
                            @did,@dname,@dprc,@dptr,
                            @edate,@subj,@obj,@assess,@plan,
                            @signed,@signedAt,@mode,@yakap,
                            @phCase,@soapNo,@atc,@walkIn,
                            'FacilityBased','Issued','Issued',@ros,
                            @hasCopay,@copayAmt,@homeInst,@diagOpt,
                            @otherAdvice,@mgmtCodes,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "DoctorId"=EXCLUDED."DoctorId","DoctorName"=EXCLUDED."DoctorName",
                            "DoctorPrcLicense"=EXCLUDED."DoctorPrcLicense","DoctorPtr"=EXCLUDED."DoctorPtr",
                            "Subjective"=EXCLUDED."Subjective","Objective"=EXCLUDED."Objective",
                            "Assessment"=EXCLUDED."Assessment","Plan"=EXCLUDED."Plan",
                            "VisitWorkflowMode"=EXCLUDED."VisitWorkflowMode","IsYakapEligible"=EXCLUDED."IsYakapEligible",
                            "PhilHealthCaseNo"=EXCLUDED."PhilHealthCaseNo","PhilHealthSoapTransNo"=EXCLUDED."PhilHealthSoapTransNo",
                            "PhilHealthAtc"=EXCLUDED."PhilHealthAtc","ServiceDeliveryMethod"='FacilityBased',
                            "HasCoPayment"=EXCLUDED."HasCoPayment","CoPaymentAmount"=EXCLUDED."CoPaymentAmount",
                            "HomeInstructions"=EXCLUDED."HomeInstructions","DiagnosticServicesOption"=EXCLUDED."DiagnosticServicesOption",
                            "OtherMedicalAdviceSpec"=EXCLUDED."OtherMedicalAdviceSpec","PhilHealthManagementCodes"=EXCLUDED."PhilHealthManagementCodes",
                            "RosCategory"=EXCLUDED."RosCategory","IsWalkedIn"=EXCLUDED."IsWalkedIn",
                            "IsSigned"=EXCLUDED."IsSigned","SignedAt"=EXCLUDED."SignedAt",
                            "UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    cCmd.Parameters.AddWithValue("id", targetId);
                    cCmd.Parameters.AddWithValue("qid", v2QueueId);
                    cCmd.Parameters.AddWithValue("aid", (object?)v2ApptId ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("pid", v2PatientId);
                    cCmd.Parameters.AddWithValue("pname", pname);
                    cCmd.Parameters.AddWithValue("did", docId);
                    cCmd.Parameters.AddWithValue("dname", doc.Name);
                    cCmd.Parameters.AddWithValue("dprc", (object?)doc.PrcLicense ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("dptr", (object?)doc.PtrNumber ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("edate", row.CreatedAt);
                    cCmd.Parameters.AddWithValue("subj", row.Subj);
                    cCmd.Parameters.AddWithValue("obj", row.Obj);
                    cCmd.Parameters.AddWithValue("assess", row.Assess);
                    cCmd.Parameters.AddWithValue("plan", row.PlanTxt);
                    cCmd.Parameters.AddWithValue("signed", isSigned);
                    cCmd.Parameters.AddWithValue("signedAt", isSigned ? row.UpdatedAt : DBNull.Value);
                    cCmd.Parameters.AddWithValue("mode", workflowMode);
                    cCmd.Parameters.AddWithValue("yakap", row.IsYakap);
                    cCmd.Parameters.AddWithValue("phCase", (object?)phCase ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("soapNo", (object?)soapNo ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("atc", (object?)atc ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("walkIn", row.IsWalkIn);
                    cCmd.Parameters.AddWithValue("ros", (object?)rosCat ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("hasCopay", hasCoPayment);
                    cCmd.Parameters.Add(new NpgsqlParameter("copayAmt", NpgsqlDbType.Numeric) { Value = (object?)row.CoPay ?? DBNull.Value });
                    cCmd.Parameters.AddWithValue("homeInst", (object?)row.HomeInst ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("diagOpt", (object?)row.DiagOpts ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("otherAdvice", (object?)row.EkasAuth ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("mgmtCodes", (object?)row.MgmtCodes ?? DBNull.Value);
                    cCmd.Parameters.AddWithValue("cat", row.CreatedAt);
                    cCmd.Parameters.AddWithValue("uat", row.UpdatedAt);
                    cCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    cCmd.Parameters.AddWithValue("tid", v2TenantId);
                    cCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    return cCmd;
                }));
            }

            if (RunSection("Consultation"))
            {
                if (!isDryRun && dedicatedQueueBatch.BatchCommands.Count > 0)
                {
                    await dedicatedQueueBatch.ExecuteNonQueryAsync(ct);
                    await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "QueueItem", dedicatedQueueLedger, ct);
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "Consultation", v2Pids, consultCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","Subjective","Objective","Assessment","Plan","RosCategory","IsWalkedIn","IsSigned",
                               "HasCoPayment","CoPaymentAmount","HomeInstructions","DiagnosticServicesOption",
                               "OtherMedicalAdviceSpec","PhilHealthManagementCodes"
                        FROM public."Consultations"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["subjective"] = GetStr(r, 1) ?? string.Empty,
                            ["objective"] = GetStr(r, 2) ?? string.Empty,
                            ["assessment"] = GetStr(r, 3) ?? string.Empty,
                            ["plan"] = GetStr(r, 4) ?? string.Empty,
                            ["rosCategory"] = GetStr(r, 5),
                            ["isWalkedIn"] = r.GetBoolean(6) ? "true" : "false",
                            ["isSigned"] = r.GetBoolean(7) ? "true" : "false",
                            ["hasCoPayment"] = r.GetBoolean(8) ? "true" : "false",
                            ["coPaymentAmount"] = r.IsDBNull(9) ? null : r.GetDecimal(9).ToString("0.00", CultureInfo.InvariantCulture),
                            ["homeInstructions"] = GetStr(r, 10),
                            ["diagnosticServicesOption"] = GetStr(r, 11),
                            ["otherMedicalAdviceSpec"] = GetStr(r, 12),
                            ["philHealthManagementCodes"] = GetStr(r, 13)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, consultActiveForShield);
            }

            if (!RunSection("PatientVitals")) continue;

            // 6c & 6d. PatientVitals: DB-backed QueueItemId lookup across runs (IX_PatientVitals_QueueItemId is UNIQUE)
            var candidateVitalQueueIds = new HashSet<Guid>(apptToQueue.Values);
            foreach (var cm in consultPatientMap.Values)
            {
                if (cm.QueueId.HasValue) candidateVitalQueueIds.Add(cm.QueueId.Value);
            }

            var queueVitalOwner = new Dictionary<Guid, (Guid VitalsId, string? CreatedBy, string? UpdatedBy)>();
            if (candidateVitalQueueIds.Count > 0)
            {
                await using var voCmd = new NpgsqlCommand("""
                    SELECT "QueueItemId", "Id", "CreatedBy", "UpdatedBy"
                    FROM public."PatientVitals"
                    WHERE "QueueItemId" = ANY(@qids)
                    """, v2);
                voCmd.Parameters.AddWithValue("qids", candidateVitalQueueIds.ToArray());
                await using var vor = await voCmd.ExecuteReaderAsync(ct);
                while (await vor.ReadAsync(ct))
                {
                    if (!vor.IsDBNull(0))
                    {
                        queueVitalOwner[vor.GetGuid(0)] = (vor.GetGuid(1), GetStr(vor, 2), GetStr(vor, 3));
                    }
                }
            }

            var vitalsCandidates = new List<ChildSyncCandidate>();
            var vitalsActiveForShield = new HashSet<string>(StringComparer.Ordinal);

            // 6c. PatientVitals: Part 1 -> VitalSign rows (with numeric sanitizers!)
            const string vitalSql = """
                SELECT vs.id, vs."userId", vs."dateTaken", vs.height, vs.weight, vs.bmi,
                       vs."bpSystolic", vs."bpDiastolic", vs."pulseRate", vs.temp, vs.spo2, vs."respRate",
                       vs.notes, vs."headCircumference", vs."hipCircumference", vs.length, vs."limbCircumference",
                       vs."midUpperArmCircumference", vs."skinfoldThickness", vs."visualAcuityLeft", vs."visualAcuityRight",
                       vs."waistCircumference", vs."consultationTicketId", vs."createdAt", vs."updatedAt"
                FROM public."VitalSign" vs
                WHERE vs."userId" = ANY(@ids) AND vs."deletedAt" IS NULL AND vs."isActive" = true
                  AND (vs."consultationTicketId" IS NULL OR EXISTS (
                      SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = vs."consultationTicketId" AND ct."clinicId" = @cid
                  ))
                ORDER BY vs.id ASC
                """;

            await using (var cmd = new NpgsqlCommand(vitalSql, v1))
            {
                cmd.Parameters.AddWithValue("ids", ids);
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var vId = r.GetInt32(0);
                    var v1Key = $"vital:{vId}";
                    vitalsActiveForShield.Add(v1Key);
                    var uid = r.GetInt32(1);
                    var v2Id = DeterministicUuid.SharedVitalsId(v2ClinicId, vId);
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                    var ticketId = r.IsDBNull(22) ? (int?)null : r.GetInt32(22);
                    Guid? v2ConsultId = null;
                    Guid? v2QueueId = null;
                    string? rosCat = null;
                    if (ticketId.HasValue && consultPatientMap.TryGetValue(ticketId.Value, out var cm))
                    {
                        v2ConsultId = cm.ConsultId;
                        if (cm.QueueId.HasValue && (!queueVitalOwner.TryGetValue(cm.QueueId.Value, out var existingOwner) || existingOwner.VitalsId == v2Id))
                        {
                            queueVitalOwner[cm.QueueId.Value] = (v2Id, SyncTransforms.SyncActor, SyncTransforms.SyncActor);
                            v2QueueId = cm.QueueId.Value;
                        }
                        rosCat = cm.RosCat;
                    }

                    var recAt = GetUtc(r, 2) ?? GetUtc(r, 23) ?? DateTimeOffset.UtcNow;
                    var sbp = r.IsDBNull(6) ? (int?)null : r.GetInt32(6);
                    var dbp = r.IsDBNull(7) ? (int?)null : r.GetInt32(7);
                    var hr = r.IsDBNull(8) ? (int?)null : r.GetInt32(8);
                    var temp = SyncTransforms.SanitizeTemperatureCelsius(GetDecNullable(r, 9));
                    var rr = r.IsDBNull(11) ? (int?)null : r.GetInt32(11);
                    var spo2 = SyncTransforms.SanitizeOxygenSaturationPercent(GetDecNullable(r, 10));
                    var ht = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 3));
                    var wt = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 4));
                    var bmi = SyncTransforms.SanitizeBmi(GetDecNullable(r, 5));
                    var notes = SyncTransforms.Clean(GetStr(r, 12));
                    var head = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 13));
                    var hip = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 14));
                    var len = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 15));
                    var limb = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 16));
                    var muac = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 17));
                    var skin = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 18));
                    var val = SyncTransforms.Clean(GetStr(r, 19), 50);
                    var varRight = SyncTransforms.Clean(GetStr(r, 20), 50);
                    var waist = SyncTransforms.SanitizePositiveNumeric6_2(GetDecNullable(r, 21));
                    var cat = GetUtc(r, 23) ?? recAt;
                    var uat = GetUtc(r, 24) ?? recAt;

                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["systolicBp"] = sbp?.ToString(CultureInfo.InvariantCulture),
                        ["diastolicBp"] = dbp?.ToString(CultureInfo.InvariantCulture),
                        ["heartRateBpm"] = hr?.ToString(CultureInfo.InvariantCulture),
                        ["temperatureCelsius"] = temp?.ToString("0.00", CultureInfo.InvariantCulture),
                        ["oxygenSaturationPercent"] = spo2?.ToString("0.00", CultureInfo.InvariantCulture),
                        ["heightCm"] = ht?.ToString("0.00", CultureInfo.InvariantCulture),
                        ["weightKg"] = wt?.ToString("0.00", CultureInfo.InvariantCulture),
                        ["bmi"] = bmi?.ToString("0.00", CultureInfo.InvariantCulture),
                        ["notes"] = notes
                    };

                    vitalsCandidates.Add(new ChildSyncCandidate(v1Key, v2Id, null, canonical, targetId =>
                    {
                        var vCmd = new NpgsqlBatchCommand("""
                            INSERT INTO public."PatientVitals" (
                                "Id","QueueItemId","ConsultationEncounterId","PatientId","RecordedAt",
                                "SystolicBp","DiastolicBp","HeartRateBpm","TemperatureCelsius","RespiratoryRateBreathsPerMin",
                                "OxygenSaturationPercent","HeightCm","WeightKg","Bmi","Notes",
                                "HeadCircumferenceCm","HipCircumferenceCm","BodyLengthCm","LimbsCircumferenceCm",
                                "MidUpperArmCircumferenceCm","SkinfoldThicknessMm","VisualAcuityLeft","VisualAcuityRight",
                                "WaistCircumferenceCm","IsMeasuredRecumbent","RosCategory",
                                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                            ) VALUES (
                                @id,@qid,@cidEnc,@pid,@recAt,
                                @sbp,@dbp,@hr,@temp,@rr,
                                @spo2,@ht,@wt,@bmi,@notes,
                                @head,@hip,@len,@limb,
                                @muac,@skin,@val,@var,
                                @waist,false,@ros,
                                @cat,@actor,@uat,@actor,false,@tid,@cid
                            ) ON CONFLICT ("Id") DO UPDATE SET
                                "SystolicBp"=EXCLUDED."SystolicBp","DiastolicBp"=EXCLUDED."DiastolicBp",
                                "HeartRateBpm"=EXCLUDED."HeartRateBpm","TemperatureCelsius"=EXCLUDED."TemperatureCelsius",
                                "OxygenSaturationPercent"=EXCLUDED."OxygenSaturationPercent",
                                "HeightCm"=EXCLUDED."HeightCm","WeightKg"=EXCLUDED."WeightKg","Bmi"=EXCLUDED."Bmi",
                                "Notes"=EXCLUDED."Notes","UpdatedAt"=now(),"UpdatedBy"=@actor
                            """);
                        vCmd.Parameters.AddWithValue("id", targetId);
                        vCmd.Parameters.AddWithValue("qid", (object?)v2QueueId ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("cidEnc", (object?)v2ConsultId ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("pid", v2Pid);
                        vCmd.Parameters.AddWithValue("recAt", recAt);
                        vCmd.Parameters.AddWithValue("sbp", (object?)sbp ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("dbp", (object?)dbp ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("hr", (object?)hr ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("temp", (object?)temp ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("rr", (object?)rr ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("spo2", (object?)spo2 ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("ht", (object?)ht ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("wt", (object?)wt ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("bmi", (object?)bmi ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("notes", (object?)notes ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("head", (object?)head ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("hip", (object?)hip ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("len", (object?)len ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("limb", (object?)limb ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("muac", (object?)muac ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("skin", (object?)skin ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("val", (object?)val ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("var", (object?)varRight ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("waist", (object?)waist ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("ros", (object?)rosCat ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("cat", cat);
                        vCmd.Parameters.AddWithValue("uat", uat);
                        vCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        vCmd.Parameters.AddWithValue("tid", v2TenantId);
                        vCmd.Parameters.AddWithValue("cid", v2ClinicId);
                        return vCmd;
                    }));
                }
            }

            await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "PatientVitals", v2Pids, vitalsCandidates,
                targetIds => LoadStringMapRowsAsync(v2, """
                    SELECT "Id","SystolicBp","DiastolicBp","HeartRateBpm","TemperatureCelsius","OxygenSaturationPercent",
                           "HeightCm","WeightKg","Bmi","Notes"
                    FROM public."PatientVitals"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["systolicBp"] = r.IsDBNull(1) ? null : r.GetInt32(1).ToString(CultureInfo.InvariantCulture),
                        ["diastolicBp"] = r.IsDBNull(2) ? null : r.GetInt32(2).ToString(CultureInfo.InvariantCulture),
                        ["heartRateBpm"] = r.IsDBNull(3) ? null : r.GetInt32(3).ToString(CultureInfo.InvariantCulture),
                        ["temperatureCelsius"] = r.IsDBNull(4) ? null : r.GetDecimal(4).ToString("0.00", CultureInfo.InvariantCulture),
                        ["oxygenSaturationPercent"] = r.IsDBNull(5) ? null : r.GetDecimal(5).ToString("0.00", CultureInfo.InvariantCulture),
                        ["heightCm"] = r.IsDBNull(6) ? null : r.GetDecimal(6).ToString("0.00", CultureInfo.InvariantCulture),
                        ["weightKg"] = r.IsDBNull(7) ? null : r.GetDecimal(7).ToString("0.00", CultureInfo.InvariantCulture),
                        ["bmi"] = r.IsDBNull(8) ? null : r.GetDecimal(8).ToString("0.00", CultureInfo.InvariantCulture),
                        ["notes"] = GetStr(r, 9)
                    }, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, skipChildDeletionShield: true);

            // 6d. PatientVitals: Part 2 -> PreAssessmentNote bridge (aggregated deterministically per appointmentId)
            const string preAssessSql = """
                SELECT pa.id, pa."appointmentId", ar."userId", pa.assessment, pa."homeInstructions", pa.remarks, pa."createdAt", pa."updatedAt",
                       (SELECT t.id FROM public."ConsultationTicket" t WHERE t."appointmentId" = pa."appointmentId" AND t."isActive" = true ORDER BY t.id ASC LIMIT 1) AS ticket_id
                FROM public."PreAssessmentNote" pa
                JOIN public."AppointmentRequester" ar ON ar."appointmentId" = pa."appointmentId"
                WHERE pa."clinicId" = @cid AND ar."userId" = ANY(@ids)
                ORDER BY pa."appointmentId" ASC, pa.id ASC
                """;
            var preAssessCandidates = new List<ChildSyncCandidate>();
            var preAssessMergeItems = new List<(string V1Key, Guid OwnerId, string? PaNotes, string? PaRem, string? HomeInst)>();
            var preAssessMergeLedger = new List<(string V1Id, Guid V2Id, string V1Hash, string V2ExpectedHash)>();
            var preAssessMergeBatch = new NpgsqlBatch(v2);
            var preAssessDiffs = new List<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)>();
            var vitalsCounter = summary.For("PatientVitals");

            var rawPreAssessGroups = new Dictionary<int, List<(int PaId, int ApptId, int Uid, string? Assessment, string? HomeInst, string? Remarks, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int? TicketId)>>();
            var orderedApptIds = new List<int>();

            await using (var cmd = new NpgsqlCommand(preAssessSql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var paId = r.GetInt32(0);
                    var apptId = r.GetInt32(1);
                    var uid = r.GetInt32(2);
                    var assessment = SyncTransforms.Clean(GetStr(r, 3));
                    var homeInst = SyncTransforms.Clean(GetStr(r, 4));
                    var remarks = SyncTransforms.Clean(GetStr(r, 5));
                    var createdAt = GetUtc(r, 6) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 7) ?? createdAt;
                    var ticketId = r.IsDBNull(8) ? (int?)null : r.GetInt32(8);

                    if (!rawPreAssessGroups.TryGetValue(apptId, out var list))
                    {
                        list = new List<(int, int, int, string?, string?, string?, DateTimeOffset, DateTimeOffset, int?)>();
                        rawPreAssessGroups[apptId] = list;
                        orderedApptIds.Add(apptId);
                    }
                    list.Add((paId, apptId, uid, assessment, homeInst, remarks, createdAt, updatedAt, ticketId));
                }
            }

            foreach (var apptId in orderedApptIds)
            {
                var group = rawPreAssessGroups[apptId];
                var primary = group[0];
                var paId = primary.PaId;
                var v1Key = $"preassess:{paId}";
                vitalsActiveForShield.Add(v1Key);
                var uid = primary.Uid;
                var v2Id = DeterministicUuid.SharedPreAssessmentVitalsId(v2ClinicId, paId);
                var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                var rawQueueId = apptToQueue.TryGetValue(apptId, out var q) ? q : (Guid?)null;
                Guid? v2QueueId = null;
                Guid? mergeIntoOwnerId = null;
                if (rawQueueId.HasValue)
                {
                    if (!queueVitalOwner.TryGetValue(rawQueueId.Value, out var existingOwner) || existingOwner.VitalsId == v2Id)
                    {
                        queueVitalOwner[rawQueueId.Value] = (v2Id, SyncTransforms.SyncActor, SyncTransforms.SyncActor);
                        v2QueueId = rawQueueId.Value;
                    }
                    else
                    {
                        mergeIntoOwnerId = existingOwner.VitalsId;
                    }
                }

                var noteParts = group.Select(x => x.Assessment).Where(x => x is not null).Cast<string>().ToList();
                var homeParts = group.Select(x => x.HomeInst).Where(x => x is not null).Cast<string>().ToList();
                var remParts = group.Select(x => x.Remarks).Where(x => x is not null).Cast<string>().ToList();
                var paNotes = noteParts.Count > 0 ? string.Join("\n\n", noteParts) : null;
                var homeInst = homeParts.Count > 0 ? string.Join("\n\n", homeParts) : null;
                var paRem = remParts.Count > 0 ? string.Join("\n\n", remParts) : null;
                var recAt = group.Min(x => x.CreatedAt);
                var uat = group.Max(x => x.UpdatedAt);
                var ticketId = group.Select(x => x.TicketId).FirstOrDefault(x => x.HasValue);
                Guid? v2ConsultId = ticketId.HasValue && consultPatientMap.TryGetValue(ticketId.Value, out var cm) ? cm.ConsultId : null;
                var rosCat = apptMeta.TryGetValue(apptId, out var am) ? am.RosCat : null;

                if (mergeIntoOwnerId.HasValue)
                {
                    if (targetV1IdFilter is not null && !string.Equals(targetV1IdFilter, v1Key, StringComparison.Ordinal))
                        continue;

                    preAssessMergeItems.Add((v1Key, mergeIntoOwnerId.Value, paNotes, paRem, homeInst));
                    continue;
                }

                var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["preAssessmentNotes"] = paNotes,
                    ["preAssessmentRemarks"] = paRem,
                    ["homeInstructions"] = homeInst,
                    ["rosCategory"] = rosCat
                };

                preAssessCandidates.Add(new ChildSyncCandidate(v1Key, v2Id, null, canonical, targetId =>
                {
                    var pCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."PatientVitals" (
                            "Id","QueueItemId","ConsultationEncounterId","PatientId","RecordedAt",
                            "PreAssessmentNotes","PreAssessmentRemarks","HomeInstructions","IsMeasuredRecumbent","RosCategory",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @id,@qid,@cidEnc,@pid,@recAt,
                            @paNotes,@paRem,@homeInst,false,@ros,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "PreAssessmentNotes"=EXCLUDED."PreAssessmentNotes",
                            "PreAssessmentRemarks"=EXCLUDED."PreAssessmentRemarks",
                            "HomeInstructions"=EXCLUDED."HomeInstructions",
                            "RosCategory"=EXCLUDED."RosCategory","UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    pCmd.Parameters.AddWithValue("id", targetId);
                    pCmd.Parameters.AddWithValue("qid", (object?)v2QueueId ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("cidEnc", (object?)v2ConsultId ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("pid", v2Pid);
                    pCmd.Parameters.AddWithValue("recAt", recAt);
                    pCmd.Parameters.AddWithValue("paNotes", (object?)paNotes ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("paRem", (object?)paRem ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("homeInst", (object?)homeInst ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("ros", (object?)rosCat ?? DBNull.Value);
                    pCmd.Parameters.AddWithValue("cat", recAt);
                    pCmd.Parameters.AddWithValue("uat", uat);
                    pCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    pCmd.Parameters.AddWithValue("tid", v2TenantId);
                    pCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    return pCmd;
                }));
            }

            if (preAssessMergeItems.Count > 0)
            {
                var mergeV1Keys = preAssessMergeItems.Select(m => m.V1Key).Distinct().ToArray();
                var mergeOwnerIds = preAssessMergeItems.Select(m => m.OwnerId).Distinct().ToArray();
                var mergeStoredHashes = await _ledger.LoadRowHashesForIdsAsync(binding.Id, "PatientVitals", mergeV1Keys, ct);

                var liveMergeStates = new Dictionary<Guid, (string? Notes, string? Remarks, string? HomeInst)>();
                await using (var lmCmd = new NpgsqlCommand("""
                    SELECT "Id", "PreAssessmentNotes", "PreAssessmentRemarks", "HomeInstructions"
                    FROM public."PatientVitals"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, v2))
                {
                    lmCmd.Parameters.AddWithValue("ids", mergeOwnerIds);
                    await using var lmr = await lmCmd.ExecuteReaderAsync(ct);
                    while (await lmr.ReadAsync(ct))
                    {
                        liveMergeStates[lmr.GetGuid(0)] = (GetStr(lmr, 1), GetStr(lmr, 2), GetStr(lmr, 3));
                    }
                }

                foreach (var m in preAssessMergeItems)
                {
                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["preAssessmentNotes"] = m.PaNotes,
                        ["preAssessmentRemarks"] = m.PaRem,
                        ["homeInstructions"] = m.HomeInst
                    };
                    var v1Hash = DeterministicUuid.ComputeCanonicalHash(canonical);

                    if (!liveMergeStates.TryGetValue(m.OwnerId, out var live))
                    {
                        if (isDryRun)
                        {
                            vitalsCounter.Updated++;
                            preAssessDiffs.Add(("PatientVitals", m.V1Key, m.OwnerId,
                                forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update,
                                new[] { "preAssessmentNotes", "preAssessmentRemarks", "homeInstructions" }));
                        }
                        continue;
                    }

                    var liveFields = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["preAssessmentNotes"] = live.Notes,
                        ["preAssessmentRemarks"] = live.Remarks,
                        ["homeInstructions"] = live.HomeInst
                    };
                    var liveV2Hash = DeterministicUuid.ComputeCanonicalHash(liveFields);
                    var changedFields = DeterministicUuid.ComputeChangedFieldNames(liveFields, canonical);

                    if (mergeStoredHashes.TryGetValue(m.V1Key, out var prevHash))
                    {
                        if (!forceV1OnConflict && string.Equals(prevHash.V1PayloadHash, v1Hash, StringComparison.Ordinal))
                        {
                            vitalsCounter.Unchanged++;
                            continue;
                        }

                        if (!forceV1OnConflict && !string.Equals(liveV2Hash, prevHash.V2ExpectedHash, StringComparison.Ordinal))
                        {
                            vitalsCounter.SkippedV2Wins++;
                            if (preAssessDiffs.Count < 500)
                                preAssessDiffs.Add(("PatientVitals", m.V1Key, m.OwnerId, SyncDiffAction.SkipV2Wins, changedFields));
                            if (!isDryRun)
                            {
                                await _ledger.RecordConflictAsync(binding.Id, runId, "PatientVitals", m.V1Key, m.OwnerId,
                                    SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                            }
                            continue;
                        }

                        if (changedFields.Count == 0)
                        {
                            vitalsCounter.Unchanged++;
                            if (!isDryRun) preAssessMergeLedger.Add((m.V1Key, m.OwnerId, v1Hash, v1Hash));
                            continue;
                        }

                        vitalsCounter.Updated++;
                        if (preAssessDiffs.Count < 500)
                            preAssessDiffs.Add(("PatientVitals", m.V1Key, m.OwnerId,
                                forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update, changedFields));
                    }
                    else
                    {
                        if (changedFields.Count == 0)
                        {
                            vitalsCounter.Unchanged++;
                            if (!isDryRun) preAssessMergeLedger.Add((m.V1Key, m.OwnerId, v1Hash, v1Hash));
                            continue;
                        }

                        var hasExistingPreAssessInV2 = live.Notes is not null || live.Remarks is not null || live.HomeInst is not null;
                        if (hasExistingPreAssessInV2 && !forceV1OnConflict)
                        {
                            vitalsCounter.SkippedV2Wins++;
                            if (preAssessDiffs.Count < 500)
                                preAssessDiffs.Add(("PatientVitals", m.V1Key, m.OwnerId, SyncDiffAction.SkipV2Wins, changedFields));
                            if (!isDryRun)
                            {
                                await _ledger.RecordConflictAsync(binding.Id, runId, "PatientVitals", m.V1Key, m.OwnerId,
                                    SyncConflictType.V2Modified, changedFields, ct, v1Hash, liveV2Hash);
                            }
                            continue;
                        }

                        vitalsCounter.Updated++;
                        if (preAssessDiffs.Count < 500)
                            preAssessDiffs.Add(("PatientVitals", m.V1Key, m.OwnerId,
                                forceV1OnConflict ? SyncDiffAction.ForceV1 : SyncDiffAction.Update, changedFields));
                    }

                    if (!isDryRun)
                    {
                        var uCmd = new NpgsqlBatchCommand("""
                            UPDATE public."PatientVitals"
                            SET "PreAssessmentNotes" = @paNotes,
                                "PreAssessmentRemarks" = @paRem,
                                "HomeInstructions" = @homeInst,
                                "UpdatedAt" = now(),
                                "UpdatedBy" = @actor
                            WHERE "Id" = @ownerId
                            """);
                        uCmd.Parameters.AddWithValue("ownerId", m.OwnerId);
                        uCmd.Parameters.AddWithValue("paNotes", (object?)m.PaNotes ?? DBNull.Value);
                        uCmd.Parameters.AddWithValue("paRem", (object?)m.PaRem ?? DBNull.Value);
                        uCmd.Parameters.AddWithValue("homeInst", (object?)m.HomeInst ?? DBNull.Value);
                        uCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        preAssessMergeBatch.BatchCommands.Add(uCmd);
                        preAssessMergeLedger.Add((m.V1Key, m.OwnerId, v1Hash, v1Hash));
                    }
                }
            }

            if (!isDryRun && preAssessMergeBatch.BatchCommands.Count > 0)
            {
                await preAssessMergeBatch.ExecuteNonQueryAsync(ct);
                await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "PatientVitals", preAssessMergeLedger, ct);
            }
            else if (!isDryRun && preAssessMergeLedger.Count > 0)
            {
                await _ledger.UpsertIdMapAndHashBatchAsync(binding.Id, "PatientVitals", preAssessMergeLedger, ct);
            }
            if (preAssessDiffs.Count > 0)
            {
                await _ledger.RecordDiffsBatchAsync(runId, binding.Id, preAssessDiffs, ct);
            }

            await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "PatientVitals", v2Pids, preAssessCandidates,
                targetIds => LoadStringMapRowsAsync(v2, """
                    SELECT "Id","PreAssessmentNotes","PreAssessmentRemarks","HomeInstructions","RosCategory"
                    FROM public."PatientVitals"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["preAssessmentNotes"] = GetStr(r, 1),
                        ["preAssessmentRemarks"] = GetStr(r, 2),
                        ["homeInstructions"] = GetStr(r, 3),
                        ["rosCategory"] = GetStr(r, 4)
                    }, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, vitalsActiveForShield);
        }

        return (apptToQueue, consultToQueue);
    }

    // -------------------------------------------------------------------------
    // Step 7: Prescriptions & ClinicDispensingLogs
    // -------------------------------------------------------------------------
    private async Task SyncPrescriptionsAndDispensingAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> patientNames,
        Dictionary<int, Guid> consultToQueue,
        Dictionary<int, string> systems,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        bool RunSection(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            const string sql = """
                SELECT m.id, p.id AS rx_id, p."consultationTicketId", cp."patientId", p."hpId", p."serialNumber", p.remarks AS rx_remarks,
                       m.name, m."genericName", m."brandName", m.dosage, m.frequency, m.unit, m.notes, m.duration, m.qty,
                       m."createdAt", m."updatedAt",
                       md.id AS disp_id, md."isDispensed", md."dateDispensed", md."dispensingPersonnel",
                       mp."drugCode", mp.route, mp."actualUnitPrice", mp."totalAmtPrice", mp.category,
                       ct."systemId"
                FROM public."Medicine" m
                JOIN public."Prescription" p ON p.id = m."prescriptionId"
                JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                JOIN public."ConsultationTicket" ct ON ct.id = p."consultationTicketId" AND ct."isActive" = true AND ct."clinicId" = @cid
                LEFT JOIN public."MedicineDispenseRecord" md ON md."medicineId" = m.id
                LEFT JOIN public."MedicinePhilHealthData" mp ON mp."medicineId" = m.id
                WHERE p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true
                  AND cp."patientId" = ANY(@ids)
                ORDER BY m.id ASC
                """;

            var rxCandidates = new List<ChildSyncCandidate>();
            var dispCandidates = new List<ChildSyncCandidate>();
            var rxActiveForShield = new HashSet<string>(StringComparer.Ordinal);
            var dispActiveForShield = new HashSet<string>(StringComparer.Ordinal);

            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var medId = r.GetInt32(0);
                    if (r.IsDBNull(2)) continue;
                    var ticketId = r.GetInt32(2);
                    var uid = r.GetInt32(3);
                    var v1RxId = medId.ToString(CultureInfo.InvariantCulture);
                    rxActiveForShield.Add(v1RxId);

                    var v2RxId = DeterministicUuid.SharedPrescriptionId(v2ClinicId, medId);
                    var v2ConsultId = DeterministicUuid.SharedConsultationId(v2ClinicId, ticketId);
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                    var pname = patientNames.TryGetValue(uid, out var n) ? n : "Patient";

                    var genericName = SyncTransforms.CleanRequired(GetStr(r, 8) ?? GetStr(r, 7), "Medication", 150);
                    var brandName = SyncTransforms.Clean(GetStr(r, 9), 150);
                    var dosage = SyncTransforms.CleanRequired(GetStr(r, 10), "As directed", 50);
                    var unit = SyncTransforms.CleanRequired(GetStr(r, 12), "unit", 50);
                    var freq = SyncTransforms.Clean(GetStr(r, 11), 50) ?? "As directed";
                    var notes = SyncTransforms.Clean(GetStr(r, 13)) ?? SyncTransforms.Clean(GetStr(r, 6));
                    var sig = string.Join(" ", new[] { dosage, freq, notes }.Where(x => !string.IsNullOrWhiteSpace(x)));
                    if (string.IsNullOrWhiteSpace(sig)) sig = "As directed";
                    if (sig.Length > 255) sig = sig[..255];

                    var qty = r.IsDBNull(15) ? 1 : Math.Max(1, r.GetInt32(15));
                    var durDays = r.IsDBNull(14) ? (int?)null : r.GetInt32(14);
                    var createdAt = GetUtc(r, 16) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 17) ?? createdAt;

                    var dispId = r.IsDBNull(18) ? (int?)null : r.GetInt32(18);
                    var isDispensed = !r.IsDBNull(19) && r.GetBoolean(19);
                    var dispAt = GetUtc(r, 20);
                    var dispBy = SyncTransforms.Clean(GetStr(r, 21), 150);
                    var drugCode = SyncTransforms.Clean(GetStr(r, 22), 50);
                    var route = SyncTransforms.CleanRequired(GetStr(r, 23), "Oral", 50);
                    var uprice = GetDecNullable(r, 24);
                    var tcost = GetDecNullable(r, 25);
                    var phCat = SyncTransforms.Clean(GetStr(r, 26), 50);
                    var hpId = r.IsDBNull(4) ? (int?)null : r.GetInt32(4);
                    var doc = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var c) ? c : new ClinicianSnapshot("Clinic Physician", null, null);
                    var sysId = r.IsDBNull(27) ? (int?)null : r.GetInt32(27);
                    var rosCat = sysId.HasValue && systems.TryGetValue(sysId.Value, out var sn) ? SyncTransforms.MapRosCategory(sn) : null;
                    var dispDateOnly = isDispensed && dispAt.HasValue ? DateOnly.FromDateTime(dispAt.Value.ToOffset(ManilaOffset).DateTime) : (DateOnly?)null;
                    var dispAtTs = isDispensed ? (dispAt ?? createdAt) : (DateTimeOffset?)null;
                    var dispQtyVal = isDispensed ? qty : (int?)null;

                    if (RunSection("Prescription"))
                    {
                        var rxCanonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["genericName"] = genericName,
                            ["brandName"] = brandName,
                            ["dosage"] = dosage,
                            ["sig"] = sig,
                            ["quantity"] = qty.ToString(CultureInfo.InvariantCulture),
                            ["durationDays"] = durDays?.ToString(CultureInfo.InvariantCulture),
                            ["remarks"] = notes,
                            ["philHealthDrugCode"] = drugCode,
                            ["isDispensed"] = isDispensed ? "true" : "false",
                            ["dispensedQuantity"] = dispQtyVal?.ToString(CultureInfo.InvariantCulture),
                            ["dispensedDate"] = dispDateOnly?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["dispensingPersonnel"] = dispBy,
                            ["isClinicDispensed"] = isDispensed ? "true" : "false"
                        };

                        rxCandidates.Add(new ChildSyncCandidate(v1RxId, v2RxId, null, rxCanonical, targetId =>
                        {
                            var pCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public."Prescriptions" (
                                    "Id","ConsultationEncounterId","GenericName","BrandName","Dosage","Form","Sig",
                                    "Quantity","DurationDays","Refills","DoseQuantity","IsDangerousDrug","Remarks","PhilHealthDrugCode",
                                    "Route","DoseUnit","Frequency","UnitPrice","TotalCost","PhilHealthCategory",
                                    "PrescriptionDate","PrescribingPhysicianName","PrescribingPhysicianPrcNo",
                                    "IsDispensed","DispensedQuantity","DispensedDate","DispensingPersonnel",
                                    "IsGamotCovered","IsClinicDispensed","ClinicDispensedAt","ClinicDispensedBy","ClinicDispensedQuantity",
                                    "RosCategory","CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@cidEnc,@gen,@brand,@dos,@form,@sig,
                                    @qty,@dur,0,0,false,@rem,@drugCode,
                                    @route,@unit,@freq,@uprice,@tcost,@phCat,
                                    @rxDate,@docName,@docPrc,
                                    @isDisp,@dQty,@dDate,@dBy,
                                    false,@isDisp,@dAt,@cDispBy,@cDispQty,
                                    @ros,@cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "GenericName"=EXCLUDED."GenericName","BrandName"=EXCLUDED."BrandName",
                                    "Dosage"=EXCLUDED."Dosage","Sig"=EXCLUDED."Sig",
                                    "Quantity"=EXCLUDED."Quantity","DurationDays"=EXCLUDED."DurationDays",
                                    "Remarks"=EXCLUDED."Remarks","PhilHealthDrugCode"=EXCLUDED."PhilHealthDrugCode",
                                    "IsDispensed"=EXCLUDED."IsDispensed","DispensedDate"=EXCLUDED."DispensedDate",
                                    "DispensingPersonnel"=EXCLUDED."DispensingPersonnel","DispensedQuantity"=EXCLUDED."DispensedQuantity",
                                    "IsClinicDispensed"=EXCLUDED."IsClinicDispensed","ClinicDispensedAt"=EXCLUDED."ClinicDispensedAt",
                                    "ClinicDispensedBy"=EXCLUDED."ClinicDispensedBy","ClinicDispensedQuantity"=EXCLUDED."ClinicDispensedQuantity",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            pCmd.Parameters.AddWithValue("id", targetId);
                            pCmd.Parameters.AddWithValue("cidEnc", v2ConsultId);
                            pCmd.Parameters.AddWithValue("gen", genericName);
                            pCmd.Parameters.AddWithValue("brand", (object?)brandName ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("dos", dosage);
                            pCmd.Parameters.AddWithValue("form", unit);
                            pCmd.Parameters.AddWithValue("sig", sig);
                            pCmd.Parameters.AddWithValue("qty", qty);
                            pCmd.Parameters.AddWithValue("dur", (object?)durDays ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("rem", (object?)notes ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("drugCode", (object?)drugCode ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("route", route);
                            pCmd.Parameters.AddWithValue("unit", unit);
                            pCmd.Parameters.AddWithValue("freq", freq);
                            pCmd.Parameters.AddWithValue("uprice", (object?)uprice ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("tcost", (object?)tcost ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("phCat", (object?)phCat ?? DBNull.Value);
                            pCmd.Parameters.Add(new NpgsqlParameter("rxDate", NpgsqlDbType.Date) { Value = DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime) });
                            pCmd.Parameters.AddWithValue("docName", doc.Name);
                            pCmd.Parameters.AddWithValue("docPrc", (object?)doc.PrcLicense ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("isDisp", isDispensed);
                            pCmd.Parameters.Add(new NpgsqlParameter("dQty", NpgsqlDbType.Integer) { Value = (object?)dispQtyVal ?? DBNull.Value });
                            pCmd.Parameters.Add(new NpgsqlParameter("dDate", NpgsqlDbType.Date) { Value = (object?)dispDateOnly ?? DBNull.Value });
                            pCmd.Parameters.Add(new NpgsqlParameter("dAt", NpgsqlDbType.TimestampTz) { Value = (object?)dispAtTs ?? DBNull.Value });
                            pCmd.Parameters.Add(new NpgsqlParameter("dBy", NpgsqlDbType.Text) { Value = (object?)dispBy ?? DBNull.Value });
                            pCmd.Parameters.Add(new NpgsqlParameter("cDispBy", NpgsqlDbType.Varchar) { Value = (object?)dispBy ?? DBNull.Value });
                            pCmd.Parameters.Add(new NpgsqlParameter("cDispQty", NpgsqlDbType.Integer) { Value = (object?)dispQtyVal ?? DBNull.Value });
                            pCmd.Parameters.AddWithValue("ros", (object?)rosCat ?? DBNull.Value);
                            pCmd.Parameters.AddWithValue("cat", createdAt);
                            pCmd.Parameters.AddWithValue("uat", updatedAt);
                            pCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            pCmd.Parameters.AddWithValue("tid", v2TenantId);
                            pCmd.Parameters.AddWithValue("cid", v2ClinicId);
                            return pCmd;
                        }));
                    }

                    if (RunSection("ClinicDispensingLog") && dispId.HasValue && isDispensed && consultToQueue.TryGetValue(ticketId, out var qId))
                    {
                        var v1DispId = dispId.Value.ToString(CultureInfo.InvariantCulture);
                        dispActiveForShield.Add(v1DispId);
                        var v2DispId = DeterministicUuid.SharedDispensingLogId(v2ClinicId, dispId.Value);
                        var dispByEff = dispBy ?? "Clinic Staff";
                        var dispAtEff = dispAt ?? createdAt;

                        var dispCanonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["itemName"] = genericName,
                            ["quantityDispensed"] = qty.ToString(CultureInfo.InvariantCulture),
                            ["dispensedByStaffName"] = dispByEff,
                            ["dispensedAt"] = dispAtEff.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)
                        };

                        dispCandidates.Add(new ChildSyncCandidate(v1DispId, v2DispId, null, dispCanonical, targetId =>
                        {
                            var dCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public."ClinicDispensingLogs" (
                                    "Id","PatientId","PatientName","QueueItemId","Source","ConsultationEncounterId","PrescriptionItemId",
                                    "ItemName","ItemCategory","DosageOrSpec","FormOrUnit","QuantityDispensed","DirectionsOrInstructions",
                                    "RosCategory","IsConsultationValidated","DispensedByStaffName","DispensedByRole","DispensedAt",
                                    "RequiresDoctorReview","InterventionFlagged",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@pid,@pname,@qid,'DoctorConsultation',@cidEnc,@rxId,
                                    @iname,'Medicine',@dos,@form,@qty,@sig,
                                    @ros,true,@dby,'ClinicStaff',@dat,
                                    false,false,
                                    @cat,@actor,@uat,@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "Source"='DoctorConsultation',"ItemCategory"='Medicine',
                                    "QuantityDispensed"=EXCLUDED."QuantityDispensed","DispensedAt"=EXCLUDED."DispensedAt",
                                    "DispensedByStaffName"=EXCLUDED."DispensedByStaffName",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            dCmd.Parameters.AddWithValue("id", targetId);
                            dCmd.Parameters.AddWithValue("pid", v2Pid);
                            dCmd.Parameters.AddWithValue("pname", pname);
                            dCmd.Parameters.AddWithValue("qid", qId);
                            dCmd.Parameters.AddWithValue("cidEnc", v2ConsultId);
                            dCmd.Parameters.AddWithValue("rxId", v2RxId);
                            dCmd.Parameters.AddWithValue("iname", genericName);
                            dCmd.Parameters.AddWithValue("dos", dosage);
                            dCmd.Parameters.AddWithValue("form", unit);
                            dCmd.Parameters.AddWithValue("qty", qty);
                            dCmd.Parameters.AddWithValue("sig", sig);
                            dCmd.Parameters.AddWithValue("ros", (object?)rosCat ?? "General");
                            dCmd.Parameters.AddWithValue("dby", dispByEff);
                            dCmd.Parameters.AddWithValue("dat", dispAtEff);
                            dCmd.Parameters.AddWithValue("cat", createdAt);
                            dCmd.Parameters.AddWithValue("uat", updatedAt);
                            dCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            dCmd.Parameters.AddWithValue("tid", v2TenantId);
                            dCmd.Parameters.AddWithValue("cid", v2ClinicId);
                            return dCmd;
                        }));
                    }
                }
            }

            if (RunSection("Prescription"))
            {
                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "Prescription", v2Pids, rxCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","GenericName","BrandName","Dosage","Sig","Quantity","DurationDays",
                               "Remarks","PhilHealthDrugCode","IsDispensed","DispensedQuantity","DispensedDate","DispensingPersonnel","IsClinicDispensed"
                        FROM public."Prescriptions"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["genericName"] = GetStr(r, 1),
                            ["brandName"] = GetStr(r, 2),
                            ["dosage"] = GetStr(r, 3),
                            ["sig"] = GetStr(r, 4),
                            ["quantity"] = r.GetInt32(5).ToString(CultureInfo.InvariantCulture),
                            ["durationDays"] = r.IsDBNull(6) ? null : r.GetInt32(6).ToString(CultureInfo.InvariantCulture),
                            ["remarks"] = GetStr(r, 7),
                            ["philHealthDrugCode"] = GetStr(r, 8),
                            ["isDispensed"] = r.GetBoolean(9) ? "true" : "false",
                            ["dispensedQuantity"] = r.IsDBNull(10) ? null : r.GetInt32(10).ToString(CultureInfo.InvariantCulture),
                            ["dispensedDate"] = r.IsDBNull(11) ? null : r.GetFieldValue<DateOnly>(11).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                            ["dispensingPersonnel"] = GetStr(r, 12),
                            ["isClinicDispensed"] = r.GetBoolean(13) ? "true" : "false"
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, rxActiveForShield);
            }

            if (RunSection("ClinicDispensingLog"))
            {
                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "ClinicDispensingLog", v2Pids, dispCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","ItemName","QuantityDispensed","DispensedByStaffName","DispensedAt"
                        FROM public."ClinicDispensingLogs"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["itemName"] = GetStr(r, 1),
                            ["quantityDispensed"] = r.GetInt32(2).ToString(CultureInfo.InvariantCulture),
                            ["dispensedByStaffName"] = GetStr(r, 3),
                            ["dispensedAt"] = (GetUtc(r, 4) ?? DateTimeOffset.MinValue).UtcDateTime.ToString("O", CultureInfo.InvariantCulture)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, dispActiveForShield);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Step 8: Unified Lab + Imaging + HeartStation Orders & Items
    // -------------------------------------------------------------------------
    private async Task SyncDiagnosticOrdersAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> patientNames,
        Dictionary<int, Guid> consultToQueue,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetEntityTypeFilter = null,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        bool RunSection(string et) => targetEntityTypeFilter is null || string.Equals(targetEntityTypeFilter, et, StringComparison.OrdinalIgnoreCase);

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            // Unified query across Lab, Imaging, and HeartStation requests
            const string orderSql = """
                SELECT 'lab' AS kind, r.id, cp."patientId", r."consultationTicketId", r."hpId", r."serialNumber", r.impression, NULL::text AS notes, r."createdAt", r."updatedAt"
                FROM public."ClinicLaboratoryRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                UNION ALL
                SELECT 'img' AS kind, r.id, cp."patientId", r."consultationTicketId", r."hpId", r."serialNumber", r.impression, COALESCE(r.reason, r.history), r."createdAt", r."updatedAt"
                FROM public."ClinicImagingRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                UNION ALL
                SELECT 'ecg' AS kind, r.id, cp."patientId", r."consultationTicketId", r."hpId", r."serialNumber", r.impression, COALESCE(r.reason, r.history), r."createdAt", r."updatedAt"
                FROM public."ClinicHeartStationRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                """;

            var rawOrderRows = new List<(string Kind, int ReqId, int Uid, int? TicketId, int? HpId, string OrderNum, string? Diag, string? Notes, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)>();
            await using (var cmd = new NpgsqlCommand(orderSql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var kind = r.GetString(0);
                    var reqId = r.GetInt32(1);
                    var uid = r.GetInt32(2);
                    var ticketId = r.IsDBNull(3) ? (int?)null : r.GetInt32(3);
                    var hpId = r.IsDBNull(4) ? (int?)null : r.GetInt32(4);
                    var serial = SyncTransforms.Clean(GetStr(r, 5));
                    var diag = SyncTransforms.Clean(GetStr(r, 6));
                    var notes = string.Join(" | ", new[] { serial is not null ? $"Legacy Serial: {serial}" : null, SyncTransforms.Clean(GetStr(r, 7)) }.Where(x => x is not null));
                    var createdAt = GetUtc(r, 8) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 9) ?? createdAt;
                    var orderNum = $"V1-{kind.ToUpperInvariant()}-{reqId}";
                    rawOrderRows.Add((kind, reqId, uid, ticketId, hpId, orderNum, diag, string.IsNullOrEmpty(notes) ? null : notes, createdAt, updatedAt));
                }
            }

            if (RunSection("LabOrder"))
            {
                var orderNumOwners = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
                if (rawOrderRows.Count > 0)
                {
                    await using var onCmd = new NpgsqlCommand("""
                        SELECT "OrderNumber", "Id"
                        FROM public."LabOrders"
                        WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false
                          AND "OrderNumber" = ANY(@onums)
                        """, v2);
                    onCmd.Parameters.AddWithValue("tid", v2TenantId);
                    onCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    onCmd.Parameters.AddWithValue("onums", rawOrderRows.Select(x => x.OrderNum).Distinct().ToArray());
                    await using var onr = await onCmd.ExecuteReaderAsync(ct);
                    while (await onr.ReadAsync(ct)) orderNumOwners[onr.GetString(0)] = onr.GetGuid(1);
                }

                var orderCandidates = new List<ChildSyncCandidate>();
                var orderActiveForShield = new HashSet<string>(StringComparer.Ordinal);
                foreach (var row in rawOrderRows)
                {
                    var v1Key = $"{row.Kind}:{row.ReqId}";
                    orderActiveForShield.Add(v1Key);
                    var v2OrderId = DeterministicUuid.SharedLabOrderId(v2ClinicId, row.Kind, row.ReqId);
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, row.Uid);
                    Guid? v2ConsultId = row.TicketId.HasValue && consultToQueue.ContainsKey(row.TicketId.Value)
                        ? DeterministicUuid.SharedConsultationId(v2ClinicId, row.TicketId.Value) : null;
                    Guid? v2QueueId = row.TicketId.HasValue && consultToQueue.TryGetValue(row.TicketId.Value, out var q) ? q : null;
                    var doc = row.HpId.HasValue && clinicians.TryGetValue(row.HpId.Value, out var c) ? c : new ClinicianSnapshot("Clinic Physician", null, null);

                    var orderNum = row.OrderNum;
                    if (orderNumOwners.TryGetValue(orderNum, out var ownerId) && ownerId != v2OrderId)
                    {
                        orderNum = $"{orderNum}-{v2OrderId.ToString("N")[..4]}";
                    }

                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["orderNumber"] = orderNum,
                        ["clinicalDiagnosis"] = row.Diag,
                        ["notes"] = row.Notes,
                        ["stage"] = "Issued"
                    };

                    orderCandidates.Add(new ChildSyncCandidate(v1Key, v2OrderId, null, canonical, targetId =>
                    {
                        var oCmd = new NpgsqlBatchCommand("""
                            INSERT INTO public."LabOrders" (
                                "Id","OrderNumber","PatientId","PatientName","ConsultationId","QueueItemId",
                                "OrderedByDoctorName","RequestingPhysicianName","RequestingPhysicianPrcNo",
                                "OrderDate","Status","ClinicalDiagnosis","Notes","Stage","StageChangedAt","PaymentRequired","HasCriticalPanicAlert","IsSigned",
                                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                            ) VALUES (
                                @id,@onum,@pid,@pname,@cidEnc,@qid,
                                @dname,@dname,@dprc,
                                @odate,'Completed',@diag,@notes,'Issued',@cat,false,false,true,
                                @cat,@actor,@uat,@actor,false,@tid,@cid
                            ) ON CONFLICT ("Id") DO UPDATE SET
                                "ClinicalDiagnosis"=EXCLUDED."ClinicalDiagnosis","Notes"=EXCLUDED."Notes",
                                "Stage"='Issued',"UpdatedAt"=now(),"UpdatedBy"=@actor
                            """);
                        oCmd.Parameters.AddWithValue("id", targetId);
                        oCmd.Parameters.AddWithValue("onum", orderNum);
                        oCmd.Parameters.AddWithValue("pid", v2Pid);
                        oCmd.Parameters.AddWithValue("pname", patientNames.TryGetValue(row.Uid, out var pn) ? pn : "Patient");
                        oCmd.Parameters.AddWithValue("cidEnc", (object?)v2ConsultId ?? DBNull.Value);
                        oCmd.Parameters.AddWithValue("qid", (object?)v2QueueId ?? DBNull.Value);
                        oCmd.Parameters.AddWithValue("dname", doc.Name);
                        oCmd.Parameters.AddWithValue("dprc", (object?)doc.PrcLicense ?? DBNull.Value);
                        oCmd.Parameters.AddWithValue("odate", row.CreatedAt);
                        oCmd.Parameters.AddWithValue("diag", (object?)row.Diag ?? DBNull.Value);
                        oCmd.Parameters.AddWithValue("notes", (object?)row.Notes ?? DBNull.Value);
                        oCmd.Parameters.AddWithValue("cat", row.CreatedAt);
                        oCmd.Parameters.AddWithValue("uat", row.UpdatedAt);
                        oCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        oCmd.Parameters.AddWithValue("tid", v2TenantId);
                        oCmd.Parameters.AddWithValue("cid", v2ClinicId);
                        return oCmd;
                    }));
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "LabOrder", v2Pids, orderCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","OrderNumber","ClinicalDiagnosis","Notes","Stage"
                        FROM public."LabOrders"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["orderNumber"] = GetStr(r, 1),
                            ["clinicalDiagnosis"] = GetStr(r, 2),
                            ["notes"] = GetStr(r, 3),
                            ["stage"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, orderActiveForShield);
            }

            if (RunSection("LabOrderItem"))
            {
                const string itemSql = """
                    SELECT 'lab' AS kind, rp.id, r.id AS req_id, COALESCE(p.name, 'Laboratory Test'), COALESCE(p.category, 'Laboratory'), p."rvsCode", NULL::text
                    FROM public."ClinicLaboratoryRequestProcedure" rp
                    JOIN public."ClinicLaboratoryRequest" r ON r.id = rp."clinicLaboratoryRequestId"
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    LEFT JOIN public."ClinicLaboratoryProcedure" p ON p.id = rp."clinicLaboratoryProcedureId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    UNION ALL
                    SELECT 'img' AS kind, rp.id, r.id AS req_id, COALESCE(p.name, 'Imaging Study'), COALESCE(p.category, 'Imaging'), p."rvsCode", concat_ws(' - ', rp."bodyPart", rp.notes)
                    FROM public."ClinicImagingRequestProcedure" rp
                    JOIN public."ClinicImagingRequest" r ON r.id = rp."clinicImagingRequestId"
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    LEFT JOIN public."ClinicImagingProcedure" p ON p.id = rp."clinicImagingProcedureId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    UNION ALL
                    SELECT 'ecg' AS kind, rp.id, r.id AS req_id, COALESCE(p.name, 'Cardiology / ECG'), COALESCE(p.category, 'Cardiology'), p."rvsCode", NULL::text
                    FROM public."ClinicHeartStationRequestProcedure" rp
                    JOIN public."ClinicHeartStationRequest" r ON r.id = rp."clinicHeartStationRequestId"
                    JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                    LEFT JOIN public."ClinicHeartStationProcedure" p ON p.id = rp."clinicHeartStationProcedureId"
                    WHERE r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true AND cp."patientId" = ANY(@ids)
                    """;

                var itemCandidates = new List<ChildSyncCandidate>();
                var itemActiveForShield = new HashSet<string>(StringComparer.Ordinal);
                await using (var cmd = new NpgsqlCommand(itemSql, v1))
                {
                    cmd.Parameters.AddWithValue("cid", v1ClinicId);
                    cmd.Parameters.AddWithValue("ids", ids);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var kind = r.GetString(0);
                        var rpId = r.GetInt32(1);
                        var reqId = r.GetInt32(2);
                        var v1Key = $"{kind}:{rpId}";
                        itemActiveForShield.Add(v1Key);
                        var v2ItemId = DeterministicUuid.SharedLabOrderItemId(v2ClinicId, kind, rpId);
                        var v2OrderId = DeterministicUuid.SharedLabOrderId(v2ClinicId, kind, reqId);
                        var testName = SyncTransforms.CleanRequired(GetStr(r, 3), "Diagnostic Procedure", 150);
                        var category = SyncTransforms.CleanRequired(GetStr(r, 4), "Laboratory", 50);
                        var inst = SyncTransforms.Clean(GetStr(r, 6));
                        var tcode = SyncTransforms.Clean(GetStr(r, 5), 20);

                        var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["testName"] = testName,
                            ["category"] = category,
                            ["instructions"] = inst,
                            ["testCode"] = tcode
                        };

                        itemCandidates.Add(new ChildSyncCandidate(v1Key, v2ItemId, null, canonical, targetId =>
                        {
                            var iCmd = new NpgsqlBatchCommand("""
                                INSERT INTO public."LabOrderItems" (
                                    "Id","LabOrderId","TestName","Category","Instructions","Status","TestCode",
                                    "IsPhysicianRecommended","IsDoneOutsideFacility",
                                    "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                                ) VALUES (
                                    @id,@oid,@tname,@catName,@inst,'Completed',@tcode,
                                    true,false,
                                    now(),@actor,now(),@actor,false,@tid,@cid
                                ) ON CONFLICT ("Id") DO UPDATE SET
                                    "TestName"=EXCLUDED."TestName","Instructions"=EXCLUDED."Instructions","TestCode"=EXCLUDED."TestCode",
                                    "UpdatedAt"=now(),"UpdatedBy"=@actor
                                """);
                            iCmd.Parameters.AddWithValue("id", targetId);
                            iCmd.Parameters.AddWithValue("oid", v2OrderId);
                            iCmd.Parameters.AddWithValue("tname", testName);
                            iCmd.Parameters.AddWithValue("catName", category);
                            iCmd.Parameters.AddWithValue("inst", (object?)inst ?? DBNull.Value);
                            iCmd.Parameters.AddWithValue("tcode", (object?)tcode ?? DBNull.Value);
                            iCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                            iCmd.Parameters.AddWithValue("tid", v2TenantId);
                            iCmd.Parameters.AddWithValue("cid", v2ClinicId);
                            return iCmd;
                        }));
                    }
                }

                await ExecuteChildSyncBatchAsync(
                    v2, binding, runId, "LabOrderItem", v2Pids, itemCandidates,
                    targetIds => LoadStringMapRowsAsync(v2, """
                        SELECT "Id","TestName","Category","Instructions","TestCode"
                        FROM public."LabOrderItems"
                        WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                        """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                        {
                            ["testName"] = GetStr(r, 1),
                            ["category"] = GetStr(r, 2),
                            ["instructions"] = GetStr(r, 3),
                            ["testCode"] = GetStr(r, 4)
                        }, ct),
                    isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, itemActiveForShield);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Step 9: Medical Certificates
    // -------------------------------------------------------------------------
    private async Task SyncMedicalCertificatesAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> patientNames,
        Dictionary<int, Guid> consultToQueue,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            const string sql = """
                SELECT mc.id, cp."patientId", mc."consultationTicketId", mc."hpId", mc."serialNumber",
                       mc.impression, mc.remarks, mc."createdAt", mc."updatedAt",
                       mr.name AS reason_name, mf.name AS finding_name, mcl.name AS class_name
                FROM public."ClinicMedicalCertificate" mc
                JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId"
                LEFT JOIN public."MedicalCertificateReason" mr ON mr.id = mc."reasonId"
                LEFT JOIN public."MedicalCertificateFinding" mf ON mf.id = mc."findingId"
                LEFT JOIN public."MedicalCertificateClassification" mcl ON mcl.id = mc."classificationId"
                WHERE mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true
                  AND cp."patientId" = ANY(@ids)
                ORDER BY mc.id ASC
                """;

            var rawMcRows = new List<(
                int McId, int Uid, int? TicketId, int? HpId, string CertNum,
                string Diagnosis, string? Findings, string Purpose, string Fitness, string? Remarks,
                DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateOnly IssueDate)>();

            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var mcId = r.GetInt32(0);
                    var uid = r.GetInt32(1);
                    var ticketId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                    var hpId = r.IsDBNull(3) ? (int?)null : r.GetInt32(3);
                    var serial = SyncTransforms.Clean(GetStr(r, 4), 40);
                    var certNum = serial is not null ? $"{serial}-V1-{mcId}" : $"V1-MC-{mcId:D6}";
                    if (certNum.Length > 50) certNum = $"V1-MC-{mcId:D6}";

                    var createdAt = GetUtc(r, 7) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 8) ?? createdAt;
                    var issueDate = DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime);
                    var diagnosis = SyncTransforms.CleanRequired(GetStr(r, 5), "Medical Evaluation", 1000);
                    var findings = SyncTransforms.Clean(GetStr(r, 10));
                    var rawReason = SyncTransforms.Clean(GetStr(r, 9));
                    var purpose = SyncTransforms.CleanRequired(rawReason, "Medical Clearance", 50);
                    var fitness = SyncTransforms.MapFitnessStatus(GetStr(r, 11));
                    var rawRemarks = SyncTransforms.Clean(GetStr(r, 6));
                    string? remarks = rawRemarks;
                    if (rawReason is not null && rawReason.Length > 50)
                    {
                        remarks = rawRemarks is not null
                            ? $"Reason: {rawReason}\n{rawRemarks}"
                            : $"Reason: {rawReason}";
                    }

                    rawMcRows.Add((mcId, uid, ticketId, hpId, certNum, diagnosis, findings, purpose, fitness, remarks, createdAt, updatedAt, issueDate));
                }
            }

            var certNumOwners = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            if (rawMcRows.Count > 0)
            {
                await using var cnCmd = new NpgsqlCommand("""
                    SELECT "CertificateNumber", "Id"
                    FROM public."MedicalCertificates"
                    WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false
                      AND "CertificateNumber" = ANY(@cnums)
                    """, v2);
                cnCmd.Parameters.AddWithValue("tid", v2TenantId);
                cnCmd.Parameters.AddWithValue("cid", v2ClinicId);
                cnCmd.Parameters.AddWithValue("cnums", rawMcRows.Select(x => x.CertNum).Distinct().ToArray());
                await using var cnr = await cnCmd.ExecuteReaderAsync(ct);
                while (await cnr.ReadAsync(ct)) certNumOwners[cnr.GetString(0)] = cnr.GetGuid(1);
            }

            var mcCandidates = new List<ChildSyncCandidate>();
            var mcActiveForShield = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in rawMcRows)
            {
                var v1IdStr = row.McId.ToString(CultureInfo.InvariantCulture);
                mcActiveForShield.Add(v1IdStr);
                var v2McId = DeterministicUuid.SharedMedicalCertificateId(v2ClinicId, row.McId);
                var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, row.Uid);
                Guid? v2ConsultId = row.TicketId.HasValue && consultToQueue.ContainsKey(row.TicketId.Value)
                    ? DeterministicUuid.SharedConsultationId(v2ClinicId, row.TicketId.Value) : null;
                Guid? v2QueueId = row.TicketId.HasValue && consultToQueue.TryGetValue(row.TicketId.Value, out var q) ? q : null;
                var doc = row.HpId.HasValue && clinicians.TryGetValue(row.HpId.Value, out var c) ? c : new ClinicianSnapshot("Clinic Physician", null, null);
                var docId = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"v1_hp:{row.HpId ?? 0}");

                var certNum = row.CertNum;
                if (certNumOwners.TryGetValue(certNum, out var ownerId) && ownerId != v2McId)
                {
                    certNum = $"V1-MC-{row.McId}-{v2McId.ToString("N")[..4]}";
                    if (certNum.Length > 50) certNum = certNum[..50];
                }

                var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["certificateNumber"] = certNum,
                    ["diagnosis"] = row.Diagnosis,
                    ["clinicalFindings"] = row.Findings,
                    ["fitnessStatus"] = row.Fitness,
                    ["purpose"] = row.Purpose,
                    ["remarks"] = row.Remarks
                };

                mcCandidates.Add(new ChildSyncCandidate(v1IdStr, v2McId, null, canonical, targetId =>
                {
                    var mCmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."MedicalCertificates" (
                            "Id","CertificateNumber","PatientId","PatientName","ConsultationId","QueueItemId",
                            "DoctorId","DoctorName","PrcLicenseNumber","PtrNumber","IssueDate",
                            "Diagnosis","ClinicalFindings","FitnessStatus","Purpose","Remarks",
                            "IsSigned","SignedAt","SecurityDigest",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @id,@cnum,@pid,@pname,@cidEnc,@qid,
                            @did,@dname,@dprc,@dptr,@idate,
                            @diag,@find,@fit,@purp,@rem,
                            true,@cat,@dig,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "Diagnosis"=EXCLUDED."Diagnosis","ClinicalFindings"=EXCLUDED."ClinicalFindings",
                            "FitnessStatus"=EXCLUDED."FitnessStatus","Purpose"=EXCLUDED."Purpose",
                            "Remarks"=EXCLUDED."Remarks","UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    mCmd.Parameters.AddWithValue("id", targetId);
                    mCmd.Parameters.AddWithValue("cnum", certNum);
                    mCmd.Parameters.AddWithValue("pid", v2Pid);
                    mCmd.Parameters.AddWithValue("pname", patientNames.TryGetValue(row.Uid, out var pn) ? pn : "Patient");
                    mCmd.Parameters.AddWithValue("cidEnc", (object?)v2ConsultId ?? DBNull.Value);
                    mCmd.Parameters.AddWithValue("qid", (object?)v2QueueId ?? DBNull.Value);
                    mCmd.Parameters.AddWithValue("did", docId);
                    mCmd.Parameters.AddWithValue("dname", doc.Name);
                    mCmd.Parameters.AddWithValue("dprc", doc.PrcLicense ?? "LEGACY-V1");
                    mCmd.Parameters.AddWithValue("dptr", (object?)doc.PtrNumber ?? DBNull.Value);
                    mCmd.Parameters.Add(new NpgsqlParameter("idate", NpgsqlDbType.Date) { Value = row.IssueDate });
                    mCmd.Parameters.AddWithValue("diag", row.Diagnosis);
                    mCmd.Parameters.AddWithValue("find", (object?)row.Findings ?? DBNull.Value);
                    mCmd.Parameters.AddWithValue("fit", row.Fitness);
                    mCmd.Parameters.AddWithValue("purp", row.Purpose);
                    mCmd.Parameters.AddWithValue("rem", (object?)row.Remarks ?? DBNull.Value);
                    mCmd.Parameters.AddWithValue("dig", DeterministicUuid.ComputeCanonicalHash(new Dictionary<string, string?> { ["mc"] = row.McId.ToString(CultureInfo.InvariantCulture) }));
                    mCmd.Parameters.AddWithValue("cat", row.CreatedAt);
                    mCmd.Parameters.AddWithValue("uat", row.UpdatedAt);
                    mCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    mCmd.Parameters.AddWithValue("tid", v2TenantId);
                    mCmd.Parameters.AddWithValue("cid", v2ClinicId);
                    return mCmd;
                }));
            }

            await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "MedicalCertificate", v2Pids, mcCandidates,
                targetIds => LoadStringMapRowsAsync(v2, """
                    SELECT "Id","CertificateNumber","Diagnosis","ClinicalFindings","FitnessStatus","Purpose","Remarks"
                    FROM public."MedicalCertificates"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["certificateNumber"] = GetStr(r, 1),
                        ["diagnosis"] = GetStr(r, 2),
                        ["clinicalFindings"] = GetStr(r, 3),
                        ["fitnessStatus"] = GetStr(r, 4),
                        ["purpose"] = GetStr(r, 5),
                        ["remarks"] = GetStr(r, 6)
                    }, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, mcActiveForShield);
        }
    }

    // -------------------------------------------------------------------------
    // Step 10: Clinic/Org Non-Private RecordAttachments (STRICTLY EXCLUDES PRIVATE!)
    // -------------------------------------------------------------------------
    private async Task SyncClinicRecordAttachmentsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, string> fileTypes,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v1OrgId = binding.V1OrgId;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        var hasClinicOrgTable = await TableExistsAsync(v1, "ClinicOrganization", ct);
        var hasApptAttTable = await TableExistsAsync(v1, "AppointmentAttachment", ct);
        var hasFolderActiveCols = await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                  await ColumnExistsAsync(v1, "Folder", "isActive", ct);

        var omrfFilter = hasClinicOrgTable
            ? """
              JOIN public."ClinicOrganization" co ON co."organizationId" = om."organizationId"
              WHERE omrf."fileId" = f.id
                AND om."organizationId" = @oid
                AND co."clinicId" = @cid
                AND (
                    fs.privacy::text = 'PUBLIC'
                    OR NOT EXISTS (
                        SELECT 1 FROM public."ClinicOrganization" co2
                        WHERE co2."organizationId" = om."organizationId" AND co2."clinicId" <> @cid
                    )
                )
              """
            : """
              WHERE omrf."fileId" = f.id AND om."organizationId" = @oid
              """;

        var folderActiveFilter = hasFolderActiveCols
            ? """AND (f."folderId" IS NULL OR (fo.id IS NOT NULL AND fo."deletedAt" IS NULL AND fo."isActive" = true))"""
            : string.Empty;

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();
            var attCandidates = new List<ChildSyncCandidate>();
            var attActiveForShield = new HashSet<string>(StringComparer.Ordinal);

            // Strict privacy boundary: ONLY files explicitly shared with Clinic or submitted as Org requirement files for that clinic,
            // AND NEVER FileSetting.privacy = 'PRIVATE' OR FolderSetting.privacy = 'PRIVATE', nor files in deleted/inactive Folders.
            var sql = $"""
                SELECT DISTINCT f.id, fo."userId", f."fileTypeId", f.name, f.size, f.url, f."mimeType", f."dateTaken", f."createdAt", f."updatedAt"
                FROM public."File" f
                LEFT JOIN public."Folder" fo ON fo.id = f."folderId"
                LEFT JOIN public."FileSetting" fs ON fs."fileId" = f.id
                LEFT JOIN public."FolderSetting" fos ON fos."folderId" = fo.id
                WHERE f."isActive" = true AND f."deletedAt" IS NULL
                  {folderActiveFilter}
                  AND f.url IS NOT NULL AND trim(f.url) <> ''
                  AND fo."userId" = ANY(@ids)
                  AND COALESCE(fs.privacy::text, 'PRIVATE') <> 'PRIVATE'
                  AND COALESCE(fos.privacy::text, 'CLINIC') <> 'PRIVATE'
                  AND (
                      fs."scopeClinicId" = @cid
                      OR fos."scopeClinicId" = @cid
                      OR EXISTS (SELECT 1 FROM public."FileClinicShare" fcs WHERE fcs."fileSettingId" = fs.id AND fcs."clinicId" = @cid)
                      OR EXISTS (SELECT 1 FROM public."FolderClinicShare" flcs WHERE flcs."folderSettingId" = fos.id AND flcs."clinicId" = @cid)
                      OR (@oid IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public."OrgMemberRequirementFile" omrf
                          JOIN public."OrganizationMember" om ON om.id = omrf."orgMemberId"
                          {omrfFilter}
                      ))
                  )
                ORDER BY f.id ASC
                """;

            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("ids", ids);
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)v1OrgId ?? DBNull.Value });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var fileId = r.GetInt32(0);
                    var uid = r.GetInt32(1);
                    var ftId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                    var ftName = ftId.HasValue && fileTypes.TryGetValue(ftId.Value, out var n) ? n : null;
                    var v2AttId = DeterministicUuid.ClinicAttachmentFromFileId(v2ClinicId, fileId);
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                    var fname = SyncTransforms.CleanRequired(GetStr(r, 3), $"file-{fileId}", 255);
                    var url = SyncTransforms.CleanRequired(GetStr(r, 5), "", 2000);
                    if (string.IsNullOrEmpty(url)) continue;

                    var v1Key = $"file:{fileId}";
                    attActiveForShield.Add(v1Key);
                    var rtype = SyncTransforms.MapClinicRecordAttachmentType(ftName);
                    var titleRaw = ftName is not null ? $"{ftName}: {fname}" : fname;
                    var title = titleRaw.Length > 200 ? titleRaw[..200] : titleRaw;
                    var ctype = SyncTransforms.CleanRequired(GetStr(r, 6), "application/octet-stream", 100);
                    var fsize = r.IsDBNull(4) ? 0L : Math.Max(0L, r.GetInt64(4));
                    var createdAt = GetUtc(r, 8) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 9) ?? createdAt;
                    var docDate = DateOnly.FromDateTime((GetUtc(r, 7) ?? createdAt).ToOffset(ManilaOffset).DateTime);

                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["recordType"] = rtype,
                        ["title"] = title,
                        ["fileName"] = fname,
                        ["contentType"] = ctype,
                        ["storageUri"] = url
                    };

                    attCandidates.Add(new ChildSyncCandidate(v1Key, v2AttId, null, canonical, targetId =>
                    {
                        var aCmd = new NpgsqlBatchCommand("""
                            INSERT INTO public."RecordAttachments" (
                                "Id","PatientId","RecordType","Title","FileName","ContentType","FileSizeBytes",
                                "StorageUri","DocumentDate","VerificationStatus","EncryptionAlgorithm",
                                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                            ) VALUES (
                                @id,@pid,@rtype,@title,@fname,@ctype,@fsize,
                                @uri,@ddate,'Verified','NONE',
                                @cat,@actor,@uat,@actor,false,@tid,@cid
                            ) ON CONFLICT ("Id") DO UPDATE SET
                                "RecordType"=EXCLUDED."RecordType","Title"=EXCLUDED."Title","FileName"=EXCLUDED."FileName",
                                "ContentType"=CASE WHEN COALESCE(public."RecordAttachments"."EncryptionAlgorithm", 'NONE') = 'NONE' THEN EXCLUDED."ContentType" ELSE public."RecordAttachments"."ContentType" END,
                                "StorageUri"=CASE WHEN COALESCE(public."RecordAttachments"."EncryptionAlgorithm", 'NONE') = 'NONE' THEN EXCLUDED."StorageUri" ELSE public."RecordAttachments"."StorageUri" END,
                                "UpdatedAt"=now(),"UpdatedBy"=@actor
                            """);
                        aCmd.Parameters.AddWithValue("id", targetId);
                        aCmd.Parameters.AddWithValue("pid", v2Pid);
                        aCmd.Parameters.AddWithValue("rtype", rtype);
                        aCmd.Parameters.AddWithValue("title", title);
                        aCmd.Parameters.AddWithValue("fname", fname);
                        aCmd.Parameters.AddWithValue("ctype", ctype);
                        aCmd.Parameters.AddWithValue("fsize", fsize);
                        aCmd.Parameters.AddWithValue("uri", url);
                        aCmd.Parameters.Add(new NpgsqlParameter("ddate", NpgsqlDbType.Date) { Value = docDate });
                        aCmd.Parameters.AddWithValue("cat", createdAt);
                        aCmd.Parameters.AddWithValue("uat", updatedAt);
                        aCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        aCmd.Parameters.AddWithValue("tid", v2TenantId);
                        aCmd.Parameters.AddWithValue("cid", v2ClinicId);
                        return aCmd;
                    }));
                }
            }

            if (hasApptAttTable)
            {
                const string apptAttSql = """
                    SELECT aa.id, ar."userId", aa.name, aa.url, a."createdAt"
                    FROM public."AppointmentAttachment" aa
                    JOIN public."Appointment" a ON a.id = aa."appointmentId"
                    JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id
                    WHERE a."clinicId" = @cid AND a."deletedAt" IS NULL AND ar."userId" = ANY(@ids)
                      AND aa.url IS NOT NULL AND trim(aa.url) <> ''
                    """;
                await using var cmd = new NpgsqlCommand(apptAttSql, v1);
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var aaId = r.GetInt32(0);
                    var uid = r.GetInt32(1);
                    var v2AttId = DeterministicUuid.ClinicAttachmentFromApptAttachmentId(v2ClinicId, aaId);
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                    var fname = SyncTransforms.CleanRequired(GetStr(r, 2), $"appointment-attachment-{aaId}", 255);
                    var title = fname.Length > 200 ? fname[..200] : fname;
                    var url = SyncTransforms.CleanRequired(GetStr(r, 3), "", 2000);
                    if (string.IsNullOrEmpty(url)) continue;
                    var createdAt = GetUtc(r, 4) ?? DateTimeOffset.UtcNow;
                    var v1Key = $"appt_att:{aaId}";
                    attActiveForShield.Add(v1Key);

                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["recordType"] = "Other",
                        ["title"] = title,
                        ["fileName"] = fname,
                        ["contentType"] = "application/octet-stream",
                        ["storageUri"] = url
                    };

                    attCandidates.Add(new ChildSyncCandidate(v1Key, v2AttId, null, canonical, targetId =>
                    {
                        var aCmd = new NpgsqlBatchCommand("""
                            INSERT INTO public."RecordAttachments" (
                                "Id","PatientId","RecordType","Title","FileName","ContentType","FileSizeBytes",
                                "StorageUri","DocumentDate","VerificationStatus","EncryptionAlgorithm",
                                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                            ) VALUES (
                                @id,@pid,'Other',@title,@fname,'application/octet-stream',0,
                                @uri,@ddate,'Verified','NONE',
                                @cat,@actor,@cat,@actor,false,@tid,@cid
                            ) ON CONFLICT ("Id") DO UPDATE SET
                                "Title"=EXCLUDED."Title","FileName"=EXCLUDED."FileName",
                                "StorageUri"=CASE WHEN COALESCE(public."RecordAttachments"."EncryptionAlgorithm", 'NONE') = 'NONE' THEN EXCLUDED."StorageUri" ELSE public."RecordAttachments"."StorageUri" END,
                                "UpdatedAt"=now(),"UpdatedBy"=@actor
                            """);
                        aCmd.Parameters.AddWithValue("id", targetId);
                        aCmd.Parameters.AddWithValue("pid", v2Pid);
                        aCmd.Parameters.AddWithValue("title", title);
                        aCmd.Parameters.AddWithValue("fname", fname);
                        aCmd.Parameters.AddWithValue("uri", url);
                        aCmd.Parameters.Add(new NpgsqlParameter("ddate", NpgsqlDbType.Date) { Value = DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime) });
                        aCmd.Parameters.AddWithValue("cat", createdAt);
                        aCmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        aCmd.Parameters.AddWithValue("tid", v2TenantId);
                        aCmd.Parameters.AddWithValue("cid", v2ClinicId);
                        return aCmd;
                    }));
                }
            }

            var encryptedAttachmentIds = new HashSet<Guid>();
            var attOutcome = await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "RecordAttachment", v2Pids, attCandidates,
                targetIds => LoadRecordAttachmentStatesAsync(v2, targetIds, encryptedAttachmentIds, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, attActiveForShield);

            if (!isDryRun && attOutcome.WrittenV1Ids.Count > 0 && encryptedAttachmentIds.Count > 0)
            {
                var baselineUpdates = attCandidates
                    .Where(c => attOutcome.WrittenV1Ids.Contains(c.V1Id) &&
                                encryptedAttachmentIds.Contains(c.AdoptedV2Id ?? c.DeterministicV2Id))
                    .Select(c => new MigratedStorageBaselineUpdate(
                        TargetEntityId: c.AdoptedV2Id ?? c.DeterministicV2Id,
                        SourceUrl: c.CanonicalFields.GetValueOrDefault("storageUri") ?? string.Empty,
                        SourceContentType: c.CanonicalFields.GetValueOrDefault("contentType")))
                    .ToList();
                if (baselineUpdates.Count > 0)
                {
                    await _ledger.RefreshMigratedSourceBaselineAsync(
                        SyncStoragePlane.ClinicAttachment, baselineUpdates, ct);
                }
            }
        }
    }

    private async Task<Dictionary<Guid, Dictionary<string, string?>>> LoadRecordAttachmentStatesAsync(
        NpgsqlConnection v2,
        Guid[] ids,
        HashSet<Guid> encryptedIdsOut,
        CancellationToken ct)
    {
        var map = new Dictionary<Guid, Dictionary<string, string?>>();
        if (ids.Length == 0) return map;

        var encryptedIds = new List<Guid>();
        const string sql = """
            SELECT "Id","RecordType","Title","FileName","ContentType","StorageUri","EncryptionAlgorithm"
            FROM public."RecordAttachments"
            WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
            """;

        await using (var cmd = new NpgsqlCommand(sql, v2))
        {
            cmd.Parameters.AddWithValue("ids", ids);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var id = r.GetGuid(0);
                var encAlg = r.IsDBNull(6) ? null : r.GetString(6);
                if (!string.Equals(encAlg ?? SyncTransforms.LegacyUnencryptedAlgorithm, SyncTransforms.LegacyUnencryptedAlgorithm, StringComparison.OrdinalIgnoreCase))
                {
                    encryptedIds.Add(id);
                    encryptedIdsOut.Add(id);
                }

                map[id] = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["recordType"] = GetStr(r, 1),
                    ["title"] = GetStr(r, 2),
                    ["fileName"] = GetStr(r, 3),
                    ["contentType"] = GetStr(r, 4),
                    ["storageUri"] = GetStr(r, 5)
                };
            }
        }

        if (encryptedIds.Count > 0)
        {
            var sources = await _ledger.LoadMigratedSourceInfoByPlaneAsync(
                SyncStoragePlane.ClinicAttachment, encryptedIds, ct);
            foreach (var (id, src) in sources)
            {
                if (!map.TryGetValue(id, out var fields)) continue;
                fields["storageUri"] = src.SourceUrl;
                if (src.SourceContentTypeCaptured)
                {
                    fields["contentType"] = src.SourceContentType;
                }
            }
        }

        return map;
    }

    // -------------------------------------------------------------------------
    // Step 11: Physical Examinations & Findings
    // -------------------------------------------------------------------------
    private async Task SyncPhysicalExaminationsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, Guid> consultToQueue,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;

        var peLib = new Dictionary<string, (string Category, string Code, string Description)>(StringComparer.Ordinal);
        if (await TableExistsAsync(v1, "PhysicalExamLibrary", ct))
        {
            await using var libCmd = new NpgsqlCommand("""SELECT id, category, code, description FROM public."PhysicalExamLibrary" """, v1);
            await using var lr = await libCmd.ExecuteReaderAsync(ct);
            while (await lr.ReadAsync(ct))
            {
                peLib[lr.GetString(0)] = (
                    GetStr(lr, 1) ?? string.Empty,
                    GetStr(lr, 2) ?? string.Empty,
                    GetStr(lr, 3) ?? string.Empty);
            }
        }

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            const string sql = """
                SELECT pe.id, pe."userId", pe."consultationTicketId", pe."dateTaken",
                       pe."generalSurveyId", pe."generalSurveyRemarks",
                       pe."skinId", pe."skinRemarks",
                       pe."heentId", pe."heentRemarks",
                       pe."chestId", pe."chestRemarks",
                       pe."heartId", pe."heartRemarks",
                       pe."abdomenId", pe."abdomenRemarks",
                       pe."neuroId", pe."neuroRemarks",
                       pe."rectalId", pe."rectalRemarks",
                       pe."guId", pe."guRemarks",
                       pe."createdAt", pe."updatedAt",
                       (SELECT thp."hpId" FROM public."ConsultationTicketHP" thp WHERE thp."consultationTicketId" = pe."consultationTicketId" ORDER BY thp.id ASC LIMIT 1) AS hp_id
                FROM public."PhysicalExamination" pe
                WHERE pe."userId" = ANY(@ids) AND pe."deletedAt" IS NULL
                  AND (pe."consultationTicketId" IS NULL OR EXISTS (
                      SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = pe."consultationTicketId" AND ct."clinicId" = @cid
                  ))
                ORDER BY pe.id ASC
                """;

            var rawRows = new List<(
                string PeId, int Uid, int? TicketId, DateTimeOffset DateTaken,
                string? GenId, string? GenRem, string? SkinId, string? SkinRem,
                string? HeentId, string? HeentRem, string? ChestId, string? ChestRem,
                string? HeartId, string? HeartRem, string? AbdId, string? AbdRem,
                string? NeuroId, string? NeuroRem, string? RectalId, string? RectalRem,
                string? GuId, string? GuRem, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int? HpId)>();

            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("ids", ids);
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    rawRows.Add((
                        r.GetString(0),
                        r.GetInt32(1),
                        r.IsDBNull(2) ? (int?)null : r.GetInt32(2),
                        GetUtc(r, 3) ?? GetUtc(r, 22) ?? DateTimeOffset.UtcNow,
                        SyncTransforms.Clean(GetStr(r, 4), 50), SyncTransforms.Clean(GetStr(r, 5), 1000),
                        SyncTransforms.Clean(GetStr(r, 6), 50), SyncTransforms.Clean(GetStr(r, 7), 1000),
                        SyncTransforms.Clean(GetStr(r, 8), 50), SyncTransforms.Clean(GetStr(r, 9), 1000),
                        SyncTransforms.Clean(GetStr(r, 10), 50), SyncTransforms.Clean(GetStr(r, 11), 1000),
                        SyncTransforms.Clean(GetStr(r, 12), 50), SyncTransforms.Clean(GetStr(r, 13), 1000),
                        SyncTransforms.Clean(GetStr(r, 14), 50), SyncTransforms.Clean(GetStr(r, 15), 1000),
                        SyncTransforms.Clean(GetStr(r, 16), 50), SyncTransforms.Clean(GetStr(r, 17), 1000),
                        SyncTransforms.Clean(GetStr(r, 18), 50), SyncTransforms.Clean(GetStr(r, 19), 1000),
                        SyncTransforms.Clean(GetStr(r, 20), 50), SyncTransforms.Clean(GetStr(r, 21), 1000),
                        GetUtc(r, 22) ?? DateTimeOffset.UtcNow,
                        GetUtc(r, 23) ?? GetUtc(r, 22) ?? DateTimeOffset.UtcNow,
                        r.IsDBNull(24) ? (int?)null : r.GetInt32(24)));
                }
            }

            var existingConsultIds = new HashSet<Guid>();
            var candidateConsults = rawRows
                .Where(x => x.TicketId.HasValue)
                .Select(x => DeterministicUuid.SharedConsultationId(v2ClinicId, x.TicketId!.Value))
                .Distinct()
                .ToArray();
            if (candidateConsults.Length > 0)
            {
                await using var ecCmd = new NpgsqlCommand("""SELECT "Id" FROM public."Consultations" WHERE "Id" = ANY(@ids) AND "IsDeleted" = false""", v2);
                ecCmd.Parameters.AddWithValue("ids", candidateConsults);
                await using var ecr = await ecCmd.ExecuteReaderAsync(ct);
                while (await ecr.ReadAsync(ct)) existingConsultIds.Add(ecr.GetGuid(0));
            }

            var candidates = new List<ChildSyncCandidate>();
            var activeForShield = new HashSet<string>(StringComparer.Ordinal);
            var findingsToSync = new List<(string PeId, Guid ExamId, string SystemName, string? LibId, string? Remarks)>();

            foreach (var row in rawRows)
            {
                activeForShield.Add(row.PeId);
                var v2ExamId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_pe:{row.PeId}");
                var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, row.Uid);
                Guid? v2ConsultId = null;
                if (row.TicketId.HasValue)
                {
                    var cand = DeterministicUuid.SharedConsultationId(v2ClinicId, row.TicketId.Value);
                    if (consultToQueue.ContainsKey(row.TicketId.Value) || existingConsultIds.Contains(cand))
                    {
                        v2ConsultId = cand;
                    }
                }

                string? staffName = row.HpId.HasValue && clinicians.TryGetValue(row.HpId.Value, out var doc) ? doc.Name : null;
                var genInfo = row.GenId is not null && peLib.TryGetValue(row.GenId, out var g) ? g : default;
                var genStatus = SyncTransforms.MapGeneralSurveyStatus(genInfo.Description ?? genInfo.Code ?? row.GenId);
                var genCodes = SyncTransforms.CleanRequired(genInfo.Code, "1", 100);

                var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                {
                    ["examDate"] = row.DateTaken.UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                    ["generalSurveyStatus"] = genStatus,
                    ["generalSurveyCodes"] = genCodes,
                    ["generalSurveyRemarks"] = row.GenRem,
                    ["skinRemarks"] = row.SkinRem,
                    ["heentRemarks"] = row.HeentRem,
                    ["chestLungsRemarks"] = row.ChestRem,
                    ["heartRemarks"] = row.HeartRem,
                    ["abdomenRemarks"] = row.AbdRem,
                    ["neurologicalRemarks"] = row.NeuroRem,
                    ["digitalRectalRemarks"] = row.RectalRem,
                    ["genitourinaryRemarks"] = row.GuRem
                };

                candidates.Add(new ChildSyncCandidate(row.PeId, v2ExamId, null, canonical, targetId =>
                {
                    var cmd = new NpgsqlBatchCommand("""
                        INSERT INTO public."PatientPhysicalExams" (
                            "Id","PatientId","ConsultationEncounterId","ExamDate","ExaminedByStaffName",
                            "GeneralSurveyStatus","GeneralSurveyCodes","GeneralSurveyRemarks",
                            "SkinRemarks","HeentRemarks","ChestLungsRemarks","HeartRemarks","AbdomenRemarks",
                            "NeurologicalRemarks","DigitalRectalRemarks","GenitourinaryRemarks",
                            "GenSurveyId","SkinId","HeentId","ChestId","HeartId","AbdomenId","NeuroId","RectalId","GuId",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @id,@pid,@cidEnc,@edate,@staff,
                            @gstat,@gcodes,@grem,
                            @srem,@hrem,@crem,@htrem,@arem,
                            @nrem,@rrem,@gurem,
                            @gid,@sid,@hid,@chid,@htid,@aid,@nid,@rid,@guid,
                            @cat,@actor,@uat,@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "ExamDate"=EXCLUDED."ExamDate",
                            "GeneralSurveyStatus"=EXCLUDED."GeneralSurveyStatus","GeneralSurveyCodes"=EXCLUDED."GeneralSurveyCodes",
                            "GeneralSurveyRemarks"=EXCLUDED."GeneralSurveyRemarks",
                            "SkinRemarks"=EXCLUDED."SkinRemarks","HeentRemarks"=EXCLUDED."HeentRemarks",
                            "ChestLungsRemarks"=EXCLUDED."ChestLungsRemarks","HeartRemarks"=EXCLUDED."HeartRemarks",
                            "AbdomenRemarks"=EXCLUDED."AbdomenRemarks","NeurologicalRemarks"=EXCLUDED."NeurologicalRemarks",
                            "DigitalRectalRemarks"=EXCLUDED."DigitalRectalRemarks","GenitourinaryRemarks"=EXCLUDED."GenitourinaryRemarks",
                            "UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    cmd.Parameters.AddWithValue("id", targetId);
                    cmd.Parameters.AddWithValue("pid", v2Pid);
                    cmd.Parameters.AddWithValue("cidEnc", (object?)v2ConsultId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("edate", row.DateTaken);
                    cmd.Parameters.AddWithValue("staff", (object?)staffName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("gstat", genStatus);
                    cmd.Parameters.AddWithValue("gcodes", genCodes);
                    cmd.Parameters.AddWithValue("grem", (object?)row.GenRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("srem", (object?)row.SkinRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("hrem", (object?)row.HeentRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("crem", (object?)row.ChestRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("htrem", (object?)row.HeartRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("arem", (object?)row.AbdRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("nrem", (object?)row.NeuroRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("rrem", (object?)row.RectalRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("gurem", (object?)row.GuRem ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("gid", (object?)row.GenId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("sid", (object?)row.SkinId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("hid", (object?)row.HeentId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("chid", (object?)row.ChestId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("htid", (object?)row.HeartId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("aid", (object?)row.AbdId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("nid", (object?)row.NeuroId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("rid", (object?)row.RectalId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("guid", (object?)row.GuId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("cat", row.CreatedAt);
                    cmd.Parameters.AddWithValue("uat", row.UpdatedAt);
                    cmd.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    cmd.Parameters.AddWithValue("tid", v2TenantId);
                    cmd.Parameters.AddWithValue("cid", v2ClinicId);
                    return cmd;
                }));

                if (targetV1IdFilter is null || string.Equals(targetV1IdFilter, row.PeId, StringComparison.Ordinal))
                {
                    void QueueFinding(string sys, string? libId, string? rem)
                    {
                        if (libId is not null || rem is not null)
                        {
                            findingsToSync.Add((row.PeId, v2ExamId, sys, libId, rem));
                        }
                    }
                    QueueFinding("Skin", row.SkinId, row.SkinRem);
                    QueueFinding("Heent", row.HeentId, row.HeentRem);
                    QueueFinding("Chest", row.ChestId, row.ChestRem);
                    QueueFinding("Heart", row.HeartId, row.HeartRem);
                    QueueFinding("Abdomen", row.AbdId, row.AbdRem);
                    QueueFinding("Neurological", row.NeuroId, row.NeuroRem);
                    QueueFinding("Rectal", row.RectalId, row.RectalRem);
                    QueueFinding("Genitourinary", row.GuId, row.GuRem);
                }
            }

            var examOutcome = await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "PatientPhysicalExam", v2Pids, candidates,
                targetIds => LoadStringMapRowsAsync(v2, """
                    SELECT "Id","ExamDate","GeneralSurveyStatus","GeneralSurveyCodes","GeneralSurveyRemarks",
                           "SkinRemarks","HeentRemarks","ChestLungsRemarks","HeartRemarks","AbdomenRemarks",
                           "NeurologicalRemarks","DigitalRectalRemarks","GenitourinaryRemarks"
                    FROM public."PatientPhysicalExams"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["examDate"] = (GetUtc(r, 1) ?? DateTimeOffset.MinValue).UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
                        ["generalSurveyStatus"] = GetStr(r, 2),
                        ["generalSurveyCodes"] = GetStr(r, 3),
                        ["generalSurveyRemarks"] = GetStr(r, 4),
                        ["skinRemarks"] = GetStr(r, 5),
                        ["heentRemarks"] = GetStr(r, 6),
                        ["chestLungsRemarks"] = GetStr(r, 7),
                        ["heartRemarks"] = GetStr(r, 8),
                        ["abdomenRemarks"] = GetStr(r, 9),
                        ["neurologicalRemarks"] = GetStr(r, 10),
                        ["digitalRectalRemarks"] = GetStr(r, 11),
                        ["genitourinaryRemarks"] = GetStr(r, 12)
                    }, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, activeForShield);

            if (!isDryRun && findingsToSync.Count > 0 && examOutcome.WrittenV1Ids.Count > 0)
            {
                await using var fBatch = new NpgsqlBatch(v2);
                foreach (var f in findingsToSync)
                {
                    if (!examOutcome.WrittenV1Ids.Contains(f.PeId)) continue;
                    var fId = DeterministicUuid.Create(DeterministicUuid.SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_pe_find:{f.PeId}:{f.SystemName}");
                    var info = f.LibId is not null && peLib.TryGetValue(f.LibId, out var li) ? li : default;
                    var title = SyncTransforms.CleanRequired(info.Description ?? f.Remarks, $"{f.SystemName} Examination", 255);
                    var code = SyncTransforms.Clean(info.Code, 50);
                    var isNormal = info.Code == "1" ||
                                   (!string.IsNullOrEmpty(info.Description) &&
                                    (info.Description.Contains("normal", StringComparison.OrdinalIgnoreCase) ||
                                     info.Description.Contains("unremarkable", StringComparison.OrdinalIgnoreCase)) &&
                                    !info.Description.Contains("abnormal", StringComparison.OrdinalIgnoreCase));
                    if (string.IsNullOrEmpty(info.Description) && string.IsNullOrEmpty(info.Code))
                    {
                        isNormal = string.IsNullOrWhiteSpace(f.Remarks);
                    }

                    var fc = new NpgsqlBatchCommand("""
                        INSERT INTO public."PatientPhysicalExamFindings" (
                            "Id","PhysicalExamId","System","IsNormal","FindingTitle","PhilHealthFindingCode","Remarks",
                            "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                        ) VALUES (
                            @id,@peid,@sys,@norm,@title,@code,@rem,
                            now(),@actor,now(),@actor,false,@tid,@cid
                        ) ON CONFLICT ("Id") DO UPDATE SET
                            "IsNormal"=EXCLUDED."IsNormal","FindingTitle"=EXCLUDED."FindingTitle",
                            "PhilHealthFindingCode"=EXCLUDED."PhilHealthFindingCode","Remarks"=EXCLUDED."Remarks",
                            "UpdatedAt"=now(),"UpdatedBy"=@actor
                        """);
                    fc.Parameters.AddWithValue("id", fId);
                    fc.Parameters.AddWithValue("peid", f.ExamId);
                    fc.Parameters.AddWithValue("sys", f.SystemName);
                    fc.Parameters.AddWithValue("norm", isNormal);
                    fc.Parameters.AddWithValue("title", title);
                    fc.Parameters.AddWithValue("code", (object?)code ?? DBNull.Value);
                    fc.Parameters.AddWithValue("rem", (object?)f.Remarks ?? DBNull.Value);
                    fc.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                    fc.Parameters.AddWithValue("tid", v2TenantId);
                    fc.Parameters.AddWithValue("cid", v2ClinicId);
                    fBatch.BatchCommands.Add(fc);
                }
                if (fBatch.BatchCommands.Count > 0) await fBatch.ExecuteNonQueryAsync(ct);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Step 12: Home Medications (Medication + MedicationDrug + Drug)
    // -------------------------------------------------------------------------
    private async Task SyncHomeMedicationsAsync(
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        SyncBinding binding,
        Guid runId,
        List<int> cohortUserIds,
        Dictionary<int, ClinicianSnapshot> clinicians,
        bool isDryRun,
        bool forceV1OnConflict,
        SyncRunSummary summary,
        CancellationToken ct,
        string? targetV1IdFilter = null)
    {
        var v1ClinicId = binding.V1ClinicId!.Value;
        var v2ClinicId = binding.V2ClinicId!.Value;
        var v2TenantId = binding.V2TenantId!;
        var hasDrugTable = await TableExistsAsync(v1, "Drug", ct);
        var drugJoin = hasDrugTable
            ? """LEFT JOIN public."Drug" d ON d.id = md."drugId" """
            : """LEFT JOIN LATERAL (SELECT NULL::text AS "genericName", NULL::text AS "brandName") d ON true""";

        await foreach (var chunk in EnumerateBatchesAsync(cohortUserIds, ct))
        {
            var ids = chunk.ToArray();
            var v2Pids = ids.Select(uid => DeterministicUuid.ClinicPatientId(v2ClinicId, uid)).ToArray();

            var sql = $"""
                SELECT m.id, m."patientId", m."hpId", m.name, m."createdAt", m."updatedAt", m."completedAt",
                       md.id AS md_id, md."isGeneric", md.dosage, md.frequency, md.unit, md.notes, md.duration,
                       d."genericName", d."brandName"
                FROM public."Medication" m
                LEFT JOIN public."MedicationDrug" md ON md."medicationId" = m.id
                {drugJoin}
                WHERE m."clinicId" = @cid AND m."patientId" = ANY(@ids)
                ORDER BY m.id ASC, md.id ASC NULLS LAST
                """;

            var candidates = new List<ChildSyncCandidate>();
            var activeForShield = new HashSet<string>(StringComparer.Ordinal);

            await using (var cmd = new NpgsqlCommand(sql, v1))
            {
                cmd.Parameters.AddWithValue("cid", v1ClinicId);
                cmd.Parameters.AddWithValue("ids", ids);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var medId = r.GetInt32(0);
                    var uid = r.GetInt32(1);
                    var hpId = r.IsDBNull(2) ? (int?)null : r.GetInt32(2);
                    var medName = SyncTransforms.Clean(GetStr(r, 3));
                    var createdAt = GetUtc(r, 4) ?? DateTimeOffset.UtcNow;
                    var updatedAt = GetUtc(r, 5) ?? createdAt;
                    var completedAt = GetUtc(r, 6);
                    var mdId = r.IsDBNull(7) ? (int?)null : r.GetInt32(7);
                    var dosage = SyncTransforms.Clean(GetStr(r, 9), 100);
                    var frequency = SyncTransforms.Clean(GetStr(r, 10), 100);
                    var unit = SyncTransforms.Clean(GetStr(r, 11));
                    var notes = SyncTransforms.Clean(GetStr(r, 12));
                    var durationDays = r.IsDBNull(13) ? (int?)null : r.GetInt32(13);
                    var drugGeneric = SyncTransforms.Clean(GetStr(r, 14), 200);
                    var drugBrand = SyncTransforms.Clean(GetStr(r, 15), 200);

                    // Key MedicationDrug rows stably as medId:mdId; only drugless Medication uses medId
                    var v1Key = mdId.HasValue
                        ? $"{medId}:{mdId.Value}"
                        : medId.ToString(CultureInfo.InvariantCulture);
                    activeForShield.Add(v1Key);

                    var v2Id = DeterministicUuid.Create(DeterministicUuid.ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_homemed:{v1Key}");
                    var v2Pid = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
                    var genericName = SyncTransforms.CleanRequired(drugGeneric ?? medName ?? drugBrand, "Home Medication", 200);
                    var durationStr = durationDays.HasValue ? $"{durationDays.Value} days" : null;
                    if (durationStr is not null && durationStr.Length > 50) durationStr = durationStr[..50];
                    var startDate = DateOnly.FromDateTime(createdAt.ToOffset(ManilaOffset).DateTime);
                    DateOnly? stoppedDate = completedAt.HasValue ? DateOnly.FromDateTime(completedAt.Value.ToOffset(ManilaOffset).DateTime) : null;
                    var isActive = !completedAt.HasValue;
                    var physician = hpId.HasValue && clinicians.TryGetValue(hpId.Value, out var doc) ? doc.Name : null;

                    var canonical = new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["genericDrugName"] = genericName,
                        ["brandName"] = drugBrand,
                        ["doseStrength"] = dosage,
                        ["form"] = unit,
                        ["frequency"] = frequency,
                        ["duration"] = durationStr,
                        ["isActive"] = isActive ? "true" : "false",
                        ["indication"] = notes
                    };

                    candidates.Add(new ChildSyncCandidate(v1Key, v2Id, null, canonical, targetId =>
                    {
                        var mc = new NpgsqlBatchCommand("""
                            INSERT INTO public."PatientHomeMedications" (
                                "Id","PatientId","GenericDrugName","BrandName","DoseStrength","Form","Frequency","Duration",
                                "IsPndfListed","PrescribingPhysicianName","StartDate","StoppedDate","IsActive","Indication","Source",
                                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
                            ) VALUES (
                                @id,@pid,@gen,@brand,@dos,@form,@freq,@dur,
                                false,@phys,@sdate,@edate,@act,@ind,'V1Medication',
                                @cat,@actor,@uat,@actor,false,@tid,@cid
                            ) ON CONFLICT ("Id") DO UPDATE SET
                                "GenericDrugName"=EXCLUDED."GenericDrugName","BrandName"=EXCLUDED."BrandName",
                                "DoseStrength"=EXCLUDED."DoseStrength","Form"=EXCLUDED."Form",
                                "Frequency"=EXCLUDED."Frequency","Duration"=EXCLUDED."Duration",
                                "StoppedDate"=EXCLUDED."StoppedDate","IsActive"=EXCLUDED."IsActive",
                                "Indication"=EXCLUDED."Indication","UpdatedAt"=now(),"UpdatedBy"=@actor
                            """);
                        mc.Parameters.AddWithValue("id", targetId);
                        mc.Parameters.AddWithValue("pid", v2Pid);
                        mc.Parameters.AddWithValue("gen", genericName);
                        mc.Parameters.AddWithValue("brand", (object?)drugBrand ?? DBNull.Value);
                        mc.Parameters.AddWithValue("dos", (object?)dosage ?? DBNull.Value);
                        mc.Parameters.AddWithValue("form", (object?)unit ?? DBNull.Value);
                        mc.Parameters.AddWithValue("freq", (object?)frequency ?? DBNull.Value);
                        mc.Parameters.AddWithValue("dur", (object?)durationStr ?? DBNull.Value);
                        mc.Parameters.AddWithValue("phys", (object?)physician ?? DBNull.Value);
                        mc.Parameters.Add(new NpgsqlParameter("sdate", NpgsqlDbType.Date) { Value = startDate });
                        mc.Parameters.Add(new NpgsqlParameter("edate", NpgsqlDbType.Date) { Value = stoppedDate.HasValue ? stoppedDate.Value : DBNull.Value });
                        mc.Parameters.AddWithValue("act", isActive);
                        mc.Parameters.AddWithValue("ind", (object?)notes ?? DBNull.Value);
                        mc.Parameters.AddWithValue("cat", createdAt);
                        mc.Parameters.AddWithValue("uat", updatedAt);
                        mc.Parameters.AddWithValue("actor", SyncTransforms.SyncActor);
                        mc.Parameters.AddWithValue("tid", v2TenantId);
                        mc.Parameters.AddWithValue("cid", v2ClinicId);
                        return mc;
                    }));
                }
            }

            await ExecuteChildSyncBatchAsync(
                v2, binding, runId, "PatientHomeMedication", v2Pids, candidates,
                targetIds => LoadStringMapRowsAsync(v2, """
                    SELECT "Id","GenericDrugName","BrandName","DoseStrength","Form","Frequency","Duration","IsActive","Indication"
                    FROM public."PatientHomeMedications"
                    WHERE "Id" = ANY(@ids) AND "IsDeleted" = false
                    """, targetIds, r => new Dictionary<string, string?>(StringComparer.Ordinal)
                    {
                        ["genericDrugName"] = GetStr(r, 1),
                        ["brandName"] = GetStr(r, 2),
                        ["doseStrength"] = GetStr(r, 3),
                        ["form"] = GetStr(r, 4),
                        ["frequency"] = GetStr(r, 5),
                        ["duration"] = GetStr(r, 6),
                        ["isActive"] = r.GetBoolean(7) ? "true" : "false",
                        ["indication"] = GetStr(r, 8)
                    }, ct),
                isDryRun, forceV1OnConflict, targetV1IdFilter, summary, ct, activeForShield);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private sealed record ExistingPatientState(Dictionary<string, string?> Fields);
    private sealed record ClinicianSnapshot(string Name, string? PrcLicense, string? PtrNumber);
    private sealed record ChildSyncCandidate(
        string V1Id,
        Guid DeterministicV2Id,
        Guid? AdoptedV2Id,
        Dictionary<string, string?> CanonicalFields,
        Func<Guid, NpgsqlBatchCommand> BuildUpsertCommand);
    private sealed record ChildSyncOutcome(HashSet<string> WrittenV1Ids);

    private async Task<ChildSyncOutcome> ExecuteChildSyncBatchAsync(
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
        bool skipChildDeletionShield = false)
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
                    if (changedFields.Count == 0)
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

                writtenV1Ids.Add(c.V1Id);
                if (!isDryRun)
                {
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
                isDryRun, summary, diffBatch, ct);
        }

        if (diffBatch.Count > 0)
        {
            await _ledger.RecordDiffsBatchAsync(runId, binding.Id, diffBatch, ct);
        }

        return new ChildSyncOutcome(writtenV1Ids);
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

    private static string? GetV2TableNameForEntity(string entityType) => entityType switch
    {
        "Patient" => "Patients",
        "PatientAddress" => "PatientAddresses",
        "PatientGuardian" => "PatientGuardians",
        "PatientAllergy" => "PatientAllergies",
        "PatientMedicalHistory" => "PatientMedicalHistories",
        "PatientFamilyHistory" => "PatientFamilyHistories",
        "PatientSocialHistory" => "PatientSocialHistories",
        "PatientReproductiveHistory" => "PatientReproductiveHistories",
        "PatientSurgicalHistory" => "PatientSurgicalHistories",
        "PatientImmunization" => "PatientImmunizations",
        "PatientPhilHealthMembership" => "PatientPhilHealthMemberships",
        "PatientAlert" => "PatientAlerts",
        "Appointment" => "Appointments",
        "QueueItem" => "QueueItems",
        "Consultation" => "Consultations",
        "PatientVitals" => "PatientVitals",
        "Prescription" => "Prescriptions",
        "ClinicDispensingLog" => "ClinicDispensingLogs",
        "LabOrder" => "LabOrders",
        "LabOrderItem" => "LabOrderItems",
        "MedicalCertificate" => "MedicalCertificates",
        "RecordAttachment" => "RecordAttachments",
        "PatientPhysicalExam" => "PatientPhysicalExams",
        "PatientHomeMedication" => "PatientHomeMedications",
        _ => null
    };

    private static async Task<HashSet<Guid>> FilterExistingV2IdsForEntityAsync(
        NpgsqlConnection v2,
        string entityType,
        string tenantId,
        Guid clinicId,
        Guid[] candidateIds,
        CancellationToken ct)
    {
        var result = new HashSet<Guid>();
        if (candidateIds.Length == 0) return result;
        var tableName = GetV2TableNameForEntity(entityType);
        if (tableName is null) return result;

        await using var cmd = new NpgsqlCommand($"""
            SELECT "Id"
            FROM public."{tableName}"
            WHERE "TenantId" = @tid AND "ClinicId" = @cid AND "IsDeleted" = false AND "Id" = ANY(@ids)
            """, v2);
        cmd.Parameters.AddWithValue("tid", tenantId);
        cmd.Parameters.AddWithValue("cid", clinicId);
        cmd.Parameters.AddWithValue("ids", candidateIds);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result.Add(r.GetGuid(0));
        return result;
    }

    private async Task<int?> ResolveForceSyncOwnerUserIdAsync(
        NpgsqlConnection v1,
        SyncBinding binding,
        string entityType,
        string v1Id,
        CancellationToken ct)
    {
        var cid = binding.V1ClinicId!.Value;
        switch (entityType)
        {
            case "Patient":
                return int.TryParse(v1Id, out var uid) ? uid : null;
            case "PatientAddress":
                return int.TryParse(v1Id, out var aid)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserAddress" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", aid, null, ct)
                    : null;
            case "PatientGuardian":
                return int.TryParse(v1Id, out var gid)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserEmergencyContact" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", gid, null, ct)
                    : null;
            case "PatientAllergy":
                return int.TryParse(v1Id, out var alId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserAllergy" WHERE id = @id""", alId, null, ct)
                    : null;
            case "PatientMedicalHistory":
                if (v1Id.StartsWith("hc:", StringComparison.Ordinal) && int.TryParse(v1Id[3..], out var hcId))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserHealthCondition" WHERE id = @id""", hcId, null, ct);
                if (v1Id.StartsWith("mh:", StringComparison.Ordinal) && int.TryParse(v1Id[3..], out var mhId))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."MedicalHistory" WHERE id = @id""", mhId, null, ct);
                if (v1Id.StartsWith("dis:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var disId))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserDisability" WHERE id = @id""", disId, null, ct);
                return null;
            case "PatientFamilyHistory":
                return int.TryParse(v1Id, out var fmhId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."FamilyMedicalHistory" WHERE id = @id AND "deletedAt" IS NULL""", fmhId, null, ct)
                    : null;
            case "PatientSocialHistory":
                return int.TryParse(v1Id, out var shId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PersonalHistory" WHERE id = @id AND "deletedAt" IS NULL""", shId, null, ct)
                    : null;
            case "PatientReproductiveHistory":
                return int.TryParse(v1Id, out var ogId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."ObGyneHistory" WHERE id = @id AND "deletedAt" IS NULL""", ogId, null, ct)
                    : null;
            case "PatientSurgicalHistory":
                return int.TryParse(v1Id, out var surgId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."SurgicalHistory" WHERE id = @id AND "deletedAt" IS NULL""", surgId, null, ct)
                    : null;
            case "PatientImmunization":
                if (!int.TryParse(v1Id, out var immId)) return null;
                if (await TableExistsAsync(v1, "UserVaccination", ct))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."UserVaccination" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", immId, null, ct);
                if (await TableExistsAsync(v1, "PatientImmunization", ct))
                    return await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PatientImmunization" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", immId, null, ct);
                return null;
            case "PatientPhilHealthMembership":
                return int.TryParse(v1Id, out var phId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "userId" FROM public."PhilHealthRecord" WHERE id = @id AND "deletedAt" IS NULL AND "isActive" = true""", phId, null, ct)
                    : null;
            case "PatientAlert":
                return int.TryParse(v1Id, out var piId)
                    ? await QueryOptionalIntAsync(v1, """SELECT "patientId" FROM public."PatientInsight" WHERE id = @id AND "clinicId" = @cid""", piId, cid, ct)
                    : null;
            case "Appointment":
                return int.TryParse(v1Id, out var apptId)
                    ? await QueryOptionalIntAsync(v1, """SELECT ar."userId" FROM public."Appointment" a JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id WHERE a.id = @id AND a."clinicId" = @cid AND a."deletedAt" IS NULL LIMIT 1""", apptId, cid, ct)
                    : null;
            case "Consultation":
                return int.TryParse(v1Id, out var ctId)
                    ? await QueryOptionalIntAsync(v1, """SELECT COALESCE(cp."patientId", ar."userId") FROM public."ConsultationTicket" t LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId" LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId" WHERE t.id = @id AND t."clinicId" = @cid AND t."isActive" = true LIMIT 1""", ctId, cid, ct)
                    : null;
            case "PatientVitals":
                if (v1Id.StartsWith("vital:", StringComparison.Ordinal) && int.TryParse(v1Id[6..], out var vsId))
                    return await QueryOptionalIntAsync(v1, """SELECT vs."userId" FROM public."VitalSign" vs WHERE vs.id = @id AND vs."deletedAt" IS NULL AND vs."isActive" = true AND (vs."consultationTicketId" IS NULL OR EXISTS (SELECT 1 FROM public."ConsultationTicket" t WHERE t.id = vs."consultationTicketId" AND t."clinicId" = @cid))""", vsId, cid, ct);
                if (v1Id.StartsWith("preassess:", StringComparison.Ordinal) && int.TryParse(v1Id[10..], out var paId))
                    return await QueryOptionalIntAsync(v1, """SELECT ar."userId" FROM public."PreAssessmentNote" pa JOIN public."AppointmentRequester" ar ON ar."appointmentId" = pa."appointmentId" WHERE pa.id = @id AND pa."clinicId" = @cid LIMIT 1""", paId, cid, ct);
                return null;
            case "Prescription":
                return int.TryParse(v1Id, out var medId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."Medicine" m JOIN public."Prescription" p ON p.id = m."prescriptionId" JOIN public."ClinicPatient" cp ON cp.id = p."patientId" JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId" AND t."isActive" = true AND t."clinicId" = @cid WHERE m.id = @id AND p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true""", medId, cid, ct)
                    : null;
            case "ClinicDispensingLog":
                return int.TryParse(v1Id, out var dispId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."MedicineDispenseRecord" md JOIN public."Medicine" m ON m.id = md."medicineId" JOIN public."Prescription" p ON p.id = m."prescriptionId" JOIN public."ClinicPatient" cp ON cp.id = p."patientId" JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId" AND t."isActive" = true AND t."clinicId" = @cid WHERE md.id = @id AND md."isDispensed" = true AND p."clinicId" = @cid AND p."isActive" = true AND m."deletedAt" IS NULL AND m."isActive" = true""", dispId, cid, ct)
                    : null;
            case "LabOrder":
                if (v1Id.StartsWith("lab:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var labId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicLaboratoryRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", labId, cid, ct);
                if (v1Id.StartsWith("img:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var imgId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicImagingRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", imgId, cid, ct);
                if (v1Id.StartsWith("ecg:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var ecgId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicHeartStationRequest" r JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE r.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", ecgId, cid, ct);
                return null;
            case "LabOrderItem":
                if (v1Id.StartsWith("lab:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var labItemId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicLaboratoryRequestProcedure" rp JOIN public."ClinicLaboratoryRequest" r ON r.id = rp."clinicLaboratoryRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE rp.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", labItemId, cid, ct);
                if (v1Id.StartsWith("img:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var imgItemId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicImagingRequestProcedure" rp JOIN public."ClinicImagingRequest" r ON r.id = rp."clinicImagingRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE rp.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", imgItemId, cid, ct);
                if (v1Id.StartsWith("ecg:", StringComparison.Ordinal) && int.TryParse(v1Id[4..], out var ecgItemId))
                    return await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicHeartStationRequestProcedure" rp JOIN public."ClinicHeartStationRequest" r ON r.id = rp."clinicHeartStationRequestId" JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId" WHERE rp.id = @id AND r."clinicId" = @cid AND r."deletedAt" IS NULL AND r."isActive" = true""", ecgItemId, cid, ct);
                return null;
            case "MedicalCertificate":
                return int.TryParse(v1Id, out var mcId)
                    ? await QueryOptionalIntAsync(v1, """SELECT cp."patientId" FROM public."ClinicMedicalCertificate" mc JOIN public."ClinicPatient" cp ON cp.id = mc."clinicPatientId" WHERE mc.id = @id AND mc."clinicId" = @cid AND mc."deletedAt" IS NULL AND mc."isActive" = true""", mcId, cid, ct)
                    : null;
            case "RecordAttachment":
                if (v1Id.StartsWith("file:", StringComparison.Ordinal) && int.TryParse(v1Id[5..], out var fileId))
                {
                    var hasFolderCols = await ColumnExistsAsync(v1, "Folder", "deletedAt", ct) &&
                                        await ColumnExistsAsync(v1, "Folder", "isActive", ct);
                    var folderCond = hasFolderCols
                        ? """AND (f."folderId" IS NULL OR (fo.id IS NOT NULL AND fo."deletedAt" IS NULL AND fo."isActive" = true))"""
                        : string.Empty;
                    return await QueryOptionalIntAsync(v1, $"""SELECT fo."userId" FROM public."File" f LEFT JOIN public."Folder" fo ON fo.id = f."folderId" LEFT JOIN public."FileSetting" fs ON fs."fileId" = f.id LEFT JOIN public."FolderSetting" fos ON fos."folderId" = fo.id WHERE f.id = @id AND f."isActive" = true AND f."deletedAt" IS NULL {folderCond} AND COALESCE(fs.privacy::text, 'PRIVATE') <> 'PRIVATE' AND COALESCE(fos.privacy::text, 'CLINIC') <> 'PRIVATE'""", fileId, null, ct);
                }
                if (v1Id.StartsWith("appt_att:", StringComparison.Ordinal) && int.TryParse(v1Id[9..], out var aaId))
                    return await QueryOptionalIntAsync(v1, """SELECT ar."userId" FROM public."AppointmentAttachment" aa JOIN public."Appointment" a ON a.id = aa."appointmentId" JOIN public."AppointmentRequester" ar ON ar."appointmentId" = a.id WHERE aa.id = @id AND a."clinicId" = @cid AND a."deletedAt" IS NULL LIMIT 1""", aaId, cid, ct);
                return null;
            case "PatientPhysicalExam":
            {
                await using var cmd = new NpgsqlCommand("""
                    SELECT pe."userId"
                    FROM public."PhysicalExamination" pe
                    WHERE pe.id = @id AND pe."deletedAt" IS NULL
                      AND (pe."consultationTicketId" IS NULL OR EXISTS (
                          SELECT 1 FROM public."ConsultationTicket" ct WHERE ct.id = pe."consultationTicketId" AND ct."clinicId" = @cid
                      ))
                    """, v1);
                cmd.Parameters.AddWithValue("id", v1Id);
                cmd.Parameters.AddWithValue("cid", cid);
                var obj = await cmd.ExecuteScalarAsync(ct);
                return obj is int i ? i : null;
            }
            case "PatientHomeMedication":
            {
                var basePart = v1Id.Contains(':', StringComparison.Ordinal) ? v1Id.Split(':')[0] : v1Id;
                return int.TryParse(basePart, out var homeMedId)
                    ? await QueryOptionalIntAsync(v1, """SELECT m."patientId" FROM public."Medication" m WHERE m.id = @id AND m."clinicId" = @cid""", homeMedId, cid, ct)
                    : null;
            }
            default:
                return null;
        }
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

    private static async Task<Dictionary<int, string>> LoadSinglePatientDisplayNameMapAsync(
        NpgsqlConnection v1, int v1UserId, CancellationToken ct)
    {
        var map = new Dictionary<int, string>();
        await using var cmd = new NpgsqlCommand("""
            SELECT "firstName", "lastName" FROM public."User" WHERE id = @uid
            """, v1);
        cmd.Parameters.AddWithValue("uid", v1UserId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (await r.ReadAsync(ct))
        {
            var fn = SyncTransforms.CleanRequired(GetStr(r, 0), "Unknown", 100);
            var ln = SyncTransforms.CleanRequired(GetStr(r, 1), "Patient", 100);
            map[v1UserId] = SyncTransforms.CleanRequired($"{ln}, {fn}", "Patient", 150);
        }
        return map;
    }

    private static async Task<Dictionary<int, Guid>> LoadExistingConsultationQueueMapAsync(
        NpgsqlConnection v1, NpgsqlConnection v2, SyncBinding binding, List<int> cohortUserIds, CancellationToken ct)
    {
        var map = new Dictionary<int, Guid>();
        var ticketIds = new List<int>();
        await using (var cmd = new NpgsqlCommand("""
            SELECT t.id
            FROM public."ConsultationTicket" t
            LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId"
            LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
            WHERE t."clinicId" = @cid AND t."isActive" = true AND COALESCE(cp."patientId", ar."userId") = ANY(@ids)
            """, v1))
        {
            cmd.Parameters.AddWithValue("cid", binding.V1ClinicId!.Value);
            cmd.Parameters.AddWithValue("ids", cohortUserIds.ToArray());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) ticketIds.Add(r.GetInt32(0));
        }

        if (ticketIds.Count == 0) return map;

        var v2ClinicId = binding.V2ClinicId!.Value;
        var consultIdToTicket = ticketIds.ToDictionary(tid => DeterministicUuid.SharedConsultationId(v2ClinicId, tid), tid => tid);
        await using (var v2Cmd = new NpgsqlCommand("""
            SELECT "Id", "QueueItemId"
            FROM public."Consultations"
            WHERE "Id" = ANY(@cids) AND "IsDeleted" = false AND "QueueItemId" IS NOT NULL
            """, v2))
        {
            v2Cmd.Parameters.AddWithValue("cids", consultIdToTicket.Keys.ToArray());
            await using var r = await v2Cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var cid = r.GetGuid(0);
                if (consultIdToTicket.TryGetValue(cid, out var ticketId))
                {
                    map[ticketId] = r.GetGuid(1);
                }
            }
        }
        return map;
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

    private static Dictionary<string, string?> BuildClinicPatientCanonicalMap(
        string fn, string ln, string? mn, string? suf, DateOnly? dob, string sex, string? civil, string? blood,
        string contact, string? landline, string? email, string? occupation, string? nat, string? rel, string? prefName, string? phPin,
        string? ecName, string? ecPhone, string? ecRel, string verificationStatus, string customFieldsJson) =>
        new(StringComparer.Ordinal)
        {
            ["firstName"] = fn,
            ["lastName"] = ln,
            ["middleName"] = mn,
            ["suffix"] = suf,
            ["dateOfBirth"] = dob?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["sex"] = sex,
            ["civilStatus"] = civil,
            ["bloodType"] = blood,
            ["contactNumber"] = contact,
            ["landlineNumber"] = landline,
            ["email"] = email,
            ["occupation"] = occupation,
            ["nationality"] = nat,
            ["religion"] = rel,
            ["preferredName"] = prefName,
            ["philHealthNumber"] = phPin,
            ["emergencyContactName"] = ecName,
            ["emergencyContactNumber"] = ecPhone,
            ["emergencyContactRelationship"] = ecRel,
            ["verificationStatus"] = verificationStatus,
            ["customFields"] = customFieldsJson
        };

    private static async Task<Dictionary<Guid, ExistingPatientState>> LoadExistingClinicPatientStatesAsync(
        NpgsqlConnection v2, Guid[] ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, ExistingPatientState>();
        const string sql = """
            SELECT "Id","FirstName","LastName","MiddleName","Suffix","DateOfBirth","Sex","CivilStatus","BloodType",
                   "ContactNumber","LandlineNumber","Email","Occupation","Nationality","Religion","PreferredName","PhilHealthNumber",
                   "EmergencyContactName","EmergencyContactNumber","EmergencyContactRelationship","VerificationStatus","CustomFields"::text
            FROM public."Patients"
            WHERE "Id" = ANY(@ids)
            """;
        await using var cmd = new NpgsqlCommand(sql, v2);
        cmd.Parameters.AddWithValue("ids", ids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var id = r.GetGuid(0);
            var dob = r.IsDBNull(5) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(5);
            var cfRaw = r.IsDBNull(21) ? "{}" : r.GetString(21);
            var cfDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(cfRaw) ?? new();
            var cfSorted = SyncTransforms.SerializeSortedJson(cfDict);
            map[id] = new ExistingPatientState(BuildClinicPatientCanonicalMap(
                r.GetString(1), r.GetString(2), GetStr(r, 3), GetStr(r, 4), dob, r.GetString(6),
                GetStr(r, 7), GetStr(r, 8), r.GetString(9), GetStr(r, 10), GetStr(r, 11),
                GetStr(r, 12), GetStr(r, 13), GetStr(r, 14), GetStr(r, 15), GetStr(r, 16),
                GetStr(r, 17), GetStr(r, 18), GetStr(r, 19), GetStr(r, 20) ?? "Verified", cfSorted));
        }
        return map;
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

    private static async Task<List<int>> QueryIdBucketAsync(
        NpgsqlConnection v1, string sql, int cid, int? oid, int lim, CancellationToken ct)
    {
        var list = new List<int>();
        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("cid", cid);
        cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)oid ?? DBNull.Value });
        cmd.Parameters.AddWithValue("lim", lim);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(r.GetInt32(0));
        return list;
    }

    private static async Task LoadNamesIntoSetAsync(
        NpgsqlConnection v1, string sql, int? oid, SortedSet<string> target, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, v1);
        if (oid.HasValue) cmd.Parameters.AddWithValue("oid", oid.Value);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var val = SyncTransforms.Clean(GetStr(r, 0));
            if (val is not null) target.Add(val);
        }
    }

    private static async Task<Dictionary<int, string>> LoadV1LookupIntStringAsync(NpgsqlConnection v1, string sql, CancellationToken ct)
    {
        var map = new Dictionary<int, string>();
        await using var cmd = new NpgsqlCommand(sql, v1);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            if (!r.IsDBNull(1)) map[r.GetInt32(0)] = r.GetString(1);
        }
        return map;
    }

    private static async Task<Dictionary<int, ClinicianSnapshot>> LoadV1ClinicianSnapshotsAsync(NpgsqlConnection v1, CancellationToken ct)
    {
        var map = new Dictionary<int, ClinicianSnapshot>();
        const string sql = """
            SELECT hp.id,
                   COALESCE(NULLIF(trim(concat_ws(' ', prof.title, prof.name, prof.suffix)), ''),
                            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), ''),
                            'Clinic Physician') AS doc_name,
                   pd."licenseNumber",
                   pd."ptrNumber"
            FROM public."HealthcareProvider" hp
            LEFT JOIN public."HPProfile" prof ON prof."healthcareProviderId" = hp.id
            LEFT JOIN public."User" u ON u.id = hp."userId"
            LEFT JOIN public."ProfessionalDetails" pd ON pd."healthcareProverId" = hp.id
            """;
        await using var cmd = new NpgsqlCommand(sql, v1);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetInt32(0)] = new ClinicianSnapshot(
                SyncTransforms.CleanRequired(GetStr(r, 1), "Clinic Physician", 150),
                SyncTransforms.Clean(GetStr(r, 2), 50),
                SyncTransforms.Clean(GetStr(r, 3), 50));
        }
        return map;
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
                      OR (
                          @oid IS NOT NULL
                          AND EXISTS (
                              SELECT 1 FROM public."OrganizationMember" om
                              WHERE om."userId" = u.id AND om."organizationId" = @oid
                          )
                          AND (@cid IS NULL OR NOT EXISTS (
                              SELECT 1 FROM public."ClinicPatient" cp_del
                              WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL
                          ))
                      )
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

    private static async Task<long> ScalarInt64Async(
        NpgsqlConnection conn, string sql, IEnumerable<(string Key, object Value)> parms, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (k, v) in parms) cmd.Parameters.AddWithValue(k, v);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
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
        var local = date.Value.ToDateTime(time);
        return new DateTimeOffset(local, ManilaOffset).ToUniversalTime();
    }

    private static string? GetStr(NpgsqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);

    private static DateTimeOffset? GetUtc(NpgsqlDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var val = r.GetValue(i);
        return val switch
        {
            DateTimeOffset dto => dto.ToUniversalTime(),
            DateTime dt => new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)),
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
            _ => null
        };
    }
}
