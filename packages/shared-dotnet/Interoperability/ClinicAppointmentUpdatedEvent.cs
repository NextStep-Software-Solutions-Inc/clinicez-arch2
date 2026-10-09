using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

/// <summary>Provider shown on a patient's appointment card.</summary>
public record ClinicAppointmentProviderDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Specialty { get; init; }
    public string? AvatarUrl { get; init; }
}

/// <summary>One appointment state change (check-in, consultation signed, ...) as the clinic sees it.</summary>
public record ClinicAppointmentSnapshotDto
{
    public string Id { get; init; } = string.Empty;
    public string ClinicId { get; init; } = string.Empty;
    public string ClinicName { get; init; } = string.Empty;
    public ClinicAppointmentProviderDto Provider { get; init; } = new();
    public string? ServiceType { get; init; }
    public string ScheduledAt { get; init; } = string.Empty;
    public int DurationMinutes { get; init; }
    public string Status { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public string? Subject { get; init; }
    public string? ChiefComplaint { get; init; }
    public string? ClinicalAssessment { get; init; }
    public string? DoctorPlan { get; init; }
    public string? PrescriptionsSummary { get; init; }
    public string? PrescriptionPublicVerificationUrl { get; init; }
    /// <summary>The patient's booking draft this appointment was created from, when it originated from a patient booking.</summary>
    public Guid? DraftId { get; init; }
}

/// <summary>
/// Envelope type <c>clinic.appointment.updated</c>: clinic -> patient-api (<c>Party.ForPatient</c>).
/// <see cref="PatientId"/> is the patient-api patient id (the clinic patient's sync id).
/// </summary>
public record ClinicAppointmentUpdatedEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public Guid ClinicId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid PatientId { get; init; }
    public List<ClinicAppointmentSnapshotDto> Appointments { get; init; } = new();
}
