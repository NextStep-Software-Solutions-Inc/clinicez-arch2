namespace ClinicEz.Clinic.Application.Features.Audit.Services;

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;

/// <summary>
/// High-performance export formatter for CSV and JSON audit datasets with strict RFC 4180 escaping and UTF-8 BOM encoding.
/// </summary>
public static class AuditExportFormatter
{
    private static readonly UTF8Encoding Utf8WithBom = new(encoderShouldEmitUTF8Identifier: true);

    private static readonly JsonSerializerOptions JsonExportOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static byte[] FormatCsv(IReadOnlyList<ClinicAuditEntryDto> items)
    {
        using var memoryStream = new MemoryStream();
        using (var writer = new StreamWriter(memoryStream, Utf8WithBom, bufferSize: 4096, leaveOpen: true))
        {
            // 1. Write Header Row
            writer.WriteLine("Id,TimestampUtc,Category,Severity,Action,ActorStaffId,ActorName,ActorRole,ClientIpAddress,TargetEntityType,TargetEntityId,PatientId,PatientNameMasked,PatientPinMasked,Outcome,Description");

            // 2. Write Data Rows
            foreach (var item in items)
            {
                writer.WriteLine(string.Join(",",
                    EscapeCsvField(item.Id.ToString()),
                    EscapeCsvField(item.Timestamp.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")),
                    EscapeCsvField(item.Category),
                    EscapeCsvField(item.Severity),
                    EscapeCsvField(item.Action),
                    EscapeCsvField(item.ActorStaffId?.ToString()),
                    EscapeCsvField(item.ActorName),
                    EscapeCsvField(item.ActorRole),
                    EscapeCsvField(item.ClientIpAddress),
                    EscapeCsvField(item.TargetEntityType),
                    EscapeCsvField(item.TargetEntityId),
                    EscapeCsvField(item.PatientId?.ToString()),
                    EscapeCsvField(item.PatientNameMasked),
                    EscapeCsvField(item.PatientPinMasked),
                    EscapeCsvField(item.Outcome),
                    EscapeCsvField(item.Description)
                ));
            }

            writer.Flush();
        }

        return memoryStream.ToArray();
    }

    public static byte[] FormatJson(IReadOnlyList<ClinicAuditEntryDto> items)
    {
        return JsonSerializer.SerializeToUtf8Bytes(items, JsonExportOptions);
    }

    private static string EscapeCsvField(string? field)
    {
        if (string.IsNullOrEmpty(field)) return string.Empty;

        if (field.Contains(',') || field.Contains('"') || field.Contains('\n') || field.Contains('\r'))
        {
            return $"\"{field.Replace("\"", "\"\"")}\"";
        }

        return field;
    }
}
