using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Events;

public sealed record ConsultationSignedDomainEvent(
    Guid EncounterId,
    Guid ClinicId,
    Guid PatientId,
    Guid DoctorId,
    string DoctorName,
    DateTime SignedAtUtc,
    Guid EventId = default,
    DateTime OccurredOnUtc = default) : IDomainEvent
{
    public Guid EventId { get; init; } = EventId == default ? Guid.NewGuid() : EventId;
    public DateTime OccurredOnUtc { get; init; } = OccurredOnUtc == default ? DateTime.UtcNow : OccurredOnUtc;
}
