using System;

namespace ClinicEz.MediaBroker.Domain.Entities;

public sealed class TenantMonthlyUsage
{
    public string TenantId { get; set; } = string.Empty;
    public string YearMonth { get; set; } = string.Empty; // e.g. "2026-10"
    public int MinutesUsed { get; set; }
    public int MinutesOverdraft { get; set; }
    public int TotalCallsCompleted { get; set; }
    public DateTime LastRecordedAtUtc { get; set; } = DateTime.UtcNow;
}
