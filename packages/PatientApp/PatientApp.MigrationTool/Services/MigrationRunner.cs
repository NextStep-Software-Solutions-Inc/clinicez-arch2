using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Npgsql;
using PatientApp.MigrationTool.Models;

namespace PatientApp.MigrationTool.Services;

public sealed class MigrationRunner(
    PgSchemaInspector inspector,
    TargetSchemaReader targetSchemaReader,
    MappingEngine mappingEngine,
    ReportStore reportStore,
    MigrationState state,
    IOptions<MigrationToolOptions> options)
{
    private static readonly JsonSerializerOptions CompactJsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<MigrationReport> CheckAsync(CancellationToken cancellationToken)
    {
        var targetSchema = targetSchemaReader.Read();
        var report = new MigrationReport
        {
            Phase = "connection-check",
            SourceCheck = await inspector.CheckSourceAsync(cancellationToken),
            TargetCheck = await inspector.CheckTargetAsync(targetSchema, cancellationToken),
            TargetTableCount = targetSchema.Tables.Count,
        };

        report.Messages = BuildMessages(report);
        state.SetLatest(report);
        await reportStore.SaveAsync(report, cancellationToken);
        return report;
    }

    public async Task<MigrationReport> ScanAsync(CancellationToken cancellationToken)
    {
        var targetSchema = targetSchemaReader.Read();
        var sourceSchema = await inspector.ReadSourceSchemaAsync(cancellationToken);
        var plan = mappingEngine.Build(sourceSchema, targetSchema);

        var report = new MigrationReport
        {
            Phase = "scan",
            SourceCheck = await inspector.CheckSourceAsync(cancellationToken),
            TargetCheck = await inspector.CheckTargetAsync(targetSchema, cancellationToken),
            SourceTableCount = sourceSchema.Tables.Count,
            TargetTableCount = targetSchema.Tables.Count,
            TotalSourceRows = sourceSchema.Tables.Sum(t => t.RowCount.GetValueOrDefault()),
            TableMappings = plan.TableMappings,
            Messages = ["Source schema scanned. Review mappings, then run dry-run."],
        };

        state.SetLatest(report);
        await reportStore.SaveAsync(report, cancellationToken);
        return report;
    }

    public async Task<MigrationReport> DryRunAsync(CancellationToken cancellationToken)
    {
        return await RunAsync(apply: false, cancellationToken);
    }

    public async Task<MigrationReport> ApplyAsync(CancellationToken cancellationToken)
    {
        var latest = state.LatestReport;
        if (latest is null || !latest.DryRunSucceeded)
            throw new InvalidOperationException("A successful dry-run is required before apply.");

        return await RunAsync(apply: true, cancellationToken);
    }

    private async Task<MigrationReport> RunAsync(bool apply, CancellationToken cancellationToken)
    {
        var targetSchema = targetSchemaReader.Read();
        var sourceSchema = await inspector.ReadSourceSchemaAsync(cancellationToken);
        var sourceCheck = await inspector.CheckSourceAsync(cancellationToken);
        var targetCheck = await inspector.CheckTargetAsync(targetSchema, cancellationToken);
        var plan = mappingEngine.Build(sourceSchema, targetSchema);

        if (!sourceCheck.CanConnect)
            throw new InvalidOperationException(sourceCheck.Message);

        if (!targetCheck.CanConnect || !targetCheck.IsTargetEmpty)
            throw new InvalidOperationException(targetCheck.Message);

        var idMap = await BuildIdMapAsync(sourceSchema, targetSchema, plan, cancellationToken);
        var trash = new List<TrashEntry>();
        var tableResults = new List<TableMigrationResult>();
        var generatedUuidCount = idMap.Count;
        var uniqueValueTracker = new UniqueValueTracker();

        NpgsqlConnection? targetConnection = null;
        NpgsqlTransaction? transaction = null;

        try
        {
            if (apply)
            {
                targetConnection = new NpgsqlConnection(PostgresConnectionString.Normalize(options.Value.TargetConnection));
                await targetConnection.OpenAsync(cancellationToken);
                transaction = await targetConnection.BeginTransactionAsync(cancellationToken);
            }

            foreach (var mapping in SortMappingsForInsert(plan))
            {
                var sourceTable = sourceSchema.FindTable(mapping.SourceTableKey);
                var targetTable = mapping.TargetTableName is null ? null : targetSchema.FindTable(mapping.TargetTableName);
                var result = new TableMigrationResult
                {
                    SourceTable = mapping.SourceTableKey,
                    TargetTable = mapping.TargetTableName,
                };

                if (sourceTable is null || targetTable is null)
                {
                    var count = sourceTable?.RowCount.GetValueOrDefault() ?? 0;
                    result.SourceRows = count;
                    result.TrashedRows = count;
                    trash.Add(new TrashEntry
                    {
                        SourceTable = mapping.SourceTableKey,
                        TargetTable = mapping.TargetTableName,
                        ReasonCode = mapping.Status == "deprecated" ? "DeprecatedTable" : "UnmappedTable",
                        Detail = mapping.Reason,
                    });
                    tableResults.Add(result);
                    continue;
                }

                await foreach (var row in inspector.ReadRowsAsync(sourceTable, cancellationToken))
                {
                    result.SourceRows++;
                    var transform = TransformRow(row, mapping, sourceSchema, targetSchema, plan, idMap, uniqueValueTracker);
                    if (!transform.Success)
                    {
                        result.TrashedRows++;
                        trash.AddRange(transform.Trash);
                        continue;
                    }

                    if (transform.Trash.Count > 0)
                        trash.AddRange(transform.Trash);

                    result.TransferableRows++;
                    if (apply && targetConnection is not null && transaction is not null)
                    {
                        await InsertRowAsync(targetConnection, transaction, targetTable, transform.Values, cancellationToken);
                        result.InsertedRows++;
                    }
                }

                result.Notes = mapping.ColumnMappings
                    .Where(c => c.Action is "generated_uuid" or "generated_default" or "fk_remap")
                    .Select(c => $"{c.TargetColumn}: {c.Notes}")
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(8)
                    .ToArray();
                tableResults.Add(result);
            }

            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            if (transaction is not null)
                await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
        finally
        {
            if (transaction is not null)
                await transaction.DisposeAsync();
            if (targetConnection is not null)
                await targetConnection.DisposeAsync();
        }

        var report = new MigrationReport
        {
            Phase = apply ? "applied" : "dry-run",
            SourceCheck = sourceCheck,
            TargetCheck = targetCheck,
            SourceTableCount = sourceSchema.Tables.Count,
            TargetTableCount = targetSchema.Tables.Count,
            TotalSourceRows = tableResults.Sum(r => r.SourceRows),
            TotalTransferableRows = tableResults.Sum(r => r.TransferableRows),
            TotalInsertedRows = tableResults.Sum(r => r.InsertedRows),
            TotalTrashedRows = tableResults.Sum(r => r.TrashedRows),
            GeneratedUuidCount = generatedUuidCount,
            TableMappings = plan.TableMappings,
            TableResults = tableResults,
            Trash = trash,
            IdMap = idMap.Values
                .OrderBy(entry => entry.SourceTable, StringComparer.OrdinalIgnoreCase)
                .ThenBy(entry => entry.SourceKey, StringComparer.OrdinalIgnoreCase)
                .Take(5000)
                .ToArray(),
            DryRunSucceeded = !apply,
            ApplySucceeded = apply,
            Messages = apply
                ? ["Apply completed and committed successfully."]
                : ["Dry-run completed. Apply is enabled only while the target PatientApp tables remain empty."],
        };

        state.SetLatest(report);
        await reportStore.SaveAsync(report, cancellationToken);
        return report;
    }

    private async Task<Dictionary<string, IdMapEntry>> BuildIdMapAsync(
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MappingPlan plan,
        CancellationToken cancellationToken)
    {
        var idMap = new Dictionary<string, IdMapEntry>(StringComparer.OrdinalIgnoreCase);

        foreach (var mapping in plan.TableMappings.Where(m => m.TargetTableName is not null))
        {
            var sourceTable = sourceSchema.FindTable(mapping.SourceTableKey);
            var targetTable = targetSchema.FindTable(mapping.TargetTableName ?? string.Empty);
            if (sourceTable is null || targetTable is null)
                continue;

            await foreach (var row in inspector.ReadRowsAsync(sourceTable, cancellationToken))
            {
                var sourceKey = GetSourceKey(row);
                var id = DeterministicGuid.Create($"{sourceTable.Key}:{sourceKey}");
                idMap[BuildMapKey(sourceTable.Key, sourceKey)] = new IdMapEntry
                {
                    SourceTable = sourceTable.Key,
                    SourceKey = sourceKey,
                    TargetTable = targetTable.Name,
                    TargetId = id,
                };
            }
        }

        return idMap;
    }

    private RowTransformResult TransformRow(
        SourceRow row,
        TableMapping mapping,
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MappingPlan plan,
        Dictionary<string, IdMapEntry> idMap,
        UniqueValueTracker uniqueValueTracker)
    {
        var targetTable = mapping.TargetTableName is null ? null : targetSchema.FindTable(mapping.TargetTableName);
        if (targetTable is null)
        {
            return new RowTransformResult
            {
                Success = false,
                Trash =
                [
                    BuildTrash(row, mapping, "UnmappedTable", "No target table is available for this source row.")
                ],
            };
        }

        var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var trash = new List<TrashEntry>();
        var notes = new List<string>();
        var sourceKey = GetSourceKey(row);

        foreach (var targetColumn in targetTable.Columns)
        {
            if (targetColumn.IsPrimaryKey && string.Equals(targetColumn.Name, "id", StringComparison.OrdinalIgnoreCase))
            {
                values[targetColumn.Name] = idMap[BuildMapKey(row.Table.Key, sourceKey)].TargetId;
                continue;
            }

            var sourceColumn = NameMatcher.FindBestColumn(row.Table.Columns, targetColumn.Name);
            var sourceValue = sourceColumn is null || !row.Values.TryGetValue(sourceColumn.Name, out var rawValue)
                ? null
                : rawValue;

            if (sourceValue is not null && ShouldRemapForeignKey(targetColumn))
            {
                var remap = TryRemapForeignKey(row, sourceColumn, sourceValue, targetColumn, sourceSchema, plan, idMap);
                if (remap.Success)
                {
                    values[targetColumn.Name] = remap.Value;
                    notes.Add($"{targetColumn.Name}: remapped legacy FK.");
                    continue;
                }

                if (targetColumn.IsNullable)
                {
                    values[targetColumn.Name] = null;
                    trash.Add(BuildTrash(row, mapping, "MissingNullableReference", remap.Message));
                    continue;
                }

                return new RowTransformResult
                {
                    Success = false,
                    Trash = [BuildTrash(row, mapping, "MissingRequiredReference", remap.Message)],
                };
            }

            var conversion = ConvertValue(sourceValue, targetColumn, row, mapping);
            if (!conversion.Success)
            {
                return new RowTransformResult
                {
                    Success = false,
                    Trash = [BuildTrash(row, mapping, conversion.ReasonCode, conversion.Message)],
                };
            }

            values[targetColumn.Name] = conversion.Value;
            if (!string.IsNullOrWhiteSpace(conversion.Note))
                notes.Add($"{targetColumn.Name}: {conversion.Note}");
        }

        var uniqueValidation = ApplyUniqueConstraints(row, mapping, targetTable, values, uniqueValueTracker);
        if (!uniqueValidation.Success)
        {
            return new RowTransformResult
            {
                Success = false,
                Trash = uniqueValidation.Trash,
            };
        }

        trash.AddRange(uniqueValidation.Trash);
        notes.AddRange(uniqueValidation.Notes);

        return new RowTransformResult
        {
            Success = true,
            Values = values,
            Trash = trash,
            Notes = notes,
        };
    }

    private static bool ShouldRemapForeignKey(TargetColumnInfo targetColumn)
    {
        if (targetColumn.IsPrimaryKey)
            return false;

        return targetColumn.IsForeignKey
            || (targetColumn.ClrType == typeof(Guid) || Nullable.GetUnderlyingType(targetColumn.ClrType) == typeof(Guid))
            && targetColumn.Name.EndsWith("_id", StringComparison.OrdinalIgnoreCase);
    }

    private static RowUniqueValidationResult ApplyUniqueConstraints(
        SourceRow row,
        TableMapping mapping,
        TargetTableInfo targetTable,
        Dictionary<string, object?> values,
        UniqueValueTracker uniqueValueTracker)
    {
        var trash = new List<TrashEntry>();
        var notes = new List<string>();
        var reservations = new List<(TargetUniqueIndexInfo Index, IReadOnlyList<object?> Values)>();

        foreach (var index in targetTable.UniqueIndexes.Where(i => i.Columns.Count == 1))
        {
            var column = targetTable.FindColumn(index.Columns[0]);
            if (column is null || !values.TryGetValue(column.Name, out var currentValue))
                continue;

            if (IsNullishUniqueValue(currentValue))
            {
                if (column.IsNullable)
                {
                    values[column.Name] = null;
                    continue;
                }

                if (IsStringColumn(column))
                {
                    var generated = GenerateUniqueStringValue(row, mapping, targetTable, column, index, uniqueValueTracker, null);
                    values[column.Name] = generated;
                    notes.Add($"{column.Name}: generated deterministic unique value '{generated}'.");
                    currentValue = generated;
                }
            }

            if (IsDbNull(currentValue))
                continue;

            if (!uniqueValueTracker.Contains(targetTable, index, [currentValue]))
            {
                reservations.Add((index, [currentValue]));
                continue;
            }

            if (column.IsNullable)
            {
                values[column.Name] = null;
                trash.Add(BuildTrash(
                    row,
                    mapping,
                    "DuplicateNullableUniqueValue",
                    $"Duplicate value for unique column {targetTable.Name}.{column.Name} was set to null."));
                notes.Add($"{column.Name}: duplicate unique value set to null.");
                continue;
            }

            if (IsStringColumn(column))
            {
                var generated = GenerateUniqueStringValue(
                    row,
                    mapping,
                    targetTable,
                    column,
                    index,
                    uniqueValueTracker,
                    Convert.ToString(currentValue, CultureInfo.InvariantCulture));
                values[column.Name] = generated;
                reservations.Add((index, [generated]));
                trash.Add(BuildTrash(
                    row,
                    mapping,
                    "GeneratedRequiredUniqueValue",
                    $"Duplicate or blank value for required unique column {targetTable.Name}.{column.Name} was replaced with '{generated}'."));
                notes.Add($"{column.Name}: generated deterministic unique value '{generated}'.");
                continue;
            }

            return new RowUniqueValidationResult(
                false,
                [BuildTrash(row, mapping, "DuplicateUniqueValue", $"Duplicate value for unique column {targetTable.Name}.{column.Name}.")],
                notes);
        }

        foreach (var index in targetTable.UniqueIndexes.Where(i => i.Columns.Count > 1))
        {
            var keyValues = new List<object?>();
            var skip = false;
            foreach (var columnName in index.Columns)
            {
                if (!values.TryGetValue(columnName, out var value) || IsDbNull(value))
                {
                    skip = true;
                    break;
                }

                keyValues.Add(value);
            }

            if (skip)
                continue;

            if (!uniqueValueTracker.Contains(targetTable, index, keyValues))
            {
                reservations.Add((index, keyValues.ToArray()));
                continue;
            }

            return new RowUniqueValidationResult(
                false,
                [BuildTrash(row, mapping, "DuplicateCompositeUniqueKey", $"Duplicate value for unique index {targetTable.Name}.{index.Name} ({string.Join(", ", index.Columns)}).")],
                notes);
        }

        foreach (var reservation in reservations)
            uniqueValueTracker.TryReserve(targetTable, reservation.Index, reservation.Values);

        return new RowUniqueValidationResult(true, trash, notes);
    }

    private static bool IsStringColumn(TargetColumnInfo column)
    {
        var type = Nullable.GetUnderlyingType(column.ClrType) ?? column.ClrType;
        return type == typeof(string);
    }

    private static bool IsDbNull(object? value) => value is null or DBNull;

    private static bool IsNullishUniqueValue(object? value)
    {
        return IsDbNull(value) || value is string text && string.IsNullOrWhiteSpace(text);
    }

    private static string GenerateUniqueStringValue(
        SourceRow row,
        TableMapping mapping,
        TargetTableInfo targetTable,
        TargetColumnInfo column,
        TargetUniqueIndexInfo index,
        UniqueValueTracker uniqueValueTracker,
        string? preferredText)
    {
        var seed = string.IsNullOrWhiteSpace(preferredText)
            ? FindSourceDisplayText(row) ?? $"{mapping.SourceTableName}-{GetSourceKey(row)}"
            : preferredText;
        var slug = Slugify(seed);
        var hash = DeterministicGuid.Create($"{row.Table.Key}:{GetSourceKey(row)}:{targetTable.Name}:{column.Name}").ToString("N")[..8];
        var maxLength = Math.Max(1, column.MaxLength ?? 100);

        for (var attempt = 0; attempt < 100; attempt++)
        {
            var suffix = attempt == 0 ? $"-{hash}" : $"-{hash}-{attempt.ToString(CultureInfo.InvariantCulture)}";
            var candidate = BuildUniqueStringCandidate(slug, suffix, maxLength);
            if (!uniqueValueTracker.Contains(targetTable, index, [candidate]))
                return candidate;
        }

        return BuildUniqueStringCandidate("legacy", $"-{hash}", maxLength);
    }

    private static string? FindSourceDisplayText(SourceRow row)
    {
        string[] preferredColumns = ["slug", "name", "organization_name", "clinic_name", "display_name", "title", "code"];
        foreach (var columnName in preferredColumns)
        {
            var sourceColumn = NameMatcher.FindBestColumn(row.Table.Columns, columnName);
            if (sourceColumn is null || !row.Values.TryGetValue(sourceColumn.Name, out var value))
                continue;

            var text = Convert.ToString(value, CultureInfo.InvariantCulture);
            if (!string.IsNullOrWhiteSpace(text))
                return text;
        }

        return null;
    }

    private static string BuildUniqueStringCandidate(string text, string suffix, int maxLength)
    {
        if (maxLength <= suffix.Length)
        {
            var compact = suffix.TrimStart('-');
            return compact.Length <= maxLength ? compact : compact[..maxLength];
        }

        var baseLength = maxLength - suffix.Length;
        var trimmed = text.Length <= baseLength ? text : text[..baseLength].TrimEnd('-');
        if (string.IsNullOrWhiteSpace(trimmed))
            trimmed = "legacy";

        if (trimmed.Length + suffix.Length > maxLength)
            trimmed = trimmed[..Math.Max(1, maxLength - suffix.Length)].TrimEnd('-');

        return $"{trimmed}{suffix}";
    }

    private static string Slugify(string value)
    {
        var builder = new StringBuilder(value.Length);
        var previousWasDash = false;

        foreach (var character in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
                previousWasDash = false;
                continue;
            }

            if ((character is '-' or '_') || char.IsWhiteSpace(character))
            {
                if (!previousWasDash && builder.Length > 0)
                {
                    builder.Append('-');
                    previousWasDash = true;
                }
            }
        }

        return builder.ToString().Trim('-') is { Length: > 0 } slug ? slug : "legacy";
    }

    private static FkRemapResult TryRemapForeignKey(
        SourceRow row,
        SourceColumnInfo? sourceColumn,
        object sourceValue,
        TargetColumnInfo targetColumn,
        DatabaseSchema sourceSchema,
        MappingPlan plan,
        Dictionary<string, IdMapEntry> idMap)
    {
        if (sourceValue is Guid guid)
            return new FkRemapResult(true, guid, string.Empty);

        var oldKey = Convert.ToString(sourceValue, CultureInfo.InvariantCulture);
        if (string.IsNullOrWhiteSpace(oldKey))
            return new FkRemapResult(false, null, $"Column {targetColumn.Name} has an empty legacy reference.");

        var sourceForeignKey = sourceColumn is null
            ? null
            : row.Table.ForeignKeys.FirstOrDefault(fk =>
                string.Equals(fk.ColumnName, sourceColumn.Name, StringComparison.OrdinalIgnoreCase));

        if (sourceForeignKey is not null)
        {
            var fkMapKey = BuildMapKey(sourceForeignKey.ReferencedKey, oldKey);
            if (idMap.TryGetValue(fkMapKey, out var mapped))
                return new FkRemapResult(true, mapped.TargetId, string.Empty);
        }

        var principalTarget = targetColumn.PrincipalTable ?? NameMatcher.InferPrincipalTableFromColumn(targetColumn.Name);
        if (principalTarget is not null)
        {
            foreach (var sourceMapping in plan.FindMappingsForTarget(principalTarget))
            {
                var sourceTable = sourceSchema.FindTable(sourceMapping.SourceTableKey);
                if (sourceTable is null)
                    continue;

                var mapKey = BuildMapKey(sourceTable.Key, oldKey);
                if (idMap.TryGetValue(mapKey, out var mapped))
                    return new FkRemapResult(true, mapped.TargetId, string.Empty);
            }
        }

        if (targetColumn.PrincipalTable is null)
        {
            var generated = DeterministicGuid.Create($"{row.Table.Key}.{targetColumn.Name}:{oldKey}");
            return new FkRemapResult(true, generated, "No target FK constraint exists; generated a stable UUID for the legacy reference.");
        }

        return new FkRemapResult(false, null, $"No migrated target row was found for {targetColumn.Name} legacy id '{oldKey}'.");
    }

    private static ValueConversionResult ConvertValue(
        object? sourceValue,
        TargetColumnInfo targetColumn,
        SourceRow row,
        TableMapping mapping)
    {
        var targetType = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;

        if (sourceValue is null)
        {
            var defaultResult = BuildDefaultValue(targetColumn, row, mapping);
            return defaultResult;
        }

        try
        {
            if (targetType == typeof(string))
            {
                var stringValue = Convert.ToString(sourceValue, CultureInfo.InvariantCulture) ?? string.Empty;
                if (targetColumn.MaxLength is not null && stringValue.Length > targetColumn.MaxLength.Value)
                {
                    return new ValueConversionResult(
                        true,
                        stringValue[..targetColumn.MaxLength.Value],
                        string.Empty,
                        $"Truncated legacy value to {targetColumn.MaxLength.Value} characters.",
                        string.Empty);
                }

                return ValueConversionResult.Ok(stringValue);
            }

            if (targetType == typeof(Guid))
            {
                if (sourceValue is Guid guid)
                    return ValueConversionResult.Ok(guid);

                var text = Convert.ToString(sourceValue, CultureInfo.InvariantCulture);
                if (Guid.TryParse(text, out var parsed))
                    return ValueConversionResult.Ok(parsed);

                return new ValueConversionResult(
                    true,
                    DeterministicGuid.Create($"{row.Table.Key}.{targetColumn.Name}:{text}"),
                    string.Empty,
                    "Generated stable UUID from non-UUID legacy value.",
                    string.Empty);
            }

            if (targetType == typeof(bool))
                return ValueConversionResult.Ok(ConvertToBoolean(sourceValue));

            if (targetType == typeof(int))
                return ValueConversionResult.Ok(Convert.ToInt32(sourceValue, CultureInfo.InvariantCulture));

            if (targetType == typeof(long))
                return ValueConversionResult.Ok(Convert.ToInt64(sourceValue, CultureInfo.InvariantCulture));

            if (targetType == typeof(decimal))
                return ValueConversionResult.Ok(Convert.ToDecimal(sourceValue, CultureInfo.InvariantCulture));

            if (targetType == typeof(double))
                return ValueConversionResult.Ok(Convert.ToDouble(sourceValue, CultureInfo.InvariantCulture));

            if (targetType == typeof(DateTime))
                return ValueConversionResult.Ok(ConvertToDateTime(sourceValue));

            if (targetType == typeof(DateOnly))
                return ValueConversionResult.Ok(ConvertToDateOnly(sourceValue));

            if (targetType.IsEnum)
                return ConvertToEnum(sourceValue, targetType, targetColumn, row, mapping);

            return ValueConversionResult.Ok(sourceValue);
        }
        catch (Exception ex)
        {
            if (targetColumn.IsNullable)
                return new ValueConversionResult(true, null, string.Empty, $"Invalid legacy value set to null: {ex.Message}", string.Empty);

            return new ValueConversionResult(false, null, "InvalidValue", $"Could not convert value for {targetColumn.Name}: {ex.Message}", string.Empty);
        }
    }

    private static ValueConversionResult BuildDefaultValue(
        TargetColumnInfo targetColumn,
        SourceRow row,
        TableMapping mapping)
    {
        if (targetColumn.IsNullable)
            return ValueConversionResult.Ok(null);

        var targetType = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;
        var now = DateTime.UtcNow;

        if (targetColumn.Name is "created_at" or "updated_at")
            return new ValueConversionResult(true, now, string.Empty, "Generated timestamp because no source value matched.", string.Empty);

        if (targetColumn.Name is "created_by" or "updated_by")
            return new ValueConversionResult(true, "migration", string.Empty, "Generated migration actor.", string.Empty);

        if (targetColumn.Name == "is_deleted")
            return ValueConversionResult.Ok(false);

        if (targetColumn.Name.EndsWith("_json", StringComparison.OrdinalIgnoreCase))
            return new ValueConversionResult(true, "[]", string.Empty, "Generated empty JSON array.", string.Empty);

        if (targetColumn.Name == "raw_json" || targetColumn.Name == "payload_json")
            return new ValueConversionResult(true, JsonSerializer.Serialize(row.Values, CompactJsonOptions), string.Empty, "Stored legacy row JSON.", string.Empty);

        if (targetColumn.Name == "client_id")
            return new ValueConversionResult(true, DeterministicGuid.Create($"{row.Table.Key}:client:{GetSourceKey(row)}"), string.Empty, "Generated client_id from source row.", string.Empty);

        if (targetType == typeof(string))
        {
            var value = targetColumn.Name.Contains("name", StringComparison.OrdinalIgnoreCase)
                ? $"Legacy {mapping.SourceTableName} {GetSourceKey(row)}"
                : string.Empty;
            return new ValueConversionResult(true, value, string.Empty, "Generated required string default.", string.Empty);
        }

        if (targetType == typeof(bool))
            return ValueConversionResult.Ok(false);

        if (targetType == typeof(int))
            return ValueConversionResult.Ok(0);

        if (targetType == typeof(long))
            return ValueConversionResult.Ok(0L);

        if (targetType == typeof(decimal))
            return ValueConversionResult.Ok(0m);

        if (targetType == typeof(double))
            return ValueConversionResult.Ok(0d);

        if (targetType == typeof(DateTime))
            return ValueConversionResult.Ok(now);

        if (targetType == typeof(DateOnly))
            return ValueConversionResult.Ok(DateOnly.FromDateTime(now));

        if (targetType == typeof(Guid))
            return new ValueConversionResult(true, DeterministicGuid.Create($"{row.Table.Key}:{targetColumn.Name}:{GetSourceKey(row)}"), string.Empty, "Generated required UUID default.", string.Empty);

        if (targetType.IsEnum)
        {
            var value = Enum.GetValues(targetType).GetValue(0);
            return value is null
                ? new ValueConversionResult(false, null, "MissingRequiredEnum", $"No default enum value exists for {targetColumn.Name}.", string.Empty)
                : new ValueConversionResult(true, value.ToString(), string.Empty, "Generated first enum value because no source value matched.", string.Empty);
        }

        return new ValueConversionResult(false, null, "MissingRequiredValue", $"No source/default value is available for {targetColumn.Name}.", string.Empty);
    }

    private static ValueConversionResult ConvertToEnum(
        object sourceValue,
        Type enumType,
        TargetColumnInfo targetColumn,
        SourceRow row,
        TableMapping mapping)
    {
        if (sourceValue.GetType().IsEnum)
            return ValueConversionResult.Ok(sourceValue.ToString());

        var text = Convert.ToString(sourceValue, CultureInfo.InvariantCulture);
        if (string.IsNullOrWhiteSpace(text))
            return BuildDefaultValue(targetColumn, row, mapping);

        if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric))
        {
            var numericValue = Enum.ToObject(enumType, numeric);
            if (Enum.IsDefined(enumType, numericValue))
                return ValueConversionResult.Ok(numericValue.ToString());
        }

        var normalized = NameMatcher.Normalize(text);
        foreach (var enumName in Enum.GetNames(enumType))
        {
            if (NameMatcher.Normalize(enumName) == normalized)
                return ValueConversionResult.Ok(enumName);
        }

        if (targetColumn.IsNullable)
            return new ValueConversionResult(true, null, string.Empty, "Unknown legacy enum value set to null.", string.Empty);

        return BuildDefaultValue(targetColumn, row, mapping);
    }

    private static bool ConvertToBoolean(object value)
    {
        if (value is bool boolValue)
            return boolValue;

        if (value is int intValue)
            return intValue != 0;

        var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim().ToLowerInvariant();
        return text is "1" or "true" or "t" or "yes" or "y";
    }

    private static DateTime ConvertToDateTime(object value)
    {
        if (value is DateTime dateTime)
            return dateTime.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
                : dateTime.ToUniversalTime();

        if (value is DateTimeOffset dateTimeOffset)
            return dateTimeOffset.UtcDateTime;

        if (value is DateOnly dateOnly)
            return dateOnly.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        if (value is long longValue)
            return DateTimeOffset.FromUnixTimeMilliseconds(longValue).UtcDateTime;

        return DateTime.SpecifyKind(DateTime.Parse(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty, CultureInfo.InvariantCulture), DateTimeKind.Utc);
    }

    private static DateOnly ConvertToDateOnly(object value)
    {
        if (value is DateOnly dateOnly)
            return dateOnly;

        if (value is DateTime dateTime)
            return DateOnly.FromDateTime(dateTime);

        return DateOnly.Parse(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty, CultureInfo.InvariantCulture);
    }

    private static async Task InsertRowAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        TargetTableInfo targetTable,
        IReadOnlyDictionary<string, object?> values,
        CancellationToken cancellationToken)
    {
        var columns = targetTable.Columns
            .Where(c => values.ContainsKey(c.Name))
            .Select(c => c.Name)
            .ToArray();

        var columnList = string.Join(", ", columns.Select(PgSchemaInspector.Quote));
        var parameterList = string.Join(", ", columns.Select((_, index) => $"@p{index}"));

        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"insert into {PgSchemaInspector.Quote(targetTable.Schema)}.{PgSchemaInspector.Quote(targetTable.Name)} ({columnList}) values ({parameterList});";

        for (var i = 0; i < columns.Length; i++)
            command.Parameters.AddWithValue($"p{i}", ToDbParameterValue(values[columns[i]]));

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static object ToDbParameterValue(object? value)
    {
        return value switch
        {
            null => DBNull.Value,
            DBNull => DBNull.Value,
            Enum enumValue => enumValue.ToString(),
            JsonElement jsonElement => jsonElement.GetRawText(),
            _ => value,
        };
    }

    private static IReadOnlyList<TableMapping> SortMappingsForInsert(MappingPlan plan)
    {
        var order = plan.TargetInsertOrder
            .Select((table, index) => new { table, index })
            .ToDictionary(x => x.table, x => x.index, StringComparer.OrdinalIgnoreCase);

        return plan.TableMappings
            .OrderBy(m => m.TargetTableName is null ? int.MaxValue : order.GetValueOrDefault(m.TargetTableName, int.MaxValue - 1))
            .ThenBy(m => m.SourceTableKey, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string GetSourceKey(SourceRow row)
    {
        if (row.Table.PrimaryKeyColumns.Count > 0)
        {
            return string.Join(
                "|",
                row.Table.PrimaryKeyColumns.Select(column =>
                    row.Values.TryGetValue(column, out var value) ? Convert.ToString(value, CultureInfo.InvariantCulture) : string.Empty));
        }

        if (row.Values.TryGetValue("id", out var idValue) && idValue is not null)
            return Convert.ToString(idValue, CultureInfo.InvariantCulture) ?? row.Ordinal.ToString(CultureInfo.InvariantCulture);

        return $"row-{row.Ordinal.ToString(CultureInfo.InvariantCulture)}";
    }

    private static string BuildMapKey(string sourceTableKey, string sourceKey) => $"{sourceTableKey}:{sourceKey}";

    private static TrashEntry BuildTrash(SourceRow row, TableMapping mapping, string reasonCode, string detail)
    {
        return new TrashEntry
        {
            SourceTable = row.Table.Key,
            SourceKey = GetSourceKey(row),
            TargetTable = mapping.TargetTableName,
            ReasonCode = reasonCode,
            Detail = detail,
        };
    }

    private static IReadOnlyList<string> BuildMessages(MigrationReport report)
    {
        var messages = new List<string>();
        if (report.SourceCheck is not null)
            messages.Add(report.SourceCheck.Message);
        if (report.TargetCheck is not null)
            messages.Add(report.TargetCheck.Message);
        return messages;
    }

    private sealed record ValueConversionResult(
        bool Success,
        object? Value,
        string ReasonCode,
        string Message,
        string Note)
    {
        public static ValueConversionResult Ok(object? value) => new(true, value, string.Empty, string.Empty, string.Empty);
    }

    private sealed record FkRemapResult(bool Success, object? Value, string Message);

    private sealed record RowUniqueValidationResult(
        bool Success,
        IReadOnlyList<TrashEntry> Trash,
        IReadOnlyList<string> Notes);

    private sealed class UniqueValueTracker
    {
        private readonly Dictionary<string, HashSet<string>> valuesByIndex = new(StringComparer.Ordinal);

        public bool Contains(
            TargetTableInfo table,
            TargetUniqueIndexInfo index,
            IReadOnlyList<object?> values)
        {
            var indexKey = BuildIndexKey(table, index);
            return valuesByIndex.TryGetValue(indexKey, out var indexValues)
                && indexValues.Contains(BuildValueKey(values));
        }

        public bool TryReserve(
            TargetTableInfo table,
            TargetUniqueIndexInfo index,
            IReadOnlyList<object?> values)
        {
            var indexKey = BuildIndexKey(table, index);
            if (!valuesByIndex.TryGetValue(indexKey, out var indexValues))
            {
                indexValues = new HashSet<string>(StringComparer.Ordinal);
                valuesByIndex[indexKey] = indexValues;
            }

            return indexValues.Add(BuildValueKey(values));
        }

        private static string BuildIndexKey(TargetTableInfo table, TargetUniqueIndexInfo index)
        {
            return $"{table.Key}:{index.Name}:{string.Join(",", index.Columns)}";
        }

        private static string BuildValueKey(IReadOnlyList<object?> values)
        {
            return string.Join('\u001f', values.Select(FormatValue));
        }

        private static string FormatValue(object? value)
        {
            return value switch
            {
                null => "<NULL>",
                DBNull => "<NULL>",
                Guid guid => guid.ToString("D"),
                DateTime dateTime => dateTime.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
                DateOnly dateOnly => dateOnly.ToString("O", CultureInfo.InvariantCulture),
                Enum enumValue => enumValue.ToString(),
                _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty,
            };
        }
    }
}
