using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.V1Sync.Api.Models;

public static class SyncTrack
{
    public const string Track1Clinic = "TRACK1_CLINIC";
    public const string Track2Patient = "TRACK2_PATIENT";
    public const string Track3Storage = "TRACK3_STORAGE";
}

public static class SyncStoragePlane
{
    public const string ClinicAttachment = "CLINIC_ATTACHMENT";
    public const string PatientFile = "PATIENT_FILE";
}

public static class SyncStorageProvider
{
    public const string AzureBlob1 = "AZURE_BLOB_1";
    public const string AzureBlob2 = "AZURE_BLOB_2";
    public const string GoogleDrive = "GOOGLE_DRIVE";
    public const string Other = "OTHER";
}

public static class SyncStorageStatus
{
    public const string Pending = "PENDING";
    public const string Migrated = "MIGRATED";
    public const string Verified = "VERIFIED";
    public const string SkippedDeadLink = "SKIPPED_DEAD_LINK";
    public const string SkippedEmptyBlob = "SKIPPED_EMPTY_BLOB";
    public const string SkippedAuthRequired = "SKIPPED_AUTH_REQUIRED";
    public const string SkippedLegacyUnsupported = "SKIPPED_LEGACY_UNSUPPORTED";
    public const string FailedRetryable = "FAILED_RETRYABLE";
    public const string FailedPermanent = "FAILED_PERMANENT";
}

public static class SyncCohortMode
{
    public const string Scoped = "SCOPED";
    public const string Global = "GLOBAL";
}

public static class SyncRunMode
{
    public const string DryRun = "DRY_RUN";
    public const string Backfill = "BACKFILL";
    public const string Incremental = "INCREMENTAL";
    public const string FinalSweep = "FINAL_SWEEP";
}

public static class SyncRunStatus
{
    public const string Running = "RUNNING";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
}

public static class SyncDiffAction
{
    public const string Create = "CREATE";
    public const string Update = "UPDATE";
    public const string SkipV2Wins = "SKIP_V2_WINS";
    public const string ForceV1 = "SYNC_FORCE_V1";
    public const string ShieldDelete = "SHIELD_DELETE";
    public const string Error = "ERROR";
}

public static class SyncConflictType
{
    public const string V2Modified = "V2_MODIFIED";
    public const string V1SoftDeletedShielded = "V1_SOFT_DELETED_SHIELDED";
    public const string AmbiguousMatch = "AMBIGUOUS_MATCH";
    public const string TransformError = "TRANSFORM_ERROR";
}

public static class SyncConflictStatus
{
    public const string Open = "OPEN";
    public const string ResolvedKeepV2 = "RESOLVED_KEEP_V2";
    public const string ResolvedForceV1 = "RESOLVED_FORCE_V1";
    public const string ResolvedIgnore = "RESOLVED_IGNORE";
}

public sealed record SyncBinding(
    Guid Id,
    string Track,
    string Name,
    int? V1ClinicId,
    int? V1OrgId,
    string? V2TenantId,
    Guid? V2ClinicId,
    string PatientCohortMode,
    bool AutoSyncEnabled,
    int PollIntervalSeconds,
    bool IsFrozen,
    DateTimeOffset? FrozenAt,
    string? FrozenBy,
    string? FreezeReason,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    long LastChangelogSeq = 0,
    DateTimeOffset? LastPolledAt = null,
    int OpenConflictCount = 0,
    bool HasSyncHistory = false,
    int BatchSize = 200,
    bool HasCompletedPreview = false,
    bool HasCompletedMigration = false
);

public sealed record CreateBindingRequest(
    string Track,
    string Name,
    int? V1ClinicId,
    int? V1OrgId,
    string? V2TenantId,
    Guid? V2ClinicId,
    string? PatientCohortMode = null,
    bool AutoSyncEnabled = false,
    int? PollIntervalSeconds = null,
    int? BatchSize = null
);

public sealed record UpdateBindingRequest(
    string? Name = null,
    string? PatientCohortMode = null,
    bool? AutoSyncEnabled = null,
    int? PollIntervalSeconds = null,
    bool UpdateMapping = false,
    int? V1ClinicId = null,
    int? V1OrgId = null,
    string? V2TenantId = null,
    Guid? V2ClinicId = null,
    bool ForceMappingChange = false,
    int? BatchSize = null
);

public sealed record BindingMutationOutcome<T>(
    int StatusCode,
    T? Value = default,
    string? ErrorMessage = null
)
{
    public bool IsSuccess => StatusCode is >= 200 and < 300;
}

public sealed record DeleteBindingResponse(
    Guid DeletedId,
    string Name,
    bool HadSyncHistory
);

