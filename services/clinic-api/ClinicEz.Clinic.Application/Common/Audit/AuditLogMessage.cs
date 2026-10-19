namespace ClinicEz.Clinic.Application.Common.Audit;

using System;

/// <summary>
/// Immutable DTO carried across the in-memory audit channel from request producers to the background ingestion worker.
/// </summary>
public sealed record AuditLogMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string TenantId { get; init; }
    public Guid ClinicId { get; init; }
    public DateTime Timestamp { get; init; } = DateTime.UtcNow;

    // Categorization & Urgency
    public required string Category { get; init; } // Security, Operations, Patient, Appointments, Queue, Clinical, Billing, PhilHealth, Audit
    public required string Severity { get; init; } // Routine, Urgent, Emergency
    public required string Action { get; init; }   // e.g. auth.login.failure, clinical.consultation.signed, yakap.claim.rejected

    // Actor Identity
    public Guid? ActorStaffId { get; init; }
    public required string ActorName { get; init; }
    public required string ActorRole { get; init; }
    public string? ClientIpAddress { get; init; }
    public string? UserAgent { get; init; }

    // Target Correlation
    public required string TargetEntityType { get; init; }
    public string? TargetEntityId { get; init; }

    // Patient Correlation & Masking
    public Guid? PatientId { get; init; }
    public string? PatientName { get; init; }
    public string? PatientNameMasked { get; init; }
    public string? PatientPin { get; init; }
    public string? PatientPinMasked { get; init; }

    // Operational Outcome & Sanitized Audit Metadata
    public required string Outcome { get; init; } // Success, Failure, Warning
    public required string Description { get; init; }
    public string MetadataJson { get; init; } = "{}";
}
