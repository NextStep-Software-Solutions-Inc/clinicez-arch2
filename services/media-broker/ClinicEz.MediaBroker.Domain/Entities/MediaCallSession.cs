using System;

namespace ClinicEz.MediaBroker.Domain.Entities;

public sealed class MediaCallSession
{
    public Guid CallId { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string RoomName { get; set; } = string.Empty;
    public string Status { get; set; } = "Requested"; // Requested, Active, Ended, Rejected
    public bool IsE2ee { get; set; } = true;
    public string? E2eeKeyHash { get; set; }
    public bool IsOverdraft { get; set; }
    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public int DurationMinutes { get; set; }
    public int BillableMinutes { get; set; }
}
