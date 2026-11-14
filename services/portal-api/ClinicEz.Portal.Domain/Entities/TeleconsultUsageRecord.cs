using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Idempotent, zero-PHI audit and billing ledger of a completed teleconsultation call session.
/// Stores duration, applied rate, and financial breakdown between prepaid deductions and postpaid overage.
/// </summary>
public class TeleconsultUsageRecord : BaseEntity
{
    /// <summary>Unique identifier of the teleconsultation call session (zero PHI, unique index).</summary>
    public Guid CallId { get; set; }

    /// <summary>Tenant identifier (string representation of Guid or slug).</summary>
    public string TenantId { get; set; } = string.Empty;

    /// <summary>Billable duration of the call in whole minutes.</summary>
    public int DurationMinutes { get; set; }

    /// <summary>Rate in PHP applied per billable minute at the time the call concluded.</summary>
    public decimal RatePerMinutePhp { get; set; }

    /// <summary>Total cost of the call session in PHP (DurationMinutes * RatePerMinutePhp).</summary>
    public decimal TotalCostPhp { get; set; }

    /// <summary>Amount deducted from Prepaid balance in PHP (for Prepaid mode).</summary>
    public decimal PrepaidDeductedPhp { get; set; }

    /// <summary>Amount accrued to Postpaid or overage invoice in PHP.</summary>
    public decimal PostpaidOveragePhp { get; set; }

    /// <summary>UTC timestamp when the room was activated / first participant joined.</summary>
    public DateTime CallStartedAtUtc { get; set; }

    /// <summary>UTC timestamp when the room was terminated / call ended.</summary>
    public DateTime CallEndedAtUtc { get; set; }
}
