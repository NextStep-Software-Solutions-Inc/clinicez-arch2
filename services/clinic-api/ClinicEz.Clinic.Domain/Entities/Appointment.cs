using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class Appointment : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DraftId { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? DoctorId { get; set; }
    public string? DoctorName { get; set; }

    public DateTime ScheduledAt { get; set; }
    public int DurationMinutes { get; set; } = 30;

    private DateTime _endTimeUtc;
    public DateTime EndTimeUtc
    {
        get => _endTimeUtc == default && ScheduledAt != default
            ? ScheduledAt.AddMinutes(DurationMinutes > 0 ? DurationMinutes : 30)
            : _endTimeUtc;
        set => _endTimeUtc = value;
    }

    /// <summary>PostgreSQL xmin rowversion for optimistic concurrency checking.</summary>
    public uint Version { get; set; }

    /// <summary>
    /// Stored as string in database: "Pending", "Confirmed", "CheckedIn", "InConsultation", "Completed", "Cancelled"
    /// </summary>
    public AppointmentStatus Status { get; set; } = AppointmentStatus.Confirmed;

    public string? ServiceType { get; set; }
    public string? Reason { get; set; }
    public string? Notes { get; set; }
    public string ShareFieldsJson { get; set; } = "[]";
    public string AttachedFileIdsJson { get; set; } = "[]";

    /// <summary>The record sections the patient's booking grant covers (<c>None</c> when the booking carried no share).</summary>
    public SharingScopes SharedScopes { get; set; }

    /// <summary>The record items the patient shared with the booking, as a JSON array of <c>ShareItemDto</c>.</summary>
    public string SharedItemsJson { get; set; } = "[]";

    public bool Reminder24hSent { get; set; } = false;
    public bool Reminder2hSent { get; set; } = false;
    public DateTime? Reminder24hSentAt { get; set; }
    public DateTime? Reminder2hSentAt { get; set; }
    public DateTime? LastReminderSentAt { get; set; }
    public string? LastReminderType { get; set; }

    // ── Teleconsultation & Prepayment Gate Extensions (Milestone M4) ────────────
    public AppointmentType AppointmentType { get; set; } = AppointmentType.InPerson;

    /// <summary>
    /// Helper property returning true if appointment is a teleconsultation.
    /// Handles legacy records where ServiceType was set to "Teleconsult".
    /// </summary>
    public bool IsTeleconsult =>
        AppointmentType == AppointmentType.Teleconsult ||
        string.Equals(ServiceType, "Teleconsult", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Payment policy governing this teleconsultation: Prepaid (default), Postpaid, Exempt.
    /// </summary>
    public TeleconsultPaymentPolicy PaymentPolicy { get; set; } = TeleconsultPaymentPolicy.Prepaid;

    /// <summary>
    /// Current payment state: Pending, Paid, Exempt, Overridden.
    /// </summary>
    public TeleconsultPaymentStatus PaymentStatus { get; set; } = TeleconsultPaymentStatus.Pending;

    /// <summary>Linked invoice ID in clinic-api / billing-api.</summary>
    public Guid? InvoiceId { get; set; }

    /// <summary>Correlation ID for billing invoice requests.</summary>
    public Guid? InvoiceRequestId { get; set; }

    public decimal? PaidAmount { get; set; }
    public DateTime? PaidAt { get; set; }
    public string? PaymentReceiptNumber { get; set; }
    public string? PaymentMethod { get; set; }

    // ── Emergency Clinical Override Tracking ─────────────────────────────────
    public bool IsEmergencyOverride { get; set; } = false;
    public string? EmergencyOverrideReasonCode { get; set; }
    public string? EmergencyOverrideReasonNote { get; set; }
    public Guid? EmergencyOverrideDoctorId { get; set; }
    public string? EmergencyOverrideDoctorName { get; set; }
    public DateTime? EmergencyOverrideAtUtc { get; set; }

    // ── Teleconsultation Admission & Media Correlation ───────────────────────
    public Guid? CallId { get; set; }
    public DateTime? AdmittedAtUtc { get; set; }
    public Guid? AdmittedByDoctorId { get; set; }
}
