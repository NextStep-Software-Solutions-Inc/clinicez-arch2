using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class SyncLog : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string EntityType { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }      // null until server creates the entity (CREATE ops)
    public Guid IdempotencyKey { get; set; }

    public SyncOperation Operation { get; set; }
    public DateTime ClientTimestamp { get; set; }
    public DateTime ServerTimestamp { get; set; }
    public SyncStatus Status { get; set; }
    public string? ConflictDetail { get; set; }
    public string? PayloadJson { get; set; }  // Raw JSON stored for deferred Hangfire processing
}
