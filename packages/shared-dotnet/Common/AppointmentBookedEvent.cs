using System;

namespace ClinicEz.Shared.Common;

public record AppointmentBookedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DraftId { get; init; }
    public Guid PatientId { get; init; }
    public Guid ClinicId { get; init; }
    public string? TenantId { get; init; }
    public DateOnly? PreferredDate { get; init; }
    public string? PreferredTime { get; init; }
    public string? Reason { get; init; }
    public string? Notes { get; init; }
    public string ShareFieldsJson { get; init; } = "[]";
    public string AttachedFileIdsJson { get; init; } = "[]";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
