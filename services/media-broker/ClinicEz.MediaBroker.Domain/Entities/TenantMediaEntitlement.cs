using System;

namespace ClinicEz.MediaBroker.Domain.Entities;

public sealed class TenantMediaEntitlement
{
    public string TenantId { get; set; } = string.Empty;
    public int CallMinutesMonthly { get; set; }
    public bool IsActive { get; set; }
    public bool AllowOverdraft { get; set; } = true;
    public bool AllowTransportOnlyFallback { get; set; } = false;
    public int Version { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}
