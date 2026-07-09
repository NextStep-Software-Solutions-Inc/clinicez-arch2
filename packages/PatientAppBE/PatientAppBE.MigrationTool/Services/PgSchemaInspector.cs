using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using Npgsql;
using PatientAppBE.MigrationTool.Models;

namespace PatientAppBE.MigrationTool.Services;

public sealed class PgSchemaInspector(IOptions<MigrationToolOptions> options)
{
    public async Task<DatabaseCheckResult> CheckSourceAsync(CancellationToken cancellationToken)
    {
        return await CheckConnectionAsync("Source", options.Value.SourceConnection, [], requireEmpty: false, cancellationToken);
    }

    public async Task<DatabaseCheckResult> CheckTargetAsync(
        TargetDatabaseSchema targetSchema,
        CancellationToken cancellationToken)
    {
        return await CheckConnectionAsync("Target", options.Value.TargetConnection, targetSchema.Tables, requireEmpty: true, cancellationToken);
    }

    public async Task<DatabaseSchema> ReadSourceSchemaAsync(CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(options.Value.SourceConnection, cancellationToken);

        var baseTables = await ReadBaseTablesAsync(connection, cancellationToken);
        var columns = await ReadColumnsAsync(connection, cancellationToken);
        var primaryKeys = await ReadPrimaryKeysAsync(connection, cancellationToken);
        var foreignKeys = await ReadForeignKeysAsync(connection, cancellationToken);

        var tables = new List<SourceTableInfo>();
        foreach (var table in baseTables.OrderBy(t => t.Schema).ThenBy(t => t.Name))
        {
            var key = $"{table.Schema}.{table.Name}";
            var tableColumns = columns.TryGetValue(key, out var columnList) ? columnList : [];
            var tablePrimaryKeys = primaryKeys.TryGetValue(key, out var pkList) ? pkList : [];
            var tableForeignKeys = foreignKeys.TryGetValue(key, out var fkList) ? fkList : [];
            var rowCount = await TryCountRowsAsync(connection, table.Schema, table.Name, cancellationToken);

            tables.Add(new SourceTableInfo
            {
                Schema = table.Schema,
                Name = table.Name,
                Columns = tableColumns.OrderBy(c => c.Ordinal).ToArray(),
                PrimaryKeyColumns = tablePrimaryKeys,
                ForeignKeys = tableForeignKeys,
                RowCount = rowCount,
            });
        }

        return new DatabaseSchema { Tables = tables };
    }

    public async IAsyncEnumerable<SourceRow> ReadRowsAsync(
        SourceTableInfo table,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(options.Value.SourceConnection, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = BuildSelectSql(table);
        command.CommandTimeout = 0;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ordinal = 0;
        while (await reader.ReadAsync(cancellationToken))
        {
            ordinal++;
            var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < reader.FieldCount; i++)
                values[reader.GetName(i)] = await reader.IsDBNullAsync(i, cancellationToken) ? null : reader.GetValue(i);

            yield return new SourceRow
            {
                Table = table,
                Ordinal = ordinal,
                Values = values,
            };
        }
    }

    private async Task<DatabaseCheckResult> CheckConnectionAsync(
        string name,
        string connectionString,
        IReadOnlyList<TargetTableInfo> targetTables,
        bool requireEmpty,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return new DatabaseCheckResult
            {
                Name = name,
                Configured = false,
                CanConnect = false,
                IsTargetEmpty = !requireEmpty,
                Message = $"{name} connection is not configured.",
            };
        }

