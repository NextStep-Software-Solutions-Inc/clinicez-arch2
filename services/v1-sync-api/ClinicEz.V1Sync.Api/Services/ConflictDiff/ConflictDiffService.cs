using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace ClinicEz.V1Sync.Api.Services.ConflictDiff;

public sealed class ConflictDiffService
{
    public const int DefaultReportMaxRows = 2000;

    private readonly SyncConnectionFactory _connections;
    private readonly SyncLedgerRepository _ledger;
    private readonly IConfiguration _config;
    private readonly ILogger<ConflictDiffService> _logger;
    private readonly Dictionary<(string Track, string EntityType), IConflictDiffInspector> _inspectors;

    public ConflictDiffService(
        SyncConnectionFactory connections,
        SyncLedgerRepository ledger,
        IEnumerable<IConflictDiffInspector> inspectors,
        IConfiguration config,
        ILogger<ConflictDiffService> logger)
    {
        _connections = connections;
        _ledger = ledger;
        _config = config;
        _logger = logger;
        _inspectors = new Dictionary<(string Track, string EntityType), IConflictDiffInspector>(
            TupleIgnoreCaseComparer.Instance);

        foreach (var inspector in inspectors)
        {
            _inspectors[(inspector.Track, NormalizeEntityType(inspector.EntityType))] = inspector;
        }
    }

    public static string NormalizeEntityType(string entityType) =>
        string.Equals(entityType, "PatientPhilHealth", StringComparison.OrdinalIgnoreCase)
            ? "PatientPhilHealthMembership"
            : entityType.Trim();

    public bool TryGetInspector(string track, string entityType, out IConflictDiffInspector? inspector) =>
        _inspectors.TryGetValue((track, NormalizeEntityType(entityType)), out inspector);

    public async Task<ConflictDetailResponse> GetConflictDetailAsync(
        Guid conflictId,
        bool revealValues,
        string? reason,
        string actor,
        bool mfaVerified,
        CancellationToken ct)
    {
        var meta = await _ledger.GetConflictWithHashesAsync(conflictId, ct)
            ?? throw new KeyNotFoundException($"Sync conflict '{conflictId}' was not found.");
        var binding = await _ledger.GetBindingAsync(meta.Conflict.BindingId, ct)
            ?? throw new KeyNotFoundException($"Sync binding '{meta.Conflict.BindingId}' was not found.");

        var allowClinicalNotes = _config.GetValue("V1Sync:AllowBreakGlassClinicalNotes", false);
        ConflictDetailResponse response;

        if (!TryGetInspector(binding.Track, meta.Conflict.EntityType, out var inspector) || inspector is null)
        {
            response = BuildMetadataOnlyDetail(meta, binding, revealValues);
        }
        else if (!CanOpenTargetConnections(binding.Track))
        {
            response = BuildMetadataOnlyDetail(
                meta,
                binding,
                revealValues,
                note: "Live source or destination database connection is not configured for on-demand diff loading. Showing stored conflict metadata only.");
        }
        else
        {
            await using var v1 = await _connections.OpenV1SourceAsync(ct);
            await using var v2 = await OpenTargetDbAsync(binding.Track, ct);

            var snapshot = await inspector.LoadSnapshotAsync(binding, meta.Conflict, v1, v2, ct);
            response = BuildFieldDiffDetail(meta, binding, snapshot, revealValues, allowClinicalNotes);
        }

        if (revealValues)
        {
            var revealedFieldCount = response.Fields.Count(f => f.V1Value is not null || f.V2Value is not null);
            await _ledger.AppendAuditAsync(
                binding.Id,
                "CONFLICT_DIFF_VALUES_REVEALED",
                actor,
                new
                {
                    conflictId = meta.Conflict.Id,
                    entityType = meta.Conflict.EntityType,
                    v1Id = meta.Conflict.V1Id,
                    v2Id = meta.Conflict.V2Id,
                    reason = reason?.Trim(),
                    mfaVerified,
                    inspectorMode = response.InspectorMode,
                    revealedFieldCount,
                    clinicalNotesRedactedByPolicy = response.ClinicalNotesRedactedByPolicy
                },
                ct);
        }

        return response;
    }

