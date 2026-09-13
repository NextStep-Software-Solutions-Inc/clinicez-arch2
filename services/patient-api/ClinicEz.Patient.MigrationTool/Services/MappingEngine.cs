using ClinicEz.Patient.MigrationTool.Models;

namespace ClinicEz.Patient.MigrationTool.Services;

public sealed class MappingEngine
{
    private static readonly string[] RuntimeOnlyTables =
    [
        "__efmigrationshistory",
        "hangfire_counter",
        "hangfire_hash",
        "hangfire_job",
        "hangfire_jobparameter",
        "hangfire_jobqueue",
        "hangfire_list",
        "hangfire_server",
        "hangfire_set",
        "hangfire_state",
        "schema_migrations"
    ];

    public MappingPlan Build(
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MigrationMappingConfiguration? configuration = null)
    {
        var mappings = sourceSchema.Tables
            .Select(source => BuildTableMapping(sourceSchema, source, targetSchema, configuration?.FindTable(source.Key)))
            .OrderBy(m => m.TargetTableName is null ? 1 : 0)
            .ThenByDescending(m => m.Confidence)
            .ThenBy(m => m.SourceTableKey, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new MappingPlan
        {
            TableMappings = mappings,
            TargetInsertOrder = BuildTargetInsertOrder(targetSchema),
        };
    }

    private static TableMapping BuildTableMapping(
        DatabaseSchema sourceSchema,
        SourceTableInfo source,
        TargetDatabaseSchema targetSchema,
        TableMappingOverride? tableOverride)
    {
        if (tableOverride?.Trash == true)
        {
            return new TableMapping
            {
                SourceTableKey = source.Key,
                SourceTableName = source.Name,
                Status = "manual_trash",
                Reason = "Manually marked as trash/deprecated.",
            };
        }

        if (tableOverride?.ForceUnmapped == true)
        {
            return new TableMapping
            {
                SourceTableKey = source.Key,
                SourceTableName = source.Name,
                Status = "manual_unmapped",
                Reason = "Manually forced to remain unmapped.",
            };
        }

        if (!string.IsNullOrWhiteSpace(tableOverride?.TargetTableName))
        {
            var manualTarget = targetSchema.FindTable(tableOverride.TargetTableName);
            if (manualTarget is null)
            {
                return new TableMapping
                {
                    SourceTableKey = source.Key,
                    SourceTableName = source.Name,
                    TargetTableName = tableOverride.TargetTableName,
                    Status = "manual_missing_target",
                    Reason = "Manual target table override does not exist in the PatientApp schema.",
                };
            }

            return new TableMapping
            {
                SourceTableKey = source.Key,
                SourceTableName = source.Name,
                TargetTableName = manualTarget.Name,
                Confidence = 100,
                Status = "manual",
                Reason = "Manual table mapping override.",
                ColumnMappings = BuildColumnMappings(sourceSchema, source, manualTarget, tableOverride),
            };
        }

        if (IsRuntimeOnly(source))
        {
            return new TableMapping
            {
                SourceTableKey = source.Key,
                SourceTableName = source.Name,
                Status = "deprecated",
                Reason = "Runtime/framework table with no PatientApp data equivalent.",
            };
        }

        var candidates = targetSchema.Tables
            .Select(target => new { Target = target, Score = NameMatcher.TableScore(source, target) })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Target.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var best = candidates.FirstOrDefault();
        if (best is null || best.Score < 45)
        {
            return new TableMapping
            {
                SourceTableKey = source.Key,
                SourceTableName = source.Name,
                Status = "unmapped",
                Reason = "No PatientApp target table had enough name/column overlap.",
            };
        }

        return new TableMapping
        {
            SourceTableKey = source.Key,
            SourceTableName = source.Name,
            TargetTableName = best.Target.Name,
            Confidence = best.Score,
            Status = best.Score >= 80 ? "mapped" : "review",
            Reason = best.Score >= 80
                ? "High-confidence table name/column match."
                : "Low-confidence inferred table match; review before apply.",
            ColumnMappings = BuildColumnMappings(sourceSchema, source, best.Target, tableOverride),
        };
    }

    private static IReadOnlyList<ColumnMapping> BuildColumnMappings(
        DatabaseSchema sourceSchema,
        SourceTableInfo source,
        TargetTableInfo target,
        TableMappingOverride? tableOverride)
    {
        return target.Columns
            .Select(column =>
            {
                if (column.IsPrimaryKey && string.Equals(column.Name, "id", StringComparison.OrdinalIgnoreCase))
                {
                    return new ColumnMapping
                    {
                        TargetColumn = column.Name,
                        Action = "generated_uuid",
                        Notes = "Generated from {source_schema}.{source_table}:{old_integer_id}.",
                    };
                }

                var manualSource = tableOverride?.FindColumnSource(column.Name);
                var manualSourceColumnName = manualSource?.SourceColumnName ?? tableOverride?.FindSourceColumn(column.Name);
                if (!string.IsNullOrWhiteSpace(manualSourceColumnName))
                {
                    var manualSourceTable = string.IsNullOrWhiteSpace(manualSource?.SourceTableKey)
                        ? source
                        : sourceSchema.FindTable(manualSource.SourceTableKey);
                    if (manualSourceTable is null)
                    {
                        return new ColumnMapping
                        {
                            TargetColumn = column.Name,
                            SourceTableKey = manualSource?.SourceTableKey,
                            SourceColumn = manualSourceColumnName,
                            Action = "manual_missing_source_table",
                            Notes = "Manual source table selection no longer exists in the source schema.",
                        };
                    }

                    var manualSourceColumn = manualSourceTable.FindColumn(manualSourceColumnName);
                    if (manualSourceColumn is not null)
                    {
                        var related = !string.Equals(manualSourceTable.Key, source.Key, StringComparison.OrdinalIgnoreCase);
                        var transform = NormalizeTransform(manualSource?.Transform);
                        var warning = BuildTypeWarning(manualSourceColumn, column, transform);
                        return new ColumnMapping
                        {
                            TargetColumn = column.Name,
                            SourceTableKey = manualSourceTable.Key,
                            SourceColumn = manualSourceColumn.Name,
                            Transform = transform,
                            Action = column.IsForeignKey
                                ? related ? "manual_related_fk_remap" : "manual_fk_remap"
                                : related ? "manual_related_copy_or_convert" : "manual_copy_or_convert",
                            Notes = column.IsForeignKey
                                ? related
                                    ? "Manual related-table source column selection; old integer FK will be remapped through the UUID map."
                                    : "Manual source column selection; old integer FK will be remapped through the UUID map."
                                : related
                                    ? "Manual related-table source column selection; related row is resolved through source FKs then copied with target type conversion."
                                    : "Manual source column selection; copied with target type conversion.",
                            Warning = warning,
                        };
                    }

                    return new ColumnMapping
                    {
                        TargetColumn = column.Name,
                        SourceTableKey = manualSourceTable.Key,
                        SourceColumn = manualSourceColumnName,
                        Action = "manual_missing_source_column",
                        Notes = "Manual source column selection no longer exists in the source table.",
                    };
                }

                var sourceColumn = NameMatcher.FindBestColumn(source.Columns, column.Name);
                if (sourceColumn is not null)
                {
                    return new ColumnMapping
                    {
                        TargetColumn = column.Name,
                        SourceTableKey = source.Key,
                        SourceColumn = sourceColumn.Name,
                        Action = column.IsForeignKey ? "fk_remap" : "copy_or_convert",
                        Notes = column.IsForeignKey
                            ? "Old integer FK will be remapped through the generated UUID map."
                            : "Copied with target type conversion and length/enum normalization.",
                        Warning = BuildTypeWarning(sourceColumn, column, null),
                    };
                }

                return new ColumnMapping
                {
                    TargetColumn = column.Name,
                    Action = column.IsNullable ? "default_null" : "generated_default",
                    Notes = column.IsNullable
                        ? "No source column matched; nullable target column will be null."
                        : "No source column matched; a safe generated value will be used when possible.",
                };
            })
            .ToArray();
    }

    private static IReadOnlyList<string> BuildTargetInsertOrder(TargetDatabaseSchema targetSchema)
    {
        var byName = targetSchema.Tables.ToDictionary(t => t.Name, StringComparer.OrdinalIgnoreCase);
        var ordered = new List<string>();
        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var table in targetSchema.Tables.OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase))
            Visit(table);