public sealed record RunSyncRequest(
    int? SampleLimit = null,
    bool ForceV1OnConflict = false,
    int? BatchSize = null,
    string? ProviderFilter = null,
    string? TargetPlaneFilter = null,
    int? MaxConcurrency = null,
    bool RetryFailedOnly = false
);

public sealed record FreezeBindingRequest(
    string ConfirmationToken,
    string? Reason = null
);

public sealed record ResolveConflictRequest(
    string Resolution, // "KEEP_V2" | "FORCE_V1" | "IGNORE"
    string? ResolvedBy = null
);

public sealed record ResolveConflictResponse(
    SyncConflictRecord Conflict,
    SyncRunRecord? SyncResult = null,
    SyncRunRecord? Run = null,
    string? Message = null
);

public sealed record PaginatedSyncResponse<T>(
    IReadOnlyList<T> Items,
    long Total,
    int Limit,
    int Offset
);

public sealed record V2ClinicOption(
    Guid Id,
    string Name,
    string TenantId,
    string? TenantSlug = null,
    string? FacilitySlug = null
);

public sealed record ConflictHashMetadata(
    SyncConflictRecord Conflict,
    string? IncomingV1Hash,
    string? LiveV2Hash
);

public sealed record EntitySyncCounter
{
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Unchanged { get; set; }
    public int SkippedV2Wins { get; set; }
    public int ShieldedDeletes { get; set; }
    public int AdoptedExisting { get; set; }
    public int Errors { get; set; }
}

