namespace ClinicEz.Clinic.Application.Features.Audit.DTOs;

using System.Collections.Generic;

/// <summary>
/// Paginated list response for backward cursor stream pagination.
/// </summary>
public sealed record AuditLogListDto(
    IReadOnlyList<ClinicAuditEntryDto> Items,
    bool HasMore,
    string? NextCursor,
    int TotalCount = 0);
