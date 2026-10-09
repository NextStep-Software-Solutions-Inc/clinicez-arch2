using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// One signed-in device of a patient. A patient may hold any number of active sessions
/// (one per <see cref="DeviceId"/>); a session stays active until it is explicitly revoked.
/// </summary>
public sealed class DeviceSession : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string DeviceId { get; set; } = string.Empty;
    public string DeviceLabel { get; set; } = string.Empty;
    public string ClerkSessionId { get; set; } = string.Empty;
    public string? PushToken { get; set; }
    public DateTime LastActiveAt { get; set; }
    public bool IsRevoked { get; set; }
    public DateTime? RevokedAt { get; set; }

    public void Revoke(DateTime now)
    {
        IsRevoked = true;
        RevokedAt = now;
    }
}
