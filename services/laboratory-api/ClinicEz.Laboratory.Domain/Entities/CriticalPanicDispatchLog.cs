using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class CriticalPanicDispatchLog : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid RequisitionId { get; set; }
    public required string AccessionNumber { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public string OrderingDoctorName { get; set; } = string.Empty;
    public string OrderingFacilityName { get; set; } = string.Empty;
    public required string CriticalFindings { get; set; }
    public DateTime DispatchedAt { get; set; } = DateTime.UtcNow;
    public required string DispatchedByMedTechName { get; set; }
    public required string NotifiedDoctorName { get; set; }
    public NotificationMethod NotificationMethod { get; set; } = NotificationMethod.Telephone;
    public bool ReadbackConfirmed { get; set; }
    public string? ReadbackNotes { get; set; }
    public DateTime? AcknowledgedAt { get; set; }
}
