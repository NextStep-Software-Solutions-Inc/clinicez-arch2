using System.Text.Json.Serialization;

namespace PatientAppBE.MigrationTool.Models;

public sealed class MigrationToolOptions
{
    public string SourceConnection { get; set; } = string.Empty;
    public string TargetConnection { get; set; } = string.Empty;
    public string AdminKey { get; set; } = string.Empty;
    public string ReportDirectory { get; set; } = string.Empty;
}

public sealed class MigrationMappingConfiguration
{
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Dictionary<string, TableMappingOverride> Tables { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public TableMappingOverride? FindTable(string sourceTableKey)
    {
        return Tables.FirstOrDefault(
            entry => string.Equals(entry.Key, sourceTableKey, StringComparison.OrdinalIgnoreCase)).Value;
    }
}

public sealed class TableMappingOverride
{
    public string? TargetTableName { get; set; }
    public bool ForceUnmapped { get; set; }
    public bool Trash { get; set; }
    public Dictionary<string, string> Columns { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, ColumnMappingOverride> ColumnSources { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public string? FindSourceColumn(string targetColumn)
    {
        var source = FindColumnSource(targetColumn);
        if (!string.IsNullOrWhiteSpace(source?.SourceColumnName))
            return source.SourceColumnName;

        return Columns.FirstOrDefault(
            entry => string.Equals(entry.Key, targetColumn, StringComparison.OrdinalIgnoreCase)).Value;
    }

    public ColumnMappingOverride? FindColumnSource(string targetColumn)
    {
        return ColumnSources.FirstOrDefault(
            entry => string.Equals(entry.Key, targetColumn, StringComparison.OrdinalIgnoreCase)).Value;
    }
}

public sealed class ColumnMappingOverride
{
    public string? SourceTableKey { get; set; }
    public string SourceColumnName { get; set; } = string.Empty;
    public string? Transform { get; set; }
}

public sealed class DatabaseCheckResult
{
    public string Name { get; init; } = string.Empty;
    public bool Configured { get; init; }
    public bool CanConnect { get; init; }
    public bool IsTargetEmpty { get; init; }
    public string Message { get; init; } = string.Empty;
    public IReadOnlyList<TableCount> TableCounts { get; init; } = [];
}

public sealed class TableCount
{
    public string Table { get; init; } = string.Empty;
    public long? RowCount { get; init; }
    public string? Message { get; init; }
}

public sealed class DatabaseSchema
{
    public IReadOnlyList<SourceTableInfo> Tables { get; init; } = [];

    public SourceTableInfo? FindTable(string key) =>
        Tables.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
}

public sealed class SourceTableInfo
{
    public string Schema { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Key => $"{Schema}.{Name}";
    public IReadOnlyList<SourceColumnInfo> Columns { get; init; } = [];
    public IReadOnlyList<string> PrimaryKeyColumns { get; init; } = [];
    public IReadOnlyList<SourceForeignKeyInfo> ForeignKeys { get; init; } = [];
    public long? RowCount { get; init; }

    public SourceColumnInfo? FindColumn(string columnName) =>
        Columns.FirstOrDefault(c => string.Equals(c.Name, columnName, StringComparison.OrdinalIgnoreCase));
}

public sealed class SourceColumnInfo
{
    public string Name { get; init; } = string.Empty;
    public int Ordinal { get; init; }
    public string DataType { get; init; } = string.Empty;
    public string UdtName { get; init; } = string.Empty;
    public bool IsNullable { get; init; }
    public string? DefaultValue { get; init; }
    public int? MaxLength { get; init; }
    public int? NumericPrecision { get; init; }
    public int? NumericScale { get; init; }
}

public sealed class SourceForeignKeyInfo
{
    public string ConstraintName { get; init; } = string.Empty;
    public string ColumnName { get; init; } = string.Empty;
    public string ReferencedSchema { get; init; } = string.Empty;
    public string ReferencedTable { get; init; } = string.Empty;
    public string ReferencedColumn { get; init; } = string.Empty;
    public string ReferencedKey => $"{ReferencedSchema}.{ReferencedTable}";
}

public sealed class TargetDatabaseSchema
{
    public IReadOnlyList<TargetTableInfo> Tables { get; init; } = [];

    public TargetTableInfo? FindTable(string tableName) =>
        Tables.FirstOrDefault(t => string.Equals(t.Name, tableName, StringComparison.OrdinalIgnoreCase));
}

public sealed class TargetTableInfo
{
    public string Schema { get; init; } = "public";
    public string Name { get; init; } = string.Empty;
    public string Key => $"{Schema}.{Name}";
    public IReadOnlyList<TargetColumnInfo> Columns { get; init; } = [];
    public IReadOnlyList<TargetForeignKeyInfo> ForeignKeys { get; init; } = [];
    public IReadOnlyList<TargetUniqueIndexInfo> UniqueIndexes { get; init; } = [];

    public TargetColumnInfo? FindColumn(string columnName) =>
        Columns.FirstOrDefault(c => string.Equals(c.Name, columnName, StringComparison.OrdinalIgnoreCase));
}

public sealed class TargetColumnInfo
{
    public string Name { get; init; } = string.Empty;

    [JsonIgnore]
    public Type ClrType { get; init; } = typeof(string);

    public string ClrTypeName => Nullable.GetUnderlyingType(ClrType)?.Name ?? ClrType.Name;
    public bool IsNullable { get; init; }
    public bool IsPrimaryKey { get; init; }
    public bool IsForeignKey { get; init; }
    public bool IsShadow { get; init; }
    public bool IsStoreColumnResolved { get; init; } = true;
    public int? MaxLength { get; init; }
    public string? PrincipalTable { get; init; }
    public string? PrincipalColumn { get; init; }
}

public sealed class TargetForeignKeyInfo
{
    public string ColumnName { get; init; } = string.Empty;
    public string PrincipalTable { get; init; } = string.Empty;
    public string PrincipalColumn { get; init; } = string.Empty;
}

public sealed class TargetUniqueIndexInfo
{
    public string Name { get; init; } = string.Empty;
    public IReadOnlyList<string> Columns { get; init; } = [];
    public string? Filter { get; init; }
}

public sealed class MappingPlan
{
    public IReadOnlyList<TableMapping> TableMappings { get; init; } = [];
    public IReadOnlyList<string> TargetInsertOrder { get; init; } = [];

    public TableMapping? FindMappingForSource(string sourceTableKey) =>
        TableMappings.FirstOrDefault(m => string.Equals(m.SourceTableKey, sourceTableKey, StringComparison.OrdinalIgnoreCase));

    public IReadOnlyList<TableMapping> FindMappingsForTarget(string targetTableName) =>
        TableMappings
            .Where(m => string.Equals(m.TargetTableName, targetTableName, StringComparison.OrdinalIgnoreCase))
            .ToArray();
}

public sealed class TableMapping
{
    public string SourceTableKey { get; init; } = string.Empty;
    public string SourceTableName { get; init; } = string.Empty;
    public string? TargetTableName { get; init; }
    public int Confidence { get; init; }
    public string Status { get; init; } = "unmapped";
    public string Reason { get; init; } = string.Empty;
    public IReadOnlyList<ColumnMapping> ColumnMappings { get; init; } = [];
}

public sealed class ColumnMapping
{
    public string TargetColumn { get; init; } = string.Empty;
    public string? SourceTableKey { get; init; }
    public string? SourceColumn { get; init; }
    public string? Transform { get; init; }
    public string Action { get; init; } = string.Empty;
    public string Notes { get; init; } = string.Empty;
    public string? Warning { get; init; }
}

public sealed class SourceRow
{
    public SourceTableInfo Table { get; init; } = new();
    public int Ordinal { get; init; }
    public Dictionary<string, object?> Values { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class MigrationReport
{
    public string RunId { get; init; } = Guid.NewGuid().ToString("N");
    public string Phase { get; set; } = "scan";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DatabaseCheckResult? SourceCheck { get; set; }
    public DatabaseCheckResult? TargetCheck { get; set; }
    public int SourceTableCount { get; set; }
    public int TargetTableCount { get; set; }
    public long TotalSourceRows { get; set; }
    public long TotalTransferableRows { get; set; }
    public long TotalInsertedRows { get; set; }
    public long TotalTrashedRows { get; set; }
    public int GeneratedUuidCount { get; set; }
    public IReadOnlyList<TableMapping> TableMappings { get; set; } = [];
    public IReadOnlyList<TableMigrationResult> TableResults { get; set; } = [];
    public IReadOnlyList<TrashEntry> Trash { get; set; } = [];
    public IReadOnlyList<IdMapEntry> IdMap { get; set; } = [];
    public IReadOnlyList<string> Messages { get; set; } = [];
    public string MappingConfigurationVersion { get; set; } = string.Empty;
    public bool DryRunSucceeded { get; set; }
    public bool ApplySucceeded { get; set; }
}

public sealed class TableMigrationResult
{
    public string SourceTable { get; init; } = string.Empty;
    public string? TargetTable { get; init; }
    public long SourceRows { get; set; }
    public long TransferableRows { get; set; }
    public long InsertedRows { get; set; }
    public long TrashedRows { get; set; }
    public IReadOnlyList<string> Notes { get; set; } = [];
}

public sealed class TrashEntry
{
    public string SourceTable { get; init; } = string.Empty;
    public string? SourceKey { get; init; }
    public string? TargetTable { get; init; }
    public string ReasonCode { get; init; } = string.Empty;
    public string Detail { get; init; } = string.Empty;
}

public sealed class IdMapEntry
{
    public string SourceTable { get; init; } = string.Empty;
    public string SourceKey { get; init; } = string.Empty;
    public string TargetTable { get; init; } = string.Empty;
    public Guid TargetId { get; init; }
}

public sealed class RowTransformResult
{
    public bool Success { get; init; }
    public Dictionary<string, object?> Values { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public IReadOnlyList<TrashEntry> Trash { get; init; } = [];
    public IReadOnlyList<string> Notes { get; init; } = [];
}
