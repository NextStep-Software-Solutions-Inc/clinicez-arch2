using System;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Clinic.Application.Common.Audit;

/// <summary>
/// Constructs immutable <see cref="AuditEntry"/> records for directory verification lifecycle events
/// using the existing clinic WORM audit table.
/// </summary>
public static class DirectoryVerificationAuditHelper
{
    public static AuditEntry CreateEntry(
        string tenantId,
        Guid clinicId,
        string category,
        string severity,
        string action,
        string targetEntityType,
        string? targetEntityId,
        string outcome,
        string description,
        Guid? actorStaffId = null,
        string? actorName = null,
        string? actorRole = null,
        object? metadata = null)
    {
        return new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = category,
            Severity = severity,
            Action = action,
            ActorStaffId = actorStaffId,
            ActorName = string.IsNullOrWhiteSpace(actorName)
                ? (actorStaffId.HasValue ? $"Staff:{actorStaffId.Value:N}" : "System")
                : actorName,
            ActorRole = string.IsNullOrWhiteSpace(actorRole) ? "Staff" : actorRole,
            TargetEntityType = targetEntityType,
            TargetEntityId = targetEntityId,
            Outcome = outcome,
            Description = description,
            MetadataJson = metadata is null
                ? "{}"
                : JsonSerializer.Serialize(metadata, InteropJson.Options)
        };
    }
}
