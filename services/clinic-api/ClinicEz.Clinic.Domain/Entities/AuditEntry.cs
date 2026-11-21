using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Immutable, append-only (WORM) audit record capturing clinic operational, clinical,
/// security, billing, and statutory PhilHealth Yakap events in compliance with RA 10173.
/// </summary>
public sealed class AuditEntry : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Exact UTC timestamp when the operational event occurred.
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // ── Categorization & Urgency ─────────────────────────────────────────────
    /// <summary>
    /// Event category: Security, Operations, Patient, Appointments, Queue, Clinical, Billing, PhilHealth, Audit.
    /// </summary>
    public required string Category { get; set; }

    /// <summary>
    /// Severity classification: Routine, Urgent, Emergency.
    /// </summary>
    public required string Severity { get; set; }

    /// <summary>
    /// Machine action key (e.g., auth.login.failure, billing.invoice.voided, clinical.consultation.signed).
    /// </summary>
    public required string Action { get; set; }

    // ── Actor Identity ───────────────────────────────────────────────────────
    public Guid? ActorStaffId { get; set; }
    public required string ActorName { get; set; }
    public required string ActorRole { get; set; }
    public string? ClientIpAddress { get; set; }
    public string? UserAgent { get; set; }

    // ── Target Correlation ───────────────────────────────────────────────────
    /// <summary>
    /// Name of affected domain entity (e.g., Patient, Invoice, ConsultationEncounter, DoctorScheduleTemplate).
    /// </summary>
    public required string TargetEntityType { get; set; }

    /// <summary>
    /// Primary key or business identifier of the target entity.
    /// </summary>
    public string? TargetEntityId { get; set; }

    // ── Privacy-Preserved Patient Identity (RA 10173) ────────────────────────
    public Guid? PatientId { get; set; }

    /// <summary>
    /// Privacy-masked patient name (e.g. "J*** D***").
    /// </summary>
    public string? PatientNameMasked { get; set; }

    /// <summary>
    /// Privacy-masked PhilHealth Identification Number (e.g. "12-****5678-9").
    /// </summary>
    public string? PatientPinMasked { get; set; }

    // ── Outcome & Forensic Metadata ──────────────────────────────────────────
    /// <summary>
    /// Operational outcome: Success, Failure, Warning.
    /// </summary>
    public required string Outcome { get; set; }

    /// <summary>
    /// Human-readable forensic summary.
    /// </summary>
    public required string Description { get; set; }

    /// <summary>
    /// Sanitized JSON diff and forensic metadata with all secrets and clinical narrative prose redacted.
    /// </summary>
    public string MetadataJson { get; set; } = "{}";
}

public static class ClinicAuditCategories
{
    public const string Security = "Security";
    public const string Operations = "Operations";
    public const string Patient = "Patient";
    public const string Appointments = "Appointments";
    public const string Queue = "Queue";
    public const string Clinical = "Clinical";
    public const string Billing = "Billing";
    public const string PhilHealth = "PhilHealth";
    public const string Audit = "Audit";
}

public static class ClinicAuditSeverities
{
    public const string Routine = "Routine";
    public const string Urgent = "Urgent";
    public const string Emergency = "Emergency";
}

public static class ClinicAuditOutcomes
{
    public const string Success = "Success";
    public const string Failure = "Failure";
    public const string Warning = "Warning";
}
