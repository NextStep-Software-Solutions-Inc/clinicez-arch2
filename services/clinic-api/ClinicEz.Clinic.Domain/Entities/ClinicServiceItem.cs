using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicServiceItem : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public required string Code { get; set; }
    public required string Name { get; set; }
    public required string Category { get; set; } // Consultation, Procedure, NursingService, Diagnostic, Supply
    public decimal StandardPrice { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
