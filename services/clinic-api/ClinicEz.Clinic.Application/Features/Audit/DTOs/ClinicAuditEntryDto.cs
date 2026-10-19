namespace ClinicEz.Clinic.Application.Features.Audit.DTOs;

using System;

/// <summary>
/// Lightweight projection of an immutable audit record for list workstations and overview drawers.
/// </summary>
public sealed record ClinicAuditEntryDto(
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
    DateTime CreatedAt);