public sealed record SyncRunSummary
{
    public string Track { get; init; } = string.Empty;
    public string Mode { get; init; } = string.Empty;
    public int? SampleLimit { get; init; }
    public int BatchSize { get; set; } = 200;
    public long DurationMs { get; set; }
    public int CohortPatientCount { get; set; }
    public long StartChangelogSeq { get; set; }
    public long EndChangelogSeq { get; set; }
    public string? CurrentStage { get; set; }
    public int StageIndex { get; set; }
    public int TotalStages { get; set; }
    public int ProcessedItems { get; set; }
    public int TotalItems { get; set; }
    public int PercentComplete { get; set; }
    public DateTimeOffset? LastProgressAtUtc { get; set; }
    public List<string> CustomFieldsProvisioned { get; init; } = new();
    public Dictionary<string, EntitySyncCounter> Entities { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Notes { get; init; } = new();
    public List<string> VerboseLogs { get; init; } = new();

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? BytesDownloaded { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? BytesUploaded { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? TransferRateMbps { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? ClinicCopiesMigrated { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PatientCopiesMigrated { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? SkippedCount { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? FailedCount { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? OverlapSavedDownloads { get; set; }

    public void AppendVerboseLog(string message)
    {
        var ts = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("HH:mm:ss");
        VerboseLogs.Add($"[{ts}] {message}");
        if (VerboseLogs.Count > 150)
        {
            VerboseLogs.RemoveRange(0, VerboseLogs.Count - 150);
        }
    }

    public EntitySyncCounter For(string entityType)
    {
        if (!Entities.TryGetValue(entityType, out var counter))
        {
            counter = new EntitySyncCounter();
            Entities[entityType] = counter;
        }
        return counter;
    }
}

public sealed record SyncRunRecord(
    Guid Id,
    Guid BindingId,
    string Mode,
    int? SampleLimit,
    string Status,
    string TriggeredBy,
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt,
    JsonElement Summary,
    string? ErrorMessage
);

public sealed record SyncChangeDiffRecord(
    long Id,
    Guid RunId,
    Guid BindingId,
    string EntityType,
    string V1Id,
    Guid? V2Id,
    string Action,
    IReadOnlyList<string> ChangedFields,
    DateTimeOffset CreatedAt
);

public sealed record SyncConflictRecord(
    Guid Id,
    Guid BindingId,
    Guid? RunId,
    string EntityType,
    string V1Id,
    Guid V2Id,
    string ConflictType,
    IReadOnlyList<string> ChangedFields,
    string Status,
    string? ResolvedBy,
    DateTimeOffset? ResolvedAt,
    DateTimeOffset CreatedAt
);

public sealed record V1TenantCatalogItem(
    int Id,
    string? TenantUid,
    string Name,
    int ClinicCount,
    int OrganizationCount
);

public sealed record V1ClinicCatalogItem(
    int Id,
    string? ClinicUid,
    string Name,
    int ClinicPatientCount,
    int AppointmentCount,
    int ConsultationCount,
    int? TenantId = null
);

public sealed record V1OrgCatalogItem(
    int Id,
    string? OrgUid,
    string Name,
    int MemberCount,
    int StudentCount,
    int EmployeeCount,
    int? TenantId = null
);

public sealed record CustomFieldExpansionPreviewItem(
    string FieldKey,
    string Label,
    string DataType,
    string Category,
    string SourceOrigin,
    int PopulatedV1Count
);

public sealed record V1CatalogResponse(
    IReadOnlyList<V1ClinicCatalogItem> Clinics,
    IReadOnlyList<V1OrgCatalogItem> Organizations,
    int TotalActiveV1Users,
    int ClerkV1Users,
    int LegacyAuth0V1Users,
    int TotalV1Files,
    int PrivateV1Files,
    IReadOnlyList<CustomFieldExpansionPreviewItem> DynamicCustomFieldsPreview,
    IReadOnlyList<V1TenantCatalogItem>? Tenants = null
);

public sealed record SyncSystemStatusResponse(
    string EnvironmentLabel,
    bool V1SourceConnected,
    bool ClinicDbConnected,
    bool PatientDbConnected,
    bool SyncLedgerConnected,
    bool V1SyncTriggersInstalled,
    int V1SyncTriggerTableCount,
    long V1ChangelogMaxSeq,
    bool BackgroundWorkerEnabled,
    DateTimeOffset? WorkerLastHeartbeatUtc,
    int ActiveBindingsCount,
    int OpenConflictsCount,
    bool ClinicR2Connected = false,
    bool PatientR2Connected = false,
    bool ClinicEncryptionConfigured = false,
    bool PatientEncryptionConfigured = false,
    bool AzureBlob1Configured = false,
    long ClinicPendingStorageCount = 0,
    long PatientPendingStorageCount = 0,
    long ClinicTotalStorageCount = 0,
    long PatientTotalStorageCount = 0,
    long ClinicSkippedStorageCount = 0,
    long PatientSkippedStorageCount = 0
);

public sealed record SyncStorageObjectDto(
    string TargetPlane,
    Guid TargetEntityId,
    Guid OwnerId,
    string? TenantId,
    string SourceProvider,
    string Status,
    long SourceSizeBytes,
    long EncryptedSizeBytes,
    int AttemptCount,
    string? LastErrorCode,
    string? LastErrorMessage,
    DateTimeOffset? MigratedAt,
    DateTimeOffset? VerifiedAt,
    DateTimeOffset UpdatedAt
);

public sealed record StorageObjectsResponse(
    Guid BindingId,
    long TotalCount,
    IReadOnlyList<SyncStorageObjectDto> Items,
    long FailedRetryableCount = 0
);

public sealed record Track3StorageCounts(
    long ClinicPending,
    long ClinicTotal,
    long PatientPending,
    long PatientTotal,
    long ClinicSkipped = 0,
    long PatientSkipped = 0
);

public sealed record SyncStorageObjectUpsert(
    Guid BindingId,
    string TargetPlane,
    Guid TargetEntityId,
    Guid OwnerId,
    string? TenantId,
    string SourceProvider,
    string SourceUrl,
    long SourceSizeBytes,
    string? SourceContentType,
    bool SourceContentTypeCaptured,
    string? SourceSha256,
    string? TargetBucket,
    string? TargetR2Key,
    long? EncryptedSizeBytes,
    string? EncryptedSha256,
    string? EncryptionKeyScheme,
    string Status,
    int AttemptDelta,
    string? LastErrorCode,
    string? LastErrorMessage,
    DateTimeOffset? MigratedAt,
    DateTimeOffset? VerifiedAt
);

public sealed record SyncStorageObjectState(
    string TargetPlane,
    Guid TargetEntityId,
    string SourceProvider,
    string SourceUrl,
    long SourceSizeBytes,
    string? SourceContentType,
    bool SourceContentTypeCaptured,
    string? SourceSha256,
    string? TargetBucket,
    string? TargetR2Key,
    long? EncryptedSizeBytes,
    string? EncryptionKeyScheme,
    string Status
);

public sealed record MigratedStorageSource(
    string SourceUrl,
    long SourceSizeBytes,
    string? SourceContentType,
    bool SourceContentTypeCaptured
);

public sealed record MigratedStorageBaselineUpdate(
    Guid TargetEntityId,
    string SourceUrl,
    string? SourceContentType,
    long SourceSizeBytes = 0
);

public sealed record ParityEntityCheck(
    string EntityType,
    long V1ExpectedCount,
    long V2ActualCount,
    long MappedLedgerCount,
    bool IsMatched,
    string? Notes = null
);

public sealed record ParityReportResponse(
    Guid BindingId,
    string Track,
    string BindingName,
    bool IsFrozen,
    long ChangelogMaxSeq,
    long LastCursorSeq,
    long ChangelogLag,
    int OpenConflictsCount,
    bool ReadyToFreeze,
    IReadOnlyList<ParityEntityCheck> Checks,
    DateTimeOffset GeneratedAtUtc
);

public sealed record FreezeBindingResponse(
    SyncBinding Binding,
    string UninstallSqlHint
);

public sealed record TrackingSqlScriptItem(
    string FileName,
    string Title,
    string Description,
    string Sql
);

public sealed record TrackingSqlScriptsResponse(
    TrackingSqlScriptItem Install,
    TrackingSqlScriptItem Uninstall
);

public sealed record PatientIdentitySummaryRecord(
    long TotalPrimaryPatients,
    long ClerkLinkedCount,
    long UnlinkedCount,
    long ReclaimedViaEmailCount,
    long AmbiguousDuplicateEmailGroups,
    long AmbiguousDuplicatePatientCount
);

public sealed record PatientIdentityItemRecord(
    Guid PatientId,
    string ClinicEzId,
    string FirstName,
    string LastName,
    string? Email,
    string? ClerkUserId,
    string IdentityStatus,
    int DuplicateEmailCount,
    string? V1UserId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? UpdatedAtUtc,
    string? UpdatedBy
);

public sealed record PatientIdentityDirectoryResponse(
    PatientIdentitySummaryRecord Summary,
    IReadOnlyList<PatientIdentityItemRecord> Items,
    long TotalMatching,
    int Limit,
    int Offset
);

public sealed record BindClerkIdentityRequest(
    string Action, // "BIND_CLERK" | "UNBIND_CLERK"
    string? ClerkUserId = null,
    string? Reason = null
);

public sealed record BindClerkIdentityResponse(
    PatientIdentityItemRecord Item,
    string Action
);

public sealed record SyncRuntimeSettings(
    string EnvironmentLabel,
    int MaxPoolSize,
    int DefaultBatchSize,
    bool EnableBackgroundWorker,
    int DefaultPollIntervalSeconds,
    int OvernightPollIntervalSeconds,
    int OvernightBackoffStartHourPh,
    int OvernightBackoffEndHourPh,
    bool StorageEnabled,
    int StorageMaxConcurrency,
    long StorageMaxFileSizeBytes,
    double StorageVerificationSampleRate,
    bool AzureBlob1Enabled,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt
);

public sealed record UpdateSyncRuntimeSettingsRequest(
    string? EnvironmentLabel = null,
    int? MaxPoolSize = null,
    int? DefaultBatchSize = null,
    bool? EnableBackgroundWorker = null,
    int? DefaultPollIntervalSeconds = null,
    int? OvernightPollIntervalSeconds = null,
    int? OvernightBackoffStartHourPh = null,
    int? OvernightBackoffEndHourPh = null,
    bool? StorageEnabled = null,
    int? StorageMaxConcurrency = null,
    long? StorageMaxFileSizeBytes = null,
    double? StorageVerificationSampleRate = null,
    bool? AzureBlob1Enabled = null
);

public sealed record SyncRuntimeSettingsResponse(
    string EnvironmentLabel,
    int MaxPoolSize,
    int ActiveMaxPoolSize,
    bool PoolSizeRestartRequired,
    int DefaultBatchSize,
    bool EnableBackgroundWorker,
    int DefaultPollIntervalSeconds,
    int OvernightPollIntervalSeconds,
    int OvernightBackoffStartHourPh,
    int OvernightBackoffEndHourPh,
    bool StorageEnabled,
    int StorageMaxConcurrency,
    long StorageMaxFileSizeBytes,
    double StorageVerificationSampleRate,
    bool AzureBlob1Enabled,
    bool ClinicStorageConfigured,
    bool PatientStorageConfigured,
    bool ClinicEncryptionConfigured,
    bool PatientEncryptionConfigured,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt
);

public sealed record MappingGuideColumnRule(
    string V1Column,
    string V2Column,
    string? Transform = null
);

public sealed record MappingGuideEntityItem(
    string Key,
    string DisplayName,
    string Category,
    string V1SourceTables,
    string V2TargetTable,
    string Summary,
    IReadOnlyList<string> Rules,
    IReadOnlyList<MappingGuideColumnRule> Columns,
    string? ConflictPolicy = null
);

public sealed record MappingGuideTrackSection(
    string Track,
    string Title,
    string TargetDatabase,
    string Overview,
    IReadOnlyList<string> GlobalRules,
    IReadOnlyList<MappingGuideEntityItem> Entities
);

public sealed record MappingGuideResponse(
    string Version,
    IReadOnlyList<string> CoreProtections,
    IReadOnlyList<MappingGuideTrackSection> Tracks
);
