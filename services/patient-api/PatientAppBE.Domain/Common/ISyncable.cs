namespace PatientAppBE.Domain.Common;

/// <summary>
/// Marks an entity as participating in the offline-first sync pipeline.
/// <c>ClientId</c> is the device-generated UUID used for idempotent sync operations.
/// </summary>
public interface ISyncable
{
    Guid ClientId { get; set; }
}