        try
        {
            await using var connection = await OpenAsync(connectionString, cancellationToken);

            if (!requireEmpty)
            {
                return new DatabaseCheckResult
                {
                    Name = name,
                    Configured = true,
                    CanConnect = true,
                    IsTargetEmpty = true,
                    Message = $"{name} connection succeeded.",
                };
            }

            var counts = new List<TableCount>();
            foreach (var table in targetTables)
            {
                var exists = await TableExistsAsync(connection, table.Schema, table.Name, cancellationToken);
                if (!exists)
                {
                    counts.Add(new TableCount
                    {
                        Table = table.Key,
                        RowCount = null,
                        Message = "Target table does not exist. Apply PatientApp migrations before running this tool.",
                    });
                    continue;
                }

                var count = await TryCountRowsAsync(connection, table.Schema, table.Name, cancellationToken);
                var actualColumns = await ReadTargetColumnNamesAsync(connection, table.Schema, table.Name, cancellationToken);
                var missingColumns = table.Columns
                    .Select(c => c.Name)
                    .Where(column => !actualColumns.Contains(column))
                    .OrderBy(column => column, StringComparer.Ordinal)
                    .ToArray();
                var unresolvedColumns = table.Columns
                    .Where(c => !c.IsStoreColumnResolved)
                    .Select(c => c.Name)
                    .OrderBy(column => column, StringComparer.Ordinal)
                    .ToArray();
                var validationMessages = new List<string>();
                if (missingColumns.Length > 0)
                    validationMessages.Add($"Target table is missing mapped columns: {string.Join(", ", missingColumns)}.");
                if (unresolvedColumns.Length > 0)
                    validationMessages.Add($"EF did not resolve database column names for: {string.Join(", ", unresolvedColumns)}.");

                counts.Add(new TableCount
                {
                    Table = table.Key,
                    RowCount = count,
                    Message = validationMessages.Count == 0
                        ? null
                        : string.Join(" ", validationMessages),
                });
            }

            var targetEmpty = counts.All(c => c.RowCount.GetValueOrDefault() == 0 && c.Message is null);
            return new DatabaseCheckResult
            {
                Name = name,
                Configured = true,
                CanConnect = true,
                IsTargetEmpty = targetEmpty,
                Message = targetEmpty
                    ? "Target connection succeeded and PatientApp tables are empty."
                    : "Target connection succeeded, but at least one PatientApp table is missing or non-empty.",
                TableCounts = counts,
            };
        }
        catch (Exception ex)
        {
            return new DatabaseCheckResult
            {
                Name = name,
                Configured = true,
                CanConnect = false,
                IsTargetEmpty = false,
                Message = $"{name} connection failed: {ex.Message}",
            };
        }
    }

    private static async Task<NpgsqlConnection> OpenAsync(string connectionString, CancellationToken cancellationToken)
    {
        var connection = new NpgsqlConnection(PostgresConnectionString.Normalize(connectionString));
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static async Task<IReadOnlyList<(string Schema, string Name)>> ReadBaseTablesAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select table_schema, table_name
            from information_schema.tables
            where table_type = 'BASE TABLE'
              and table_schema not in ('pg_catalog', 'information_schema')
            order by table_schema, table_name;
            """;

        var result = new List<(string Schema, string Name)>();
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add((reader.GetString(0), reader.GetString(1)));

        return result;
    }

    private static async Task<Dictionary<string, List<SourceColumnInfo>>> ReadColumnsAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select table_schema,
                   table_name,
                   ordinal_position,
                   column_name,
                   data_type,
                   udt_name,
                   is_nullable,
                   column_default,
                   character_maximum_length,
                   numeric_precision,
                   numeric_scale
            from information_schema.columns
            where table_schema not in ('pg_catalog', 'information_schema')
            order by table_schema, table_name, ordinal_position;
            """;

        var result = new Dictionary<string, List<SourceColumnInfo>>(StringComparer.OrdinalIgnoreCase);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var key = $"{reader.GetString(0)}.{reader.GetString(1)}";
            if (!result.TryGetValue(key, out var columns))
            {
                columns = [];
                result[key] = columns;
            }

            columns.Add(new SourceColumnInfo
            {
                Ordinal = reader.GetInt32(2),
                Name = reader.GetString(3),
                DataType = reader.GetString(4),
                UdtName = reader.GetString(5),
                IsNullable = reader.GetString(6) == "YES",
                DefaultValue = reader.IsDBNull(7) ? null : reader.GetString(7),
                MaxLength = reader.IsDBNull(8) ? null : reader.GetInt32(8),
                NumericPrecision = reader.IsDBNull(9) ? null : reader.GetInt32(9),
                NumericScale = reader.IsDBNull(10) ? null : reader.GetInt32(10),
            });
        }

        return result;
    }

    private static async Task<Dictionary<string, IReadOnlyList<string>>> ReadPrimaryKeysAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select kcu.table_schema, kcu.table_name, kcu.column_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name
             and tc.table_schema = kcu.table_schema
             and tc.table_name = kcu.table_name
            where tc.constraint_type = 'PRIMARY KEY'
              and tc.table_schema not in ('pg_catalog', 'information_schema')
            order by kcu.table_schema, kcu.table_name, kcu.ordinal_position;
            """;

        var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var key = $"{reader.GetString(0)}.{reader.GetString(1)}";
            if (!result.TryGetValue(key, out var columns))
            {
                columns = [];
                result[key] = columns;
            }

            columns.Add(reader.GetString(2));
        }

        return result.ToDictionary(kvp => kvp.Key, kvp => (IReadOnlyList<string>)kvp.Value, StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<Dictionary<string, IReadOnlyList<SourceForeignKeyInfo>>> ReadForeignKeysAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select tc.constraint_name,
                   kcu.table_schema,
                   kcu.table_name,
                   kcu.column_name,
                   ccu.table_schema as foreign_table_schema,
                   ccu.table_name as foreign_table_name,
                   ccu.column_name as foreign_column_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name
             and tc.table_schema = kcu.table_schema
             and tc.table_name = kcu.table_name
            join information_schema.constraint_column_usage ccu
              on ccu.constraint_name = tc.constraint_name
             and ccu.table_schema = tc.table_schema
            where tc.constraint_type = 'FOREIGN KEY'
              and tc.table_schema not in ('pg_catalog', 'information_schema')
            order by kcu.table_schema, kcu.table_name, kcu.column_name;
            """;

        var result = new Dictionary<string, List<SourceForeignKeyInfo>>(StringComparer.OrdinalIgnoreCase);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var key = $"{reader.GetString(1)}.{reader.GetString(2)}";
            if (!result.TryGetValue(key, out var foreignKeys))
            {
                foreignKeys = [];
                result[key] = foreignKeys;
            }

            foreignKeys.Add(new SourceForeignKeyInfo
            {
                ConstraintName = reader.GetString(0),
                ColumnName = reader.GetString(3),
                ReferencedSchema = reader.GetString(4),
                ReferencedTable = reader.GetString(5),
                ReferencedColumn = reader.GetString(6),
            });
        }

        return result.ToDictionary(
            kvp => kvp.Key,
            kvp => (IReadOnlyList<SourceForeignKeyInfo>)kvp.Value,
            StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<bool> TableExistsAsync(
        NpgsqlConnection connection,
        string schema,
        string table,
        CancellationToken cancellationToken)
    {
        const string sql = "select to_regclass(@tableName) is not null;";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("tableName", $"{schema}.{table}");
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<HashSet<string>> ReadTargetColumnNamesAsync(
        NpgsqlConnection connection,
        string schema,
        string table,
        CancellationToken cancellationToken)
    {
        const string sql = """
            select column_name
            from information_schema.columns
            where table_schema = @schema
              and table_name = @table;
            """;

        var result = new HashSet<string>(StringComparer.Ordinal);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("schema", schema);
        command.Parameters.AddWithValue("table", table);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add(reader.GetString(0));

        return result;
    }

    private static async Task<long?> TryCountRowsAsync(
        NpgsqlConnection connection,
        string schema,
        string table,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"select count(*)::bigint from {Quote(schema)}.{Quote(table)};";
            command.CommandTimeout = 0;
            return (long?)await command.ExecuteScalarAsync(cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    private static string BuildSelectSql(SourceTableInfo table)
    {
        var orderBy = table.PrimaryKeyColumns.Count == 0
            ? string.Empty
            : " order by " + string.Join(", ", table.PrimaryKeyColumns.Select(Quote));

        return $"select * from {Quote(table.Schema)}.{Quote(table.Name)}{orderBy};";
    }

    public static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
}
