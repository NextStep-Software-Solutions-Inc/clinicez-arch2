using System;

namespace ClinicEz.Comms.Domain.Entities;

public class EligibilityGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string FacilityType { get; set; } = string.Empty;

    public Guid PatientId { get; set; }
    public string ContextType { get; set; } = string.Empty;
    public string ContextId { get; set; } = string.Empty;

    public DateTime WindowStartUtc { get; set; }
    public DateTime WindowEndUtc { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime? RevokedAtUtc { get; set; }
    public string? RevokeReason { get; set; }

    public int Version { get; set; } = 1;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
