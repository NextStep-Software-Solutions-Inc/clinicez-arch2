using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ClinicEz.Patient.MigrationTool.Models;

namespace ClinicEz.Patient.MigrationTool.Services;

public sealed class ReportStore(IOptions<MigrationToolOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public async Task SaveAsync(MigrationReport report, CancellationToken cancellationToken)
    {
        var directory = GetReportDirectory();
        Directory.CreateDirectory(directory);

        var jsonPath = Path.Combine(directory, $"{report.RunId}.json");
        await File.WriteAllTextAsync(jsonPath, JsonSerializer.Serialize(report, JsonOptions), cancellationToken);

        var csvPath = Path.Combine(directory, $"{report.RunId}.trash.csv");
        await File.WriteAllTextAsync(csvPath, BuildTrashCsv(report), cancellationToken);
    }

    public string BuildJson(MigrationReport report) => JsonSerializer.Serialize(report, JsonOptions);

    public string BuildTrashCsv(MigrationReport report)
    {
        var builder = new StringBuilder();
        builder.AppendLine("source_table,source_key,target_table,reason_code,detail");

        foreach (var trash in report.Trash)
        {
            builder.AppendCsv(trash.SourceTable);
            builder.AppendCsv(trash.SourceKey ?? string.Empty);
            builder.AppendCsv(trash.TargetTable ?? string.Empty);
            builder.AppendCsv(trash.ReasonCode);
            builder.AppendCsv(trash.Detail, endLine: true);
        }

        return builder.ToString();
    }

    public string BuildTableCsv(MigrationReport report)
    {
        var builder = new StringBuilder();
        builder.AppendLine("source_table,target_table,source_rows,transferable_rows,inserted_rows,trashed_rows");

        foreach (var table in report.TableResults)
        {
            builder.AppendCsv(table.SourceTable);
            builder.AppendCsv(table.TargetTable ?? string.Empty);
            builder.AppendCsv(table.SourceRows.ToString());
            builder.AppendCsv(table.TransferableRows.ToString());
            builder.AppendCsv(table.InsertedRows.ToString());
            builder.AppendCsv(table.TrashedRows.ToString(), endLine: true);
        }

        return builder.ToString();
    }

    private string GetReportDirectory()
    {
        if (!string.IsNullOrWhiteSpace(options.Value.ReportDirectory))
            return options.Value.ReportDirectory;

        return Path.Combine(AppContext.BaseDirectory, "migration-reports");
    }
}

file static class CsvExtensions
{
    public static void AppendCsv(this StringBuilder builder, string value, bool endLine = false)
    {
        builder.Append('"');
        builder.Append(value.Replace("\"", "\"\"", StringComparison.Ordinal));
        builder.Append('"');
        builder.Append(endLine ? Environment.NewLine : ',');
    }
}

