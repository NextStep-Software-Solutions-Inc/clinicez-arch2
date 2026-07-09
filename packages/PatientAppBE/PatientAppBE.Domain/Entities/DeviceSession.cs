using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class DeviceSession : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string DeviceId { get; set; } = string.Empty;
    public string DeviceLabel { get; set; } = string.Empty;
    public string ClerkSessionId { get; set; } = string.Empty;
    public string RedisKey { get; set; } = string.Empty;
    public string? PushToken { get; set; }
    public DateTime LastActiveAt { get; set; }
    public bool IsRevoked { get; set; }
    public DateTime? RevokedAt { get; set; }
}
