using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ServiceItem : ClinicScopedEntity
{
    public required string Code { get; set; }
    public required string Name { get; set; }
    /// <summary>
    /// Service category: "Consultation", "Procedure", "NursingService", "Diagnostic", "Supply", or "Dental".
    /// </summary>
    public required string Category { get; set; }
    public decimal StandardPrice { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    // PhilHealth Statutory Catalog Mapping
    public string? PhilHealthCode { get; set; }
    public string? PhilHealthDescription { get; set; }
    public bool IsPhilHealthFormulary { get; set; } = false;

    /// <summary>
    /// Indicates whether nursing staff are authorized to order this service/procedure autonomously without an attending doctor.
    /// </summary>
    public bool IsNurseOrderable { get; set; } = false;
}