    public async Task<ConflictReviewReportResponse> BuildReviewReportAsync(
        Guid bindingId,
        string? statusFilter,
        CancellationToken ct,
        int maxRows = DefaultReportMaxRows)
    {
        var binding = await _ledger.GetBindingAsync(bindingId, ct)
            ?? throw new KeyNotFoundException($"Sync binding '{bindingId}' was not found.");

        var normalizedStatus = NormalizeStatusFilter(statusFilter);
        var (rows, total) = await _ledger.ListConflictsWithHashesForReportAsync(
            bindingId, normalizedStatus, maxRows, ct);

        var items = new List<ConflictReviewReportItemDto>(rows.Count);
        var hasMappedRows = rows.Any(m => TryGetInspector(binding.Track, m.Conflict.EntityType, out _));

        NpgsqlConnection? v1 = null;
        NpgsqlConnection? v2 = null;
        try
        {
            if (hasMappedRows && CanOpenTargetConnections(binding.Track))
            {
                try
                {
                    v1 = await _connections.OpenV1SourceAsync(ct);
                    v2 = await OpenTargetDbAsync(binding.Track, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        "Conflict report fell back to metadata-only mode for binding {BindingId}: {Error}",
                        bindingId,
                        SyncTransforms.SanitizeErrorMessage(ex));
                    if (v1 is not null) { await v1.DisposeAsync(); v1 = null; }
                    if (v2 is not null) { await v2.DisposeAsync(); v2 = null; }
                }
            }

            foreach (var meta in rows)
            {
                ConflictDetailResponse detail;
                if (v1 is not null &&
                    v2 is not null &&
                    TryGetInspector(binding.Track, meta.Conflict.EntityType, out var inspector) &&
                    inspector is not null)
                {
                    var snapshot = await inspector.LoadSnapshotAsync(binding, meta.Conflict, v1, v2, ct);
                    detail = BuildFieldDiffDetail(meta, binding, snapshot, revealValues: false, allowClinicalNotes: false);
                }
                else
                {
                    detail = BuildMetadataOnlyDetail(meta, binding, revealValues: false);
                }

                // Strictly Zero-PHI report projection: field names & classifications only (never raw values or previews)
                var classifications = detail.Fields
                    .Where(f => f.IsChanged)
                    .Select(f => new ConflictReportFieldSummaryDto(f.FieldName, f.Classification))
                    .ToList();

                var changedFieldNames = detail.InspectorMode == ConflictInspectorMode.FieldDiff && classifications.Count > 0
                    ? classifications.Select(c => c.FieldName).ToList()
                    : meta.Conflict.ChangedFields.ToList();

                items.Add(new ConflictReviewReportItemDto(
                    ConflictId: meta.Conflict.Id,
                    EntityType: meta.Conflict.EntityType,
                    V1Id: meta.Conflict.V1Id,
                    V2Id: meta.Conflict.V2Id,
                    ConflictType: meta.Conflict.ConflictType,
                    Status: meta.Conflict.Status,
                    InspectorMode: detail.InspectorMode,
                    V1RecordStatus: detail.V1RecordStatus,
                    V2RecordStatus: detail.V2RecordStatus,
                    IsStale: detail.IsStale,
                    V1UpdatedAtUtc: detail.V1UpdatedAtUtc,
                    V2UpdatedAtUtc: detail.V2UpdatedAtUtc,
                    ChangedFields: changedFieldNames,
                    FieldClassifications: classifications,
                    ResolvedBy: meta.Conflict.ResolvedBy,
                    ResolvedAtUtc: meta.Conflict.ResolvedAt,
                    CreatedAtUtc: meta.Conflict.CreatedAt));
            }
        }
        finally
        {
            if (v2 is not null) await v2.DisposeAsync();
            if (v1 is not null) await v1.DisposeAsync();
        }

        return new ConflictReviewReportResponse(
            BindingId: binding.Id,
            BindingName: binding.Name,
            Track: binding.Track,
            StatusFilter: normalizedStatus ?? "ALL",
            TotalConflicts: (int)Math.Min(total, int.MaxValue),
            Truncated: total > rows.Count,
            GeneratedAtUtc: DateTimeOffset.UtcNow,
            Items: items);
    }