        return ordered;

        void Visit(TargetTableInfo table)
        {
            if (visited.Contains(table.Name) || visiting.Contains(table.Name))
                return;

            visiting.Add(table.Name);
            foreach (var dependencyName in table.ForeignKeys.Select(fk => fk.PrincipalTable).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (byName.TryGetValue(dependencyName, out var dependency))
                    Visit(dependency);
            }

            visiting.Remove(table.Name);
            visited.Add(table.Name);
            ordered.Add(table.Name);
        }
    }

    private static bool IsRuntimeOnly(SourceTableInfo table)
    {
        var normalized = table.Name.ToLowerInvariant();
        return RuntimeOnlyTables.Contains(normalized, StringComparer.OrdinalIgnoreCase)
            || normalized.StartsWith("hangfire_", StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeTransform(string? transform)
    {
        return transform is "convert" or "json_stringify" ? transform : null;
    }

    private static string? BuildTypeWarning(SourceColumnInfo sourceColumn, TargetColumnInfo targetColumn, string? transform)
    {
        if (transform == "json_stringify")
            return "Explicit transform selected: source value will be serialized to JSON text.";

        if (transform == "convert")
            return "Explicit transform selected: source value will be converted to the target type.";

        var targetCategory = GetTargetTypeCategory(targetColumn);
        var sourceCategory = GetSourceTypeCategory(sourceColumn);
        if (targetCategory == "json-string")
            return "Target column looks like stringified JSON; choose Stringify JSON unless the source already stores JSON text.";

        if (sourceCategory is null || targetCategory is null || AreTypeCategoriesCompatible(sourceCategory, targetCategory))
            return null;

        return $"Type mismatch: source is {sourceCategory}, target expects {targetCategory}. Choose Convert to target type if this is intentional.";
    }

    private static string? GetTargetTypeCategory(TargetColumnInfo targetColumn)
    {
        if (IsJsonStringTarget(targetColumn))
            return "json-string";

        var type = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;
        if (type == typeof(string))
            return "string";
        if (type == typeof(Guid))
            return "uuid";
        if (type == typeof(bool))
            return "boolean";
        if (type == typeof(DateTime) || type == typeof(DateOnly))
            return "date/time";
        if (type.IsEnum)
            return "enum";
        if (type == typeof(byte) || type == typeof(short) || type == typeof(int) || type == typeof(long)
            || type == typeof(float) || type == typeof(double) || type == typeof(decimal))
            return "number";

        return null;
    }

    private static string? GetSourceTypeCategory(SourceColumnInfo sourceColumn)
    {
        var dataType = sourceColumn.DataType.ToLowerInvariant();
        var udtName = sourceColumn.UdtName.ToLowerInvariant();

        if (dataType is "json" or "jsonb" || udtName is "json" or "jsonb")
            return "json";
        if (dataType.Contains("char", StringComparison.Ordinal) || dataType is "text" or "citext" || udtName is "varchar" or "text")
            return "string";
        if (dataType.Contains("int", StringComparison.Ordinal) || dataType is "numeric" or "decimal" or "real" or "double precision" or "money")
            return "number";
        if (dataType is "boolean" || udtName == "bool")
            return "boolean";
        if (dataType == "uuid" || udtName == "uuid")
            return "uuid";
        if (dataType.Contains("date", StringComparison.Ordinal) || dataType.Contains("time", StringComparison.Ordinal))
            return "date/time";

        return null;
    }

    private static bool AreTypeCategoriesCompatible(string sourceCategory, string targetCategory)
    {
        if (sourceCategory == targetCategory)
            return true;

        return targetCategory == "string" && sourceCategory == "json";
    }

    private static bool IsJsonStringTarget(TargetColumnInfo targetColumn)
    {
        var type = Nullable.GetUnderlyingType(targetColumn.ClrType) ?? targetColumn.ClrType;
        return type == typeof(string)
            && (targetColumn.Name.EndsWith("_json", StringComparison.OrdinalIgnoreCase)
                || targetColumn.Name is "raw_json" or "payload_json");
    }
}
