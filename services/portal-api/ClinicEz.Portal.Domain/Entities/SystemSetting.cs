using System;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Platform-wide runtime system configuration setting persisted in PostgreSQL.
/// Overrides default configuration values dynamically without requiring container redeployment.
/// </summary>
public class SystemSetting
{
    /// <summary>Unique configuration key (e.g., "Licensing:TtlDays", "Billing:TrialDays").</summary>
    public string Key { get; set; } = null!;

    /// <summary>Configuration value stored as string.</summary>
    public string Value { get; set; } = null!;

    /// <summary>Category grouping (Licensing, Billing, Storage, Mailer).</summary>
    public string Category { get; set; } = null!;

    /// <summary>Human-readable explanation of what this setting controls.</summary>
    public string Description { get; set; } = null!;

    /// <summary>Last time this setting was updated.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>FullName or Email of the administrator who last updated this setting.</summary>
    public string? UpdatedBy { get; set; }
}
