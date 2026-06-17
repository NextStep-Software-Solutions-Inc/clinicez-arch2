using PatientApp.MigrationTool.Models;

namespace PatientApp.MigrationTool.Services;

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

    public MappingPlan Build(DatabaseSchema sourceSchema, TargetDatabaseSchema targetSchema)
    {
        var mappings = sourceSchema.Tables
            .Select(source => BuildTableMapping(source, targetSchema))
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

    private static TableMapping BuildTableMapping(SourceTableInfo source, TargetDatabaseSchema targetSchema)
    {
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
            ColumnMappings = BuildColumnMappings(source, best.Target),
        };
    }

    private static IReadOnlyList<ColumnMapping> BuildColumnMappings(SourceTableInfo source, TargetTableInfo target)
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

                var sourceColumn = NameMatcher.FindBestColumn(source.Columns, column.Name);
                if (sourceColumn is not null)
                {
                    return new ColumnMapping
                    {
                        TargetColumn = column.Name,
                        SourceColumn = sourceColumn.Name,
                        Action = column.IsForeignKey ? "fk_remap" : "copy_or_convert",
                        Notes = column.IsForeignKey
                            ? "Old integer FK will be remapped through the generated UUID map."
                            : "Copied with target type conversion and length/enum normalization.",
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
}

