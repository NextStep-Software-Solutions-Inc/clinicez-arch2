using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ClinicEz.V1Sync.Api.Models;

public static class FieldDiffClassification
{
    public const string V2FilledEmpty = "V2_FILLED_EMPTY";
    public const string V2ClearedValue = "V2_CLEARED_VALUE";
    public const string FormatOnly = "FORMAT_ONLY";
    public const string Modified = "MODIFIED";
    public const string Unchanged = "UNCHANGED";
}

public static class FieldSensitivity
{
    public const string SafeEnumOrBool = "SAFE_ENUM_OR_BOOL";
    public const string PiiMasked = "PII_MASKED";
    public const string ClinicalMeasurement = "CLINICAL_MEASUREMENT";
    public const string ClinicalNote = "CLINICAL_NOTE";
    public const string StructuredJson = "STRUCTURED_JSON";
}

public static class ConflictRecordStatus
{
    public const string Active = "ACTIVE";
    public const string SoftDeleted = "SOFT_DELETED";
    public const string Missing = "MISSING";
    public const string MissingOrOutOfScope = "MISSING_OR_OUT_OF_SCOPE";
    public const string Unavailable = "UNAVAILABLE";
}

public static class ConflictInspectorMode
{
    public const string FieldDiff = "FIELD_DIFF";
    public const string MetadataOnly = "METADATA_ONLY";
}

public sealed record ConflictSubFieldDiffDto(
    string Key,
    string Classification,
    bool IsChanged,
    string? V1Preview,
    string? V2Preview,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? V1Value = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? V2Value = null
);

public sealed record ConflictFieldDiffDto(
    string FieldName,
    string Label,
    string Classification,
    bool IsChanged,
    string Sensitivity,
    string? V1Preview,
    string? V2Preview,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? V1Value = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? V2Value = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<ConflictSubFieldDiffDto>? SubFieldDiffs = null
);

public sealed record ConflictDetailResponse(
    SyncConflictRecord Conflict,
    string BindingName,
    string Track,
    string InspectorMode,
    string V1RecordStatus,
    string V2RecordStatus,
    DateTimeOffset? V1UpdatedAtUtc,
    DateTimeOffset? V2UpdatedAtUtc,
    bool IsStale,
    bool HasV1HashDrift,
    bool HasV2HashDrift,
    string? RecordedV1Hash,
    string? CurrentV1Hash,
    string? RecordedV2Hash,
    string? CurrentV2Hash,
    IReadOnlyList<string> StaleReasons,
    bool ValuesRevealed,
    bool ClinicalNotesRedactedByPolicy,
    string? Note,
    IReadOnlyList<ConflictFieldDiffDto> Fields
);

public sealed record ConflictReportFieldSummaryDto(
    string FieldName,
    string Classification
);

public sealed record ConflictReviewReportItemDto(
    Guid ConflictId,
    string EntityType,
    string V1Id,
    Guid V2Id,
    string ConflictType,
    string Status,
    string InspectorMode,
    string V1RecordStatus,
    string V2RecordStatus,
    bool IsStale,
    DateTimeOffset? V1UpdatedAtUtc,
    DateTimeOffset? V2UpdatedAtUtc,
    IReadOnlyList<string> ChangedFields,
    IReadOnlyList<ConflictReportFieldSummaryDto> FieldClassifications,
    string? ResolvedBy,
    DateTimeOffset? ResolvedAtUtc,
    DateTimeOffset CreatedAtUtc
);

public sealed record ConflictReviewReportResponse(
    Guid BindingId,
    string BindingName,
    string Track,
    string StatusFilter,
    int TotalConflicts,
    bool Truncated,
    DateTimeOffset GeneratedAtUtc,
    IReadOnlyList<ConflictReviewReportItemDto> Items
);
