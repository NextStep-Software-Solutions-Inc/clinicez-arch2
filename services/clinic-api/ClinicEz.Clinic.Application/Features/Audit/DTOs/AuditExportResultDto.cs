namespace ClinicEz.Clinic.Application.Features.Audit.DTOs;

using System;

/// <summary>
/// Binary/stream payload returned by the export query handler.
/// </summary>
public sealed record AuditExportResultDto(
    byte[] ContentBytes,
    string ContentType,
    string FileName,
    int RowCount);
