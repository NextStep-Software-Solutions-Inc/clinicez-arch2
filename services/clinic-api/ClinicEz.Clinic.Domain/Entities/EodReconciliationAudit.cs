using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EodReconciliationAudit : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public DateOnly ReconciliationDate { get; set; }
    public DateTime ReconciledAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// "Manual" (via user Force EOD) or "Automatic" (via scheduled background worker).
    /// </summary>
    public required string TriggerType { get; set; }

    public string ReconciledBy { get; set; } = string.Empty;
    public Guid? StaffId { get; set; }

    public int TotalTicketsProcessed { get; set; }
    public string AffectedTicketNumbersJson { get; set; } = "[]";
    public string? Notes { get; set; }
}