    public static string FormatReportCsv(ConflictReviewReportResponse report)
    {
        var sb = new StringBuilder(1024 + report.Items.Count * 160);
        sb.AppendLine(
            "binding_id,binding_name,track,conflict_id,entity_type,v1_id,v2_id,conflict_type,status,inspector_mode,v1_record_status,v2_record_status,is_stale,v1_updated_at_utc,v2_updated_at_utc,changed_fields,field_classifications,resolved_by,resolved_at_utc,created_at_utc");

        foreach (var item in report.Items)
        {
            var changedFields = string.Join("; ", item.ChangedFields);
            var fieldClassifications = string.Join(
                "; ",
                item.FieldClassifications.Select(fc => $"{fc.FieldName}:{fc.Classification}"));

            var cols = new[]
            {
                ConflictFieldMasker.SanitizeCsvCell(report.BindingId.ToString("D")),
                ConflictFieldMasker.SanitizeCsvCell(report.BindingName),
                ConflictFieldMasker.SanitizeCsvCell(report.Track),
                ConflictFieldMasker.SanitizeCsvCell(item.ConflictId.ToString("D")),
                ConflictFieldMasker.SanitizeCsvCell(item.EntityType),
                ConflictFieldMasker.SanitizeCsvCell(item.V1Id),
                ConflictFieldMasker.SanitizeCsvCell(item.V2Id.ToString("D")),
                ConflictFieldMasker.SanitizeCsvCell(item.ConflictType),
                ConflictFieldMasker.SanitizeCsvCell(item.Status),
                ConflictFieldMasker.SanitizeCsvCell(item.InspectorMode),
                ConflictFieldMasker.SanitizeCsvCell(item.V1RecordStatus),
                ConflictFieldMasker.SanitizeCsvCell(item.V2RecordStatus),
                item.IsStale ? "true" : "false",
                ConflictFieldMasker.SanitizeCsvCell(item.V1UpdatedAtUtc?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)),
                ConflictFieldMasker.SanitizeCsvCell(item.V2UpdatedAtUtc?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)),
                ConflictFieldMasker.SanitizeCsvCell(changedFields),
                ConflictFieldMasker.SanitizeCsvCell(fieldClassifications),
                ConflictFieldMasker.SanitizeCsvCell(item.ResolvedBy),
                ConflictFieldMasker.SanitizeCsvCell(item.ResolvedAtUtc?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)),
                ConflictFieldMasker.SanitizeCsvCell(item.CreatedAtUtc.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)),
            };
            sb.AppendLine(string.Join(',', cols));
        }

        return sb.ToString();
    }

    public static string? NormalizeStatusFilter(string? rawStatus)
    {
        if (string.IsNullOrWhiteSpace(rawStatus))
        {
            return null;
        }

        var norm = rawStatus.Trim().ToUpperInvariant();
        if (norm == "ALL")
        {
            return null;
        }

        return norm switch
        {
            SyncConflictStatus.Open or
            SyncConflictStatus.ResolvedKeepV2 or
            SyncConflictStatus.ResolvedForceV1 or
            SyncConflictStatus.ResolvedIgnore => norm,
            _ => throw new ArgumentException(
                $"Unsupported conflict status filter '{rawStatus}'. Expected ALL, OPEN, RESOLVED_KEEP_V2, RESOLVED_FORCE_V1, or RESOLVED_IGNORE.")
        };
    }

    private bool CanOpenTargetConnections(string track) =>
        _connections.HasV1Source && track switch
        {
            SyncTrack.Track1Clinic => _connections.HasClinicDb,
            SyncTrack.Track2Patient => _connections.HasPatientDb,
            _ => false
        };

    private Task<NpgsqlConnection> OpenTargetDbAsync(string track, CancellationToken ct) =>
        track switch
        {
            SyncTrack.Track1Clinic => _connections.OpenClinicDbAsync(ct),
            SyncTrack.Track2Patient => _connections.OpenPatientDbAsync(ct),
            _ => throw new InvalidOperationException($"Conflict inspection is not supported for track '{track}'.")
        };

    private static ConflictDetailResponse BuildMetadataOnlyDetail(
        ConflictHashMetadata meta,
        SyncBinding binding,
        bool revealValues,
        string? note = null)
    {
        var fields = meta.Conflict.ChangedFields
            .Select(name => new ConflictFieldDiffDto(
                FieldName: name,
                Label: ConflictFieldMasker.FormatFieldLabel(name),
                Classification: FieldDiffClassification.Modified,
                IsChanged: true,
                Sensitivity: FieldSensitivity.PiiMasked,
                V1Preview: null,
                V2Preview: null,
                V1Value: null,
                V2Value: null))
            .ToList();

        return new ConflictDetailResponse(
            Conflict: meta.Conflict,
            BindingName: binding.Name,
            Track: binding.Track,
            InspectorMode: ConflictInspectorMode.MetadataOnly,
            V1RecordStatus: ConflictRecordStatus.Unavailable,
            V2RecordStatus: ConflictRecordStatus.Unavailable,
            V1UpdatedAtUtc: null,
            V2UpdatedAtUtc: null,
            IsStale: false,
            HasV1HashDrift: false,
            HasV2HashDrift: false,
            RecordedV1Hash: meta.IncomingV1Hash,
            CurrentV1Hash: null,
            RecordedV2Hash: meta.LiveV2Hash,
            CurrentV2Hash: null,
            StaleReasons: Array.Empty<string>(),
            ValuesRevealed: revealValues,
            ClinicalNotesRedactedByPolicy: false,
            Note: note ?? $"Field-level live diff inspection is not yet mapped for '{meta.Conflict.EntityType}'. Showing recorded conflict metadata only.",
            Fields: fields);
    }

    private static ConflictDetailResponse BuildFieldDiffDetail(
        ConflictHashMetadata meta,
        SyncBinding binding,
        ConflictLiveSnapshot snapshot,
        bool revealValues,
        bool allowClinicalNotes)
    {
        var conflict = meta.Conflict;
        var currentV1Hash = snapshot.V1CanonicalFields is not null
            ? DeterministicUuid.ComputeCanonicalHash(snapshot.V1CanonicalFields)
            : null;
        var currentV2Hash = snapshot.V2CanonicalFields is not null
            ? DeterministicUuid.ComputeCanonicalHash(snapshot.V2CanonicalFields)
            : null;

        var hasV1Drift = !string.IsNullOrWhiteSpace(meta.IncomingV1Hash) &&
                         currentV1Hash is not null &&
                         !string.Equals(meta.IncomingV1Hash, currentV1Hash, StringComparison.Ordinal);

        var hasV2Drift = !string.IsNullOrWhiteSpace(meta.LiveV2Hash) &&
                         currentV2Hash is not null &&
                         !string.Equals(meta.LiveV2Hash, currentV2Hash, StringComparison.Ordinal);

        var staleReasons = new List<string>();
        var isDeletionShield = string.Equals(
            conflict.ConflictType,
            SyncConflictType.V1SoftDeletedShielded,
            StringComparison.Ordinal);

        if (isDeletionShield)
        {
            if (snapshot.V1RecordStatus == ConflictRecordStatus.Active)
            {
                staleReasons.Add("Classic (v1) record is active again since this Deletion Shield conflict was logged.");
            }
            if (hasV2Drift)
            {
                staleReasons.Add("Clinic EZ v2 record changed since this conflict was logged.");
            }
            if (snapshot.V2RecordStatus != ConflictRecordStatus.Active)
            {
                staleReasons.Add("Clinic EZ v2 record is missing or soft-deleted.");
            }
        }
        else
        {
            if (hasV1Drift)
            {
                staleReasons.Add("Classic (v1) record changed since this conflict was logged.");
            }
            if (hasV2Drift)
            {
                staleReasons.Add("Clinic EZ v2 record changed since this conflict was logged.");
            }
            if (snapshot.V1RecordStatus == ConflictRecordStatus.SoftDeleted)
            {
                staleReasons.Add("Classic (v1) record is now soft-deleted; Use Classic (v1) will be blocked by Deletion Shield.");
            }
            else if (snapshot.V1RecordStatus != ConflictRecordStatus.Active)
            {
                staleReasons.Add("Classic (v1) record is missing or out of scope for this binding; Use Classic (v1) will be blocked.");
            }
            if (snapshot.V2RecordStatus == ConflictRecordStatus.SoftDeleted)
            {
                staleReasons.Add("Clinic EZ v2 record has been soft-deleted.");
            }
            else if (snapshot.V2RecordStatus != ConflictRecordStatus.Active)
            {
                staleReasons.Add("Clinic EZ v2 record was not found.");
            }
        }

        var isStale = staleReasons.Count > 0;
        var clinicalNotesRedactedByPolicy = false;
        var fields = new List<ConflictFieldDiffDto>(snapshot.FieldSpecs.Count);

        foreach (var spec in snapshot.FieldSpecs)
        {
            string? v1Raw = null;
            string? v2Raw = null;
            snapshot.V1CanonicalFields?.TryGetValue(spec.FieldName, out v1Raw);
            snapshot.V2CanonicalFields?.TryGetValue(spec.FieldName, out v2Raw);

            var classification = ConflictFieldClassifier.Classify(v1Raw, v2Raw);
            var isChanged = !string.Equals(classification, FieldDiffClassification.Unchanged, StringComparison.Ordinal);

            var isClinicalNote = string.Equals(spec.Sensitivity, FieldSensitivity.ClinicalNote, StringComparison.Ordinal);
            var canRevealThisField = revealValues && (!isClinicalNote || allowClinicalNotes);
            if (revealValues && isClinicalNote && !allowClinicalNotes &&
                (!string.IsNullOrWhiteSpace(v1Raw) || !string.IsNullOrWhiteSpace(v2Raw)))
            {
                clinicalNotesRedactedByPolicy = true;
            }

            IReadOnlyList<ConflictSubFieldDiffDto>? subDiffs = null;
            if (string.Equals(spec.Sensitivity, FieldSensitivity.StructuredJson, StringComparison.Ordinal))
            {
                subDiffs = ConflictFieldMasker.BuildJsonSubFieldDiffs(v1Raw, v2Raw, canRevealThisField);
            }

            fields.Add(new ConflictFieldDiffDto(
                FieldName: spec.FieldName,
                Label: spec.Label,
                Classification: classification,
                IsChanged: isChanged,
                Sensitivity: spec.Sensitivity,
                V1Preview: ConflictFieldMasker.MaskPreview(spec.FieldName, spec.Sensitivity, v1Raw),
                V2Preview: ConflictFieldMasker.MaskPreview(spec.FieldName, spec.Sensitivity, v2Raw),
                V1Value: canRevealThisField ? v1Raw : null,
                V2Value: canRevealThisField ? v2Raw : null,
                SubFieldDiffs: subDiffs));
        }

        return new ConflictDetailResponse(
            Conflict: conflict,
            BindingName: binding.Name,
            Track: binding.Track,
            InspectorMode: ConflictInspectorMode.FieldDiff,
            V1RecordStatus: snapshot.V1RecordStatus,
            V2RecordStatus: snapshot.V2RecordStatus,
            V1UpdatedAtUtc: snapshot.V1UpdatedAtUtc,
            V2UpdatedAtUtc: snapshot.V2UpdatedAtUtc,
            IsStale: isStale,
            HasV1HashDrift: hasV1Drift,
            HasV2HashDrift: hasV2Drift,
            RecordedV1Hash: meta.IncomingV1Hash,
            CurrentV1Hash: currentV1Hash,
            RecordedV2Hash: meta.LiveV2Hash,
            CurrentV2Hash: currentV2Hash,
            StaleReasons: staleReasons,
            ValuesRevealed: revealValues,
            ClinicalNotesRedactedByPolicy: clinicalNotesRedactedByPolicy,
            Note: snapshot.Note,
            Fields: fields);
    }

    private sealed class TupleIgnoreCaseComparer : IEqualityComparer<(string Track, string EntityType)>
    {
        public static readonly TupleIgnoreCaseComparer Instance = new();

        public bool Equals((string Track, string EntityType) x, (string Track, string EntityType) y) =>
            string.Equals(x.Track, y.Track, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(x.EntityType, y.EntityType, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode((string Track, string EntityType) obj) =>
            HashCode.Combine(
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Track),
                StringComparer.OrdinalIgnoreCase.GetHashCode(obj.EntityType));
    }
}
