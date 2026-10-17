namespace ClinicEz.Clinic.Application.Features.Audit.DTOs;

using System;
using System.Collections.Generic;

/// <summary>
/// Full forensic detail contract including parsed SHA-256 narrative checksums and complete redacted diff metadata.
/// </summary>
public sealed record ClinicAuditEntryDetailDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    DateTime Timestamp,
    string Category,
    string Severity,
    string Action,
    Guid? ActorStaffId,
    string ActorName,
    string ActorRole,
    string? ClientIpAddress,
    string? UserAgent,
    string TargetEntityType,
    string? TargetEntityId,
    Guid? PatientId,
    string? PatientNameMasked,
    string? PatientPinMasked,
    string Outcome,
    string Description,
    string MetadataJson,
    IReadOnlyDictionary<string, string> ProseChecksums,
    DateTime CreatedAt);
