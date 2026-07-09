using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using PatientApp.MigrationTool.Models;

namespace PatientApp.MigrationTool.Services;

public sealed class MappingConfigurationStore(IOptions<MigrationToolOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public string Path => System.IO.Path.Combine(GetReportDirectory(), "mapping-configuration.json");

    public MigrationMappingConfiguration Load()
    {
        if (!File.Exists(Path))
            return new MigrationMappingConfiguration();

        var json = File.ReadAllText(Path);
        var configuration = JsonSerializer.Deserialize<MigrationMappingConfiguration>(json, JsonOptions)
            ?? new MigrationMappingConfiguration();

        configuration.Tables = new Dictionary<string, TableMappingOverride>(
            configuration.Tables.Select(entry =>
            {
                entry.Value.Columns = new Dictionary<string, string>(
                    entry.Value.Columns ?? [],
                    StringComparer.OrdinalIgnoreCase);
                entry.Value.ColumnSources = new Dictionary<string, ColumnMappingOverride>(
                    entry.Value.ColumnSources ?? [],
                    StringComparer.OrdinalIgnoreCase);
                return entry;
            }),
            StringComparer.OrdinalIgnoreCase);

        return configuration;
    }

    public async Task SaveAsync(MigrationMappingConfiguration configuration, CancellationToken cancellationToken)
    {
        configuration.UpdatedAt = DateTimeOffset.UtcNow;
        Directory.CreateDirectory(GetReportDirectory());
        await File.WriteAllTextAsync(Path, JsonSerializer.Serialize(configuration, JsonOptions), cancellationToken);
    }

    public string GetVersion(MigrationMappingConfiguration configuration)
    {
        var builder = new StringBuilder();
        foreach (var table in configuration.Tables.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase))
        {
            builder
                .Append(table.Key)
                .Append('|')
                .Append(table.Value.TargetTableName)
                .Append('|')
                .Append(table.Value.ForceUnmapped)
                .Append('|')
                .Append(table.Value.Trash)
                .AppendLine();

            foreach (var column in table.Value.Columns.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase))
            {
                builder
                    .Append("  ")
                    .Append(column.Key)
                    .Append("<-")
                    .Append(column.Value)
                    .AppendLine();
            }

            foreach (var column in table.Value.ColumnSources.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase))
            {
                builder
                    .Append("  ")
                    .Append(column.Key)
                    .Append("<-")
                    .Append(column.Value.SourceTableKey)
                    .Append('.')
                    .Append(column.Value.SourceColumnName)
                    .Append('|')
                    .Append(column.Value.Transform)
                    .AppendLine();
            }
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
    }

    private string GetReportDirectory()
    {
        if (!string.IsNullOrWhiteSpace(options.Value.ReportDirectory))
            return options.Value.ReportDirectory;

        return System.IO.Path.Combine(AppContext.BaseDirectory, "migration-reports");
    }
}
